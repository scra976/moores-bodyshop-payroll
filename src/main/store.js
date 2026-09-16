'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { app, safeStorage } = require('electron');

const booksEngine = require('../renderer/books');
const bankingEngine = require('../renderer/banking');

const MAGIC = Buffer.from('MBSPAY01');
const FLAG_ENCRYPTED = 0x01;
const FLAG_PLAIN = 0x00;
const MAX_BACKUPS = 20;
const DEFAULT_UPDATE_URL = 'https://github.com/scra976/moores-bodyshop-payroll/releases/latest/download/';

const DEFAULT_ADDRESS = {
  street: '821 Kabrich Street',
  city: 'Blacksburg',
  state: 'VA',
  zip: '24060'
};

function shopRoot() {
  return path.join(app.getPath('appData'), 'MooresBodyShop');
}

function dataRoot() {
  return path.join(shopRoot(), 'payroll');
}

function booksDir() {
  return path.join(shopRoot(), 'books');
}

function receiptsDir() {
  return path.join(shopRoot(), 'receipts');
}

function shopBackupsDir() {
  return path.join(shopRoot(), 'backups');
}

function booksPath() {
  return path.join(booksDir(), 'books.json');
}

function banksPath() {
  return path.join(booksDir(), 'banks.json');
}

function reconcileDocsRoot() {
  return path.join(booksDir(), 'reconcile-docs');
}

function receiptsIndexPath() {
  return path.join(receiptsDir(), 'receipts.json');
}

function employeesPath() {
  return path.join(dataRoot(), 'employees.json.enc');
}

function settingsPath() {
  return path.join(dataRoot(), 'settings.json');
}

function backupsDir() {
  return path.join(dataRoot(), 'backups');
}

function reportsDir() {
  return path.join(dataRoot(), 'reports');
}

function encryptionAvailable() {
  try {
    return Boolean(safeStorage.isEncryptionAvailable());
  } catch {
    return false;
  }
}

function defaultSettings() {
  return {
    updateUrl: DEFAULT_UPDATE_URL,
    channel: 'stable',
    lastChecked: null,
    checkOnStartup: false,
    vacationHoursPerYear: 40,
    ptoHoursPerYear: 40,
    ein: '',
    vaAccount: '',
    vaUiAccount: '',
    uiMode: 'novice',
    devMode: false
  };
}

function seedData() {
  return {
    version: 1,
    company: {
      name: "Moore's Body Shop",
      address: { ...DEFAULT_ADDRESS }
    },
    employees: []
  };
}

async function ensureDirs() {
  await fsp.mkdir(shopRoot(), { recursive: true });
  await fsp.mkdir(dataRoot(), { recursive: true });
  await fsp.mkdir(backupsDir(), { recursive: true });
  await fsp.mkdir(reportsDir(), { recursive: true });
  await fsp.mkdir(booksDir(), { recursive: true });
  await fsp.mkdir(receiptsDir(), { recursive: true });
  await fsp.mkdir(shopBackupsDir(), { recursive: true });
  await fsp.mkdir(reconcileDocsRoot(), { recursive: true });
}

function wrapPayload(jsonUtf8Buffer) {
  if (encryptionAvailable()) {
    const encrypted = safeStorage.encryptString(jsonUtf8Buffer.toString('utf8'));
    return Buffer.concat([MAGIC, Buffer.from([FLAG_ENCRYPTED]), encrypted]);
  }
  return Buffer.concat([MAGIC, Buffer.from([FLAG_PLAIN]), jsonUtf8Buffer]);
}

function unwrapPayload(buf) {
  if (!Buffer.isBuffer(buf)) {
    buf = Buffer.from(buf);
  }
  if (buf.length >= MAGIC.length + 1 && buf.subarray(0, MAGIC.length).equals(MAGIC)) {
    const flag = buf[MAGIC.length];
    const body = buf.subarray(MAGIC.length + 1);
    if (flag === FLAG_ENCRYPTED) {
      if (!encryptionAvailable()) {
        const err = new Error(
          'This file was encrypted on another Windows user profile and cannot be opened here.'
        );
        err.code = 'ENC_UNAVAILABLE';
        throw err;
      }
      try {
        return safeStorage.decryptString(body);
      } catch {
        const err = new Error(
          'Could not decrypt this backup. Encrypted backups can only be opened by the same Windows user who created them. Use a decrypted JSON backup to move data to another PC.'
        );
        err.code = 'DEC_FAIL';
        throw err;
      }
    }
    return body.toString('utf8');
  }

  const asText = buf.toString('utf8');
  const trimmed = asText.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return asText;
  }

  if (encryptionAvailable()) {
    try {
      return safeStorage.decryptString(buf);
    } catch {
      /* not a raw safeStorage blob */
    }
  }

  const err = new Error('Unrecognized payroll data file.');
  err.code = 'BAD_FORMAT';
  throw err;
}

