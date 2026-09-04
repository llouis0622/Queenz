#!/usr/bin/env node
/**
 * 의존성 없는 PWA 아이콘 생성기 (icons/icon-192.png, icon-512.png, icon-maskable-512.png)
 * 둥근 사각형 + 그라디언트 배경 위에 왕관 실루엣을 4x 슈퍼샘플링으로 래스터라이즈한다.
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SS = 4; // 슈퍼샘플링 배율

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 왕관 폴리곤 (24x24 좌표계, icon.svg와 동일)
const CROWN = [[4, 18], [20, 18], [21.5, 8.5], [17, 12], [12, 5], [7, 12], [2.5, 8.5]];
const BAR = { x: 4, y: 19, w: 16, h: 2.4, r: 1 };
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inRoundRect(x, y, rx, ry, w, h, r) {
  if (x < rx || y < ry || x > rx + w || y > ry + h) return false;
  const cx = Math.max(rx + r, Math.min(x, rx + w - r));
  const cy = Math.max(ry + r, Math.min(y, ry + h - r));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
const lerp = (a, b, t) => a + (b - a) * t;
const C1 = [0x6d, 0x5d, 0xfc], C2 = [0xc0, 0x4b, 0xd6];

function render(size, { maskable = false }) {
  const rgba = Buffer.alloc(size * size * 4);
  // maskable: 안전 영역(중앙 80%)에 콘텐츠, 배경은 전체 채움
  const radius = maskable ? 0 : size * (112 / 512);
  const scale = maskable ? 0.8 : 1;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const x = px + (sx + 0.5) / SS, y = py + (sy + 0.5) / SS;
      if (!inRoundRect(x, y, 0, 0, size, size, radius)) continue;
      const t = (x + y) / (2 * size);
      let cr = lerp(C1[0], C2[0], t), cg = lerp(C1[1], C2[1], t), cb = lerp(C1[2], C2[2], t);
      // 아이콘 좌표계로 변환: 중심 (256,268) 기준 15.5배 → 24x24
      const u = ((x / size) * 512 - 256) / (15.5 * scale) + 12;
      const v = ((y / size) * 512 - 268) / (15.5 * scale) + 12;
      if (inPoly(u, v, CROWN) || inRoundRect(u, v, BAR.x, BAR.y, BAR.w, BAR.h, BAR.r)) { cr = cg = cb = 255; }
      r += cr; g += cg; b += cb; a += 255;
    }
    const k = SS * SS, o = (py * size + px) * 4;
    const cov = a / k;
    if (cov > 0) { rgba[o] = Math.round(r / (a / 255)); rgba[o + 1] = Math.round(g / (a / 255)); rgba[o + 2] = Math.round(b / (a / 255)); }
    rgba[o + 3] = Math.round(cov);
  }
  return png(size, size, rgba);
}

writeFileSync('icons/icon-192.png', render(192, {}));
writeFileSync('icons/icon-512.png', render(512, {}));
writeFileSync('icons/icon-maskable-512.png', render(512, { maskable: true }));
console.log('icons/ 생성 완료');
