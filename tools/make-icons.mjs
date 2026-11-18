// Genera los iconos PNG y SVG de la PWA sin dependencias (rasteriza un rayo sobre fondo azul con zlib).
// Uso: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const outDir = new URL('../icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });

const BG = [0x1f, 0x3a, 0x5f];
const FG = [0xff, 0xc9, 0x2e];
const BOLT = [[0.58, 0.1], [0.28, 0.55], [0.46, 0.55], [0.38, 0.9], [0.72, 0.42], [0.53, 0.42], [0.64, 0.1]];

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inRoundRect(x, y, r) {
  if (r <= 0) return true;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, { radius, scale }) {
  const ss = 3;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (x + (sx + 0.5) / ss) / size;
          const v = (y + (sy + 0.5) / ss) / size;
          if (!inRoundRect(u, v, radius)) continue;
          const bu = (u - 0.5) / scale + 0.5;
          const bv = (v - 0.5) / scale + 0.5;
          const col = inPoly(bu, bv, BOLT) ? FG : BG;
          r += col[0]; g += col[1]; b += col[2]; a += 255;
        }
      }
      const n = ss * ss;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const cov = a / 255;
      raw[o] = cov ? Math.round(r / cov) : 0;
      raw[o + 1] = cov ? Math.round(g / cov) : 0;
      raw[o + 2] = cov ? Math.round(b / cov) : 0;
      raw[o + 3] = Math.round(a / n);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const files = {
  'icon-192.png': png(192, { radius: 0.18, scale: 1 }),
  'icon-512.png': png(512, { radius: 0.18, scale: 1 }),
  'icon-maskable-512.png': png(512, { radius: 0, scale: 0.68 }),
  'apple-touch-icon.png': png(180, { radius: 0, scale: 0.8 }),
};
for (const [name, buf] of Object.entries(files)) writeFileSync(new URL(name, outDir), buf);

const pts = BOLT.map(([x, y]) => `${(x * 512).toFixed(0)},${(y * 512).toFixed(0)}`).join(' ');
writeFileSync(
  new URL('icon.svg', outDir),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="92" fill="#1f3a5f"/><polygon points="${pts}" fill="#ffc92e"/></svg>\n`,
);
console.log('Iconos generados:', Object.keys(files).join(', '), 'icon.svg');