async function atomicWrite(filePath, buffer) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const dir = path.dirname(filePath);
  const tmp = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  const fh = await fsp.open(tmp, 'w');
  try {
    await fh.write(buffer, 0, buffer.length, 0);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await replaceFile(tmp, filePath);
}

async function replaceFile(tmp, dest) {
  try {
    await fsp.rename(tmp, dest);
    return;
  } catch {
    /* Windows cannot rename over an existing file */
  }

  const bak = `${dest}.${process.pid}.swap`;
  try {
    await fsp.unlink(bak);
  } catch {
    /* no previous swap */
  }

  try {
    await fsp.rename(dest, bak);
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      await fsp.copyFile(tmp, dest);
      await fsp.unlink(tmp).catch(() => {});
      return;
    }
  }

  try {
    await fsp.rename(tmp, dest);
  } catch {
    await fsp.copyFile(tmp, dest);
    await fsp.unlink(tmp).catch(() => {});
  }

  await fsp.unlink(bak).catch(() => {});
}

function backupStamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  );
}

async function writeBackup(payload) {
  await fsp.mkdir(backupsDir(), { recursive: true });
  const name = `employees-${backupStamp()}.json.enc`;
  const dest = path.join(backupsDir(), name);
  const fh = await fsp.open(dest, 'w');
  try {
    await fh.write(payload, 0, payload.length, 0);
    await fh.sync();
  } finally {
    await fh.close();
  }
}

async function pruneBackups() {
  let entries;
  try {
    entries = await fsp.readdir(backupsDir(), { withFileTypes: true });
  } catch {
    return;
  }
  const files = entries
    .filter((e) => e.isFile() && /^employees-\d{8}-\d{6}\.json\.enc$/i.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();

  const extra = files.slice(MAX_BACKUPS);
  await Promise.all(
    extra.map((name) => fsp.unlink(path.join(backupsDir(), name)).catch(() => {}))
  );
}

function parseEmployeesJson(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Payroll file is not a valid database object.');
  }
  if (!Array.isArray(parsed.employees)) {
    parsed.employees = [];
  }
  if (!parsed.company || typeof parsed.company !== 'object') {
    parsed.company = { name: "Moore's Body Shop", address: { ...DEFAULT_ADDRESS } };
  }
  if (!parsed.version) parsed.version = 1;
  return parsed;
}

async function readEmployeesFile(filePath) {
  const buf = await fsp.readFile(filePath);
  const text = unwrapPayload(buf);
  return parseEmployeesJson(text);
}

async function tryRecoverFromBackups() {
  let entries;
  try {
    entries = await fsp.readdir(backupsDir());
  } catch {
    return null;
  }
  const files = entries
    .filter((name) => /^employees-\d{8}-\d{6}\.json\.enc$/i.test(name))
    .sort()
    .reverse();
  for (const name of files) {
    try {
      return await readEmployeesFile(path.join(backupsDir(), name));
    } catch {
      /* try older */
    }
  }
  return null;
}

async function loadEmployees() {
  await ensureDirs();
  const live = employeesPath();
  try {
    await fsp.access(live, fs.constants.F_OK);
  } catch {
    const seeded = seedData();
    await saveEmployees(seeded);
    return seeded;
  }

  try {
    return await readEmployeesFile(live);
  } catch {
    const recovered = await tryRecoverFromBackups();
    if (recovered) {
      return recovered;
    }
    throw new Error('Could not read the payroll database. Restore a backup from Settings.');
  }
}

async function saveEmployees(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid payroll payload.');
  }
  if (!Array.isArray(data.employees)) {
    throw new Error('Invalid payroll payload.');
  }
  await ensureDirs();
  const json = Buffer.from(JSON.stringify(data), 'utf8');
  const payload = wrapPayload(json);
  await atomicWrite(employeesPath(), payload);
  await writeBackup(payload);
  await pruneBackups();
  return { ok: true, encryptionAvailable: encryptionAvailable() };
}

