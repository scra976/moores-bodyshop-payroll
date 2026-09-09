'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BLUE = [0x2e, 0x5d, 0xb8, 0xff];
const BLACK = [0, 0, 0, 0xff];

function crc32(buf) {
  let c = ~0 >>> 0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcBuf), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(pixels, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const dest = y * (size * 4 + 1);
    raw[dest] = 0;
    pixels.copy(raw, dest + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0];
    const yi = pts[i][1];
    const xj = pts[j][0];
    const yj = pts[j][1];
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function mPoly(s) {
  const p = s * 0.17;
  const t = s * 0.145;
  const L = p;
  const R = s - p;
  const T = p;
  const B = s - p;
  const mid = s / 2;
  return [
    [L, B],
    [L, T],
    [L + t, T],
    [mid, T + (B - T) * 0.46],
    [R - t, T],
    [R, T],
    [R, B],
    [R - t, B],
    [R - t, T + (B - T) * 0.42],
    [mid, B - t * 0.15],
    [L + t, T + (B - T) * 0.42],
    [L + t, B]
  ];
}

function pointInM(x, y, s) {
  return pointInPoly(x, y, mPoly(s));
}

function drawM(size) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const c = pointInM(x + 0.5, y + 0.5, size) ? BLUE : BLACK;
      pixels[i] = c[0];
      pixels[i + 1] = c[1];
      pixels[i + 2] = c[2];
      pixels[i + 3] = c[3];
    }
  }
  return pixels;
}

function pngToIco(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size;
  entry[1] = size >= 256 ? 0 : size;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, pngBuffer]);
}

const root = path.join(__dirname, '..');
const png512 = encodePng(drawM(512), 512);
const png256 = encodePng(drawM(256), 256);
const ico = pngToIco(png256, 256);

fs.writeFileSync(path.join(root, 'build', 'icon.png'), png512);
fs.writeFileSync(path.join(root, 'build', 'moores-m.png'), png512);
fs.writeFileSync(path.join(root, 'build', 'moores-m.ico'), ico);
fs.writeFileSync(path.join(root, 'src', 'main', 'moores-m.ico'), ico);
fs.writeFileSync(path.join(root, 'src', 'main', 'icon.ico'), ico);

process.stdout.write('ICON_OK 512 png + moores-m.ico\n');
