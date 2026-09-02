'use strict';

const fs = require('fs');
const path = require('path');

function pngToIco(pngBuffer) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry[0] = 0;
  entry[1] = 0;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(22, 12);

  return Buffer.concat([header, entry, pngBuffer]);
}

const pngPath = process.argv[2];
const icoPath = process.argv[3];
if (!pngPath || !icoPath) {
  process.stderr.write('Usage: node png-to-ico.js <in.png> <out.ico>\n');
  process.exit(1);
}

const png = fs.readFileSync(path.resolve(pngPath));
if (png[0] !== 0x89 || png[1] !== 0x50) {
  process.stderr.write('Input is not a PNG file.\n');
  process.exit(1);
}
fs.writeFileSync(path.resolve(icoPath), pngToIco(png));