async function loadSettings() {
  await ensureDirs();
  const existing = await readSettingsFile();
  try {
    await fsp.access(settingsPath(), fs.constants.F_OK);
    let rawUrl = '';
    let parsed = {};
    try {
      parsed = JSON.parse(await fsp.readFile(settingsPath(), 'utf8')) || {};
      rawUrl = parsed.updateUrl;
    } catch {
      rawUrl = '';
      parsed = {};
    }
    if (isPlaceholderFeed(rawUrl) && existing.updateUrl === DEFAULT_UPDATE_URL) {
      return saveSettings({ updateUrl: DEFAULT_UPDATE_URL });
    }
    return existing;
  } catch {
    await saveSettings(existing);
    return existing;
  }
}

function isPlaceholderFeed(url) {
  const u = String(url || '').trim();
  return !u || u.includes('updates.mooresbodyshop.local');
}

function sanitizeSettings(patch) {
  const next = { ...defaultSettings(), ...(patch && typeof patch === 'object' ? patch : {}) };
  next.channel = 'stable';
  next.checkOnStartup = Boolean(next.checkOnStartup);
  if (typeof next.updateUrl !== 'string' || isPlaceholderFeed(next.updateUrl)) {
    next.updateUrl = DEFAULT_UPDATE_URL;
  }
  next.updateUrl = next.updateUrl.trim();
  if (next.updateUrl && !next.updateUrl.endsWith('/')) next.updateUrl += '/';
  if ('lastChecked' in (patch || {})) next.lastChecked = patch.lastChecked;
  const vac = Number(next.vacationHoursPerYear);
  const pto = Number(next.ptoHoursPerYear);
  const allowed = {
    updateUrl: next.updateUrl,
    channel: next.channel,
    lastChecked: next.lastChecked ?? null,
    checkOnStartup: next.checkOnStartup,
    vacationHoursPerYear: Number.isFinite(vac) && vac >= 0 ? Math.round(vac * 100) / 100 : 40,
    ptoHoursPerYear: Number.isFinite(pto) && pto >= 0 ? Math.round(pto * 100) / 100 : 40,
    ein: String(next.ein || '').replace(/[^\d]/g, '').slice(0, 9),
    vaAccount: String(next.vaAccount || '').trim().slice(0, 32),
    vaUiAccount: String(next.vaUiAccount || '').trim().slice(0, 32),
    uiMode: String(next.uiMode || 'novice').toLowerCase() === 'expert' ? 'expert' : 'novice',
    devMode: Boolean(next.devMode)
  };
  return allowed;
}

async function readSettingsFile() {
  try {
    const text = await fsp.readFile(settingsPath(), 'utf8');
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaultSettings();
    return sanitizeSettings({ ...defaultSettings(), ...parsed });
  } catch {
    return defaultSettings();
  }
}

async function saveSettings(patch) {
  await ensureDirs();
  const current = await readSettingsFile();
  const next = sanitizeSettings({ ...current, ...patch });
  const json = Buffer.from(`${JSON.stringify(next, null, 2)}\n`, 'utf8');
  await atomicWrite(settingsPath(), json);
  return next;
}

function getMeta() {
  return {
    version: app.getVersion(),
    appId: 'com.mooresbodyshop.payroll',
    shopRoot: shopRoot(),
    dataPath: dataRoot(),
    payrollPath: dataRoot(),
    booksPath: booksDir(),
    receiptsPath: receiptsDir(),
    backupsPath: shopBackupsDir(),
    employeesFile: employeesPath(),
    reportsPath: reportsDir(),
    encryptionAvailable: encryptionAvailable(),
    companyName: "Moore's Body Shop"
  };
}

function safeReportName(name) {
  const base = String(name || 'report').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim();
  const withExt = /\.pdf$/i.test(base) ? base : `${base}.pdf`;
  return withExt.slice(0, 120) || 'report.pdf';
}

