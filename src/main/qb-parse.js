'use strict';

const zlib = require('zlib');
const path = require('path');

function parseCsv(text) {
  const src = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      if (cell.endsWith('\r')) cell = cell.slice(0, -1);
      row.push(cell);
      if (row.some((c) => String(c).trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((c) => String(c).trim() !== '')) rows.push(row);
  }
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map((h, i) => String(h || '').trim() || `Column ${i + 1}`);
  const body = rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = r[i] != null ? String(r[i]).trim() : '';
    });
    return obj;
  });
  return { headers, rows: body };
}

function readZipEntries(buf) {
  const entries = {};
  let offset = 0;
  while (offset + 30 <= buf.length) {
    if (buf[offset] !== 0x50 || buf[offset + 1] !== 0x4b) break;
    if (buf[offset + 2] === 0x01 && buf[offset + 3] === 0x02) break;
    if (buf[offset + 2] !== 0x03 || buf[offset + 3] !== 0x04) break;
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const uncompSize = buf.readUInt32LE(offset + 22);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.slice(offset + 30, offset + 30 + nameLen).toString('utf8');
    const start = offset + 30 + nameLen + extraLen;
    const packed = buf.slice(start, start + compSize);
    let data;
    if (method === 0) data = packed;
    else if (method === 8) data = zlib.inflateRawSync(packed);
    else data = null;
    if (data) entries[name.replace(/\\/g, '/')] = data;
    offset = start + compSize;
    if (!uncompSize && !compSize) break;
  }
  return entries;
}

function xmlTexts(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function decodeXml(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, '');
}

function colIndex(ref) {
  const m = String(ref || '').match(/^[A-Z]+/i);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[0].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSharedStrings(xml) {
  const out = [];
  const sis = xml.split(/<si[ >]/i).slice(1);
  for (const block of sis) {
    const texts = [];
    const re = /<t[^>]*>([\s\S]*?)<\/t>/gi;
    let m;
    while ((m = re.exec(block))) texts.push(decodeXml(m[1]));
    out.push(texts.join(''));
  }
  return out;
}

function parseSheet(xml, strings) {
  const rows = [];
  const rowBlocks = xml.split(/<row[\s>]/i).slice(1);
  for (const block of rowBlocks) {
    const cells = [];
    const re = /<c([^>]*)>([\s\S]*?)<\/c>/gi;
    let m;
    while ((m = re.exec(block))) {
      const attrs = m[1];
      const inner = m[2];
      const ref = (attrs.match(/\br="([^"]+)"/) || [])[1] || '';
      const t = (attrs.match(/\bt="([^"]+)"/) || [])[1] || '';
      const idx = colIndex(ref);
      let val = '';
      if (t === 's') {
        const v = (inner.match(/<v[^>]*>([\s\S]*?)<\/v>/i) || [])[1];
        val = strings[Number(v)] || '';
      } else if (t === 'inlineStr') {
        val = decodeXml((inner.match(/<t[^>]*>([\s\S]*?)<\/t>/i) || [])[1] || '');
      } else {
        val = decodeXml((inner.match(/<v[^>]*>([\s\S]*?)<\/v>/i) || [])[1] || '');
      }
      cells[idx] = val;
    }
    if (cells.some((c) => String(c || '').trim() !== '')) rows.push(cells);
  }
  return rows;
}

function parseXlsx(buf) {
  const entries = readZipEntries(buf);
  const sheetName = Object.keys(entries).find((k) => /xl\/worksheets\/sheet1\.xml$/i.test(k));
  if (!sheetName) throw new Error('No worksheet found in this Excel file.');
  const ssXml = (entries['xl/sharedStrings.xml'] || Buffer.alloc(0)).toString('utf8');
  const strings = parseSharedStrings(ssXml);
  const grid = parseSheet(entries[sheetName].toString('utf8'), strings);
  if (!grid.length) return { headers: [], rows: [] };
  const headers = grid[0].map((h, i) => String(h || '').trim() || `Column ${i + 1}`);
  const rows = grid.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = r[i] != null ? String(r[i]).trim() : '';
    });
    return obj;
  });
  return { headers, rows };
}

function parseTableBuffer(filePath, buffer) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (ext === '.xls') {
    return {
      ok: false,
      message: 'QuickBooks .xls (old Excel) cannot be opened here. In QuickBooks use File → Export → CSV, or save the Excel file as .xlsx or .csv.'
    };
  }
  if (ext === '.qbw' || ext === '.qbb' || ext === '.qbm') {
    return {
      ok: false,
      message: 'A QuickBooks company file (.QBW) cannot be opened. Export a CSV or Excel list from Customer Center, Vendor Center, or Payroll, then import that file.'
    };
  }
  try {
    if (ext === '.xlsx' || (Buffer.isBuffer(buffer) && buffer[0] === 0x50 && buffer[1] === 0x4b)) {
      const table = parseXlsx(buffer);
      return { ok: true, ...table, kind: 'xlsx' };
    }
    const table = parseCsv(buffer.toString('utf8'));
    return { ok: true, ...table, kind: 'csv' };
  } catch (err) {
    return {
      ok: false,
      message:
        (err && err.message ? String(err.message) : 'Could not read this file.') +
        ' Export CSV from QuickBooks and try again.'
    };
  }
}

module.exports = { parseCsv, parseXlsx, parseTableBuffer };
