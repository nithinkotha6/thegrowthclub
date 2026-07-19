// One-off script: generates real, valid PWA icon files (not stubs) using
// raw zlib-deflate PNG chunk construction — no external image library
// dependency needed. Run once via `node scratch/generate-pwa-icons.js`.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Brand palette: dark charcoal background (#111827) with a lime accent ring
// (#CEFF00), matching the app's existing badge/avatar styling.
const BG = [0x11, 0x18, 0x27]; // #111827
const FG = [0xce, 0xff, 0x00]; // #CEFF00

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/** Builds a raw RGB PNG buffer of size x size: a dark-charcoal square with a
 * centered lime circle (a simple, recognizable app-icon "dot" motif). */
function buildPng(size) {
  const raw = Buffer.alloc(size * (1 + size * 3)); // +1 filter byte per row
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.32;

  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const inCircle = dx * dx + dy * dy <= r * r;
      const color = inCircle ? FG : BG;
      raw[offset++] = color[0];
      raw[offset++] = color[1];
      raw[offset++] = color[2];
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: RGB
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = chunk('IHDR', ihdrData);
  const idat = chunk('IDAT', zlib.deflateSync(raw));
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

/** Wraps a single PNG buffer in a minimal, valid .ico container (modern ICO
 * format allows embedding PNG-compressed image data directly). */
function buildIco(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count

  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size; // width
  entry[1] = size >= 256 ? 0 : size; // height
  entry[2] = 0; // color palette
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32BE(pngBuffer.length, 8); // wait: little-endian per spec
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(6 + 16, 12); // offset

  return Buffer.concat([header, entry, pngBuffer]);
}

fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-192.png'), buildPng(192));
fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-512.png'), buildPng(512));
fs.writeFileSync(path.join(PUBLIC_DIR, 'apple-touch-icon.png'), buildPng(180));
const faviconPng = buildPng(32);
fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), buildIco(faviconPng, 32));

console.log('Generated icon-192.png, icon-512.png, apple-touch-icon.png, favicon.ico in public/');