async function saveReportPdf(subdir, fileName, buffer) {
  await ensureDirs();
  const folder = subdir ? path.join(reportsDir(), String(subdir).replace(/[<>:"/\\|?*]+/g, '-')) : reportsDir();
  await fsp.mkdir(folder, { recursive: true });
  const dest = path.join(folder, safeReportName(fileName));
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  await atomicWrite(dest, buf);
  return dest;
}

async function listReports() {
  await ensureDirs();
  const root = reportsDir();
  const out = [];
  async function walk(dir, rel) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const nextRel = rel ? `${rel}/${e.name}` : e.name;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full, nextRel);
      else if (/\.pdf$/i.test(e.name)) {
        const st = await fsp.stat(full);
        out.push({
          name: e.name,
          rel: nextRel,
          folder: rel || '',
          size: st.size,
          mtime: st.mtime.toISOString()
        });
      }
    }
  }
  await walk(root, '');
  out.sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)));
  return out;
}

function resolveReportPath(rel) {
  const root = reportsDir();
  const dest = path.resolve(root, String(rel || ''));
  const rootFull = path.resolve(root);
  if (dest !== rootFull && !dest.startsWith(rootFull + path.sep)) {
    throw new Error('Invalid report path.');
  }
  return dest;
}

async function exportEncryptedTo(destPath) {
  await ensureDirs();
  const live = employeesPath();
  await fsp.access(live, fs.constants.F_OK);
  await fsp.copyFile(live, destPath);
}

async function exportDecryptedTo(destPath) {
  const data = await loadEmployees();
  const json = `${JSON.stringify(data, null, 2)}\n`;
  const buf = Buffer.from(json, 'utf8');
  await atomicWrite(destPath, buf);
}

async function importFrom(filePath, mode) {
  const buf = await fsp.readFile(filePath);
  const incoming = parseEmployeesJson(unwrapPayload(buf));
  if (mode === 'replace') {
    await saveEmployees(incoming);
    return incoming;
  }

  const current = await loadEmployees();
  const byId = new Map(current.employees.map((e) => [e.id, e]));
  for (const emp of incoming.employees) {
    if (!emp || !emp.id) continue;
    byId.set(emp.id, emp);
  }
  const merged = {
    ...current,
    ...incoming,
    company: incoming.company || current.company,
    employees: Array.from(byId.values())
  };
  await saveEmployees(merged);
  return merged;
}

