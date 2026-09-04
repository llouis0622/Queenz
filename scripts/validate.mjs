#!/usr/bin/env node
/** data/puzzles.json 무결성 검증: 영역 개수/연결성, 해답 규칙 준수, 유일해 */
import { readFileSync } from 'node:fs';
const file = process.argv[2] ?? 'data/puzzles.json';
const { levels } = JSON.parse(readFileSync(file, 'utf8'));
let bad = 0;
function fail(id, msg) { bad++; console.error(`#${id}: ${msg}`); }
for (const lv of levels) {
  const { id, n, regions, solution } = lv;
  if (regions.length !== n * n) { fail(id, '영역 문자열 길이 오류'); continue; }
  const reg = Array.from(regions, (ch) => ch.charCodeAt(0) - 65);
  // 영역 개수와 연결성
  const seen = new Uint8Array(n * n);
  let comps = 0;
  for (let i = 0; i < n * n; i++) {
    if (seen[i]) continue;
    comps++;
    const g = reg[i];
    const st = [i]; seen[i] = 1;
    while (st.length) {
      const cur = st.pop();
      const r = Math.floor(cur / n), c = cur % n;
      for (const x of [r > 0 && cur - n, r < n - 1 && cur + n, c > 0 && cur - 1, c < n - 1 && cur + 1]) {
        if (x !== false && !seen[x] && reg[x] === g) { seen[x] = 1; st.push(x); }
      }
    }
  }
  if (comps !== n) fail(id, `연결 영역 수 ${comps} ≠ ${n}`);
  if (new Set(reg).size !== n) fail(id, '영역 종류 수 오류');
  // 해답 검사
  if (solution.length !== n) fail(id, '해답 길이 오류');
  if (new Set(solution).size !== n) fail(id, '열 중복');
  if (new Set(solution.map((c, r) => reg[r * n + c])).size !== n) fail(id, '영역 중복');
  for (let r = 1; r < n; r++) if (Math.abs(solution[r] - solution[r - 1]) <= 1) fail(id, '퀸 인접');
  // 유일해
  const colUsed = new Array(n).fill(false), regUsed = new Array(n).fill(false), cols = [];
  let count = 0;
  (function rec(row) {
    if (count >= 2) return;
    if (row === n) { count++; return; }
    for (let c = 0; c < n; c++) {
      const g = reg[row * n + c];
      if (colUsed[c] || regUsed[g] || (row > 0 && Math.abs(cols[row - 1] - c) <= 1)) continue;
      cols[row] = c; colUsed[c] = regUsed[g] = true;
      rec(row + 1);
      colUsed[c] = regUsed[g] = false;
    }
  })(0);
  if (count !== 1) fail(id, `해 개수 ${count}`);
}
const sizes = {};
for (const lv of levels) sizes[lv.n] = (sizes[lv.n] ?? 0) + 1;
console.error(`검증 완료: ${levels.length}단계, 크기 분포 ${JSON.stringify(sizes)}, 오류 ${bad}건`);
process.exit(bad ? 1 : 0);