async function writeShopBackup(books) {
  await fsp.mkdir(shopBackupsDir(), { recursive: true });
  const name = `books-${backupStamp()}.json`;
  const dest = path.join(shopBackupsDir(), name);
  const json = Buffer.from(`${JSON.stringify(books)}\n`, 'utf8');
  await atomicWrite(dest, json);
  let entries;
  try {
    entries = await fsp.readdir(shopBackupsDir(), { withFileTypes: true });
  } catch {
    return;
  }
  const files = entries
    .filter((e) => e.isFile() && /^books-\d{8}-\d{6}\.json$/i.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
  const extra = files.slice(MAX_BACKUPS);
  await Promise.all(extra.map((n) => fsp.unlink(path.join(shopBackupsDir(), n)).catch(() => {})));
}

function safeReconId(id) {
  const s = String(id || '');
  if (!/^[a-zA-Z0-9._-]+$/.test(s)) {
    throw new Error('Invalid reconciliation id.');
  }
  return s;
}

function safeStoredName(name) {
  const base = path.basename(String(name || ''));
  if (!base || base === '.' || base === '..') throw new Error('Invalid file name.');
  return base.replace(/[^\w.\- ()]/g, '_').slice(0, 120);
}

function reconDocDir(reconId) {
  return path.join(reconcileDocsRoot(), safeReconId(reconId));
}

function mimeForExt(ext) {
  const e = String(ext || '').toLowerCase();
  if (e === '.pdf') return 'application/pdf';
  if (e === '.png') return 'image/png';
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
  return '';
}

async function overlayBanksFile(books) {
  try {
    const text = await fsp.readFile(banksPath(), 'utf8');
    const parsed = JSON.parse(text);
    if (parsed && Array.isArray(parsed.banks) && parsed.banks.length) {
      books.banks = parsed.banks;
    }
    if (parsed && Array.isArray(parsed.reconciliations)) {
      books.reconciliations = parsed.reconciliations;
    }
  } catch {
    /* banks.json is created on first save */
  }
  bankingEngine.ensureBanks(books);
  return books;
}

async function saveBanksFile(books) {
  bankingEngine.ensureBanks(books);
  const payload = {
    version: 1,
    banks: books.banks || [],
    reconciliations: books.reconciliations || []
  };
  const json = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await atomicWrite(banksPath(), json);
}

async function loadBooks() {
  await ensureDirs();
  const live = booksPath();
  try {
    await fsp.access(live, fs.constants.F_OK);
  } catch {
    const seeded = booksEngine.seedBooks();
    bankingEngine.ensureBanks(seeded);
    await saveBooks(seeded);
    return seeded;
  }
  try {
    const text = await fsp.readFile(live, 'utf8');
    const parsed = JSON.parse(text);
    const books = booksEngine.normalize(parsed);
    await overlayBanksFile(books);
    return books;
  } catch (err) {
    const message = err && err.message ? String(err.message) : 'Could not read books.';
    throw new Error(message);
  }
}

async function saveBooks(data) {
  const books = booksEngine.normalize(data);
  bankingEngine.ensureBanks(books);
  await ensureDirs();
  const json = Buffer.from(`${JSON.stringify(books, null, 2)}\n`, 'utf8');
  await atomicWrite(booksPath(), json);
  await saveBanksFile(books);
  const receiptsJson = Buffer.from(`${JSON.stringify({ version: 2, receipts: books.receipts }, null, 2)}\n`, 'utf8');
  await atomicWrite(receiptsIndexPath(), receiptsJson);
  await writeShopBackup(books);
  return { ok: true };
}

async function attachReconDocs(reconId, filePaths) {
  await ensureDirs();
  const destDir = reconDocDir(reconId);
  await fsp.mkdir(destDir, { recursive: true });
  const allowed = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
  const files = [];
  let i = 0;
  for (const src of filePaths || []) {
    const ext = path.extname(String(src || '')).toLowerCase();
    if (!allowed.has(ext)) {
      throw new Error('Attach PDF, JPG, or PNG only.');
    }
    const original = safeStoredName(src);
    i += 1;
    const storedName = `${Date.now().toString(36)}-${i}-${original}`;
    const dest = path.join(destDir, storedName);
    await fsp.copyFile(String(src), dest);
    files.push({
      id: `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: path.basename(String(src)),
      storedName,
      mime: mimeForExt(ext),
      addedAt: new Date().toISOString()
    });
  }
  return files;
}

function reconDocPath(reconId, storedName) {
  const destDir = reconDocDir(reconId);
  const name = safeStoredName(storedName);
  const dest = path.join(destDir, name);
  const resolved = path.resolve(dest);
  if (!resolved.startsWith(path.resolve(destDir))) {
    throw new Error('Invalid attachment path.');
  }
  return resolved;
}

async function openReconDoc(reconId, storedName) {
  const dest = reconDocPath(reconId, storedName);
  await fsp.access(dest, fs.constants.F_OK);
  return dest;
}

async function removeReconDoc(reconId, storedName) {
  const dest = reconDocPath(reconId, storedName);
  await fsp.unlink(dest).catch(() => {});
  return { ok: true };
}

async function writeImportLog(text) {
  await ensureDirs();
  const dest = path.join(shopRoot(), 'import-log.txt');
  const buf = Buffer.from(String(text || ''), 'utf8');
  await atomicWrite(dest, buf);
  return dest;
}

async function saveReceiptPdf(fileName, buffer) {
  await ensureDirs();
  const dest = path.join(receiptsDir(), safeReportName(fileName));
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  await atomicWrite(dest, buf);
  return dest;
}

module.exports = {
  DEFAULT_UPDATE_URL,
  DEFAULT_ADDRESS,
  shopRoot,
  dataRoot,
  booksDir,
  receiptsDir,
  shopBackupsDir,
  booksPath,
  banksPath,
  reconcileDocsRoot,
  attachReconDocs,
  openReconDoc,
  removeReconDoc,
  employeesPath,
  settingsPath,
  backupsDir,
  reportsDir,
  saveReportPdf,
  saveReceiptPdf,
  writeImportLog,
  listReports,
  resolveReportPath,
  safeReportName,
  encryptionAvailable,
  defaultSettings,
  seedData,
  ensureDirs,
  loadEmployees,
  saveEmployees,
  loadSettings,
  saveSettings,
  loadBooks,
  saveBooks,
  getMeta,
  exportEncryptedTo,
  exportDecryptedTo,
  importFrom,
  wrapPayload,
  unwrapPayload
};
