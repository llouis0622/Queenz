#!/usr/bin/env node
/**
 * Queenz 퍼즐 생성기
 *
 * 규칙(링크드인 Queens):
 *  - N×N 보드, N개의 색 영역
 *  - 각 행/열/영역에 퀸이 정확히 하나
 *  - 퀸끼리 대각선 포함 서로 인접(붙어) 있을 수 없음
 *
 * 생성 절차:
 *  1. 규칙을 만족하는 퀸 배치를 무작위로 생성
 *  2. 각 퀸을 씨앗으로 영역을 무작위 확장(연결된 영역 보장)
 *  3. 해가 정확히 하나인지 검증, 아니면 재시도
 *  4. 같은 크기 안에서는 탐색 노드 수(난이도 지표) 순으로 정렬
 *
 * 사용법: node scripts/generate.mjs [--count 500] [--seed 20260904] [--out data/puzzles.json]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const TOTAL = Number(args.count ?? 500);
const SEED = Number(args.seed ?? 20260904);
const OUT = args.out ?? 'data/puzzles.json';

// 크기별 단계 분포 (합계 500 기준 비율, TOTAL이 달라도 비율 유지)
const SIZE_PLAN = [
  [5, 30],
  [6, 60],
  [7, 90],
  [8, 100],
  [9, 100],
  [10, 70],
  [11, 50],
];

// ---------- 결정적 난수 (mulberry32) ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const randInt = (n) => Math.floor(rand() * n);
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- 1. 퀸 배치 ----------
function placeQueens(n) {
  const cols = new Array(n).fill(-1);
  const used = new Array(n).fill(false);
  function rec(row) {
    if (row === n) return true;
    const order = shuffle([...Array(n).keys()]);
    for (const c of order) {
      if (used[c]) continue;
      if (row > 0 && Math.abs(cols[row - 1] - c) <= 1) continue;
      cols[row] = c;
      used[c] = true;
      if (rec(row + 1)) return true;
      used[c] = false;
      cols[row] = -1;
    }
    return false;
  }
  rec(0);
  return cols;
}

// ---------- 2. 영역 확장 ----------
function growRegions(n, queens) {
  const region = new Int8Array(n * n).fill(-1);
  const frontier = []; // 영역별 후보 셀 목록
  for (let r = 0; r < n; r++) {
    region[r * n + queens[r]] = r;
    frontier.push([r * n + queens[r]]);
  }
  // 영역별 성장 가중치: 어떤 영역은 크게, 어떤 영역은 작게 → 모양 다양화
  const weight = Array.from({ length: n }, () => 0.35 + rand() * 1.3);
  let remaining = n * n - n;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (remaining > 0) {
    // 확장 가능한 영역 중 가중치로 하나 선택
    const candidates = [];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      if (frontier[i].length) {
        candidates.push(i);
        sum += weight[i];
      }
    }
    if (!candidates.length) return null; // 이론상 발생하지 않음
    let pick = rand() * sum;
    let g = candidates[candidates.length - 1];
    for (const i of candidates) {
      pick -= weight[i];
      if (pick <= 0) {
        g = i;
        break;
      }
    }
    // 그 영역의 셀 하나에서 빈 이웃 하나로 확장
    const f = frontier[g];
    const idx = randInt(f.length);
    const cell = f[idx];
    const r = Math.floor(cell / n);
    const c = cell % n;
    const empties = [];
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
      if (region[nr * n + nc] === -1) empties.push(nr * n + nc);
    }
    if (!empties.length) {
      f[idx] = f[f.length - 1];
      f.pop();
      continue;
    }
    const target = empties[randInt(empties.length)];
    region[target] = g;
    f.push(target);
    remaining--;
  }
  return region;
}

// ---------- 3. 해 개수 세기 ----------
function countSolutions(n, region, limit = 2) {
  const colUsed = new Array(n).fill(false);
  const regUsed = new Array(n).fill(false);
  const cols = new Array(n).fill(-1);
  let count = 0;
  let nodes = 0;
  const found = [];
  // 각 영역의 최소/최대 행 (행 순서 가지치기용)
  const regMinRow = new Array(n).fill(n);
  const regMaxRow = new Array(n).fill(-1);
  for (let i = 0; i < n * n; i++) {
    const g = region[i];
    const r = Math.floor(i / n);
    if (r < regMinRow[g]) regMinRow[g] = r;
    if (r > regMaxRow[g]) regMaxRow[g] = r;
  }
  function rec(row) {
    if (count >= limit) return;
    if (row === n) {
      count++;
      found.push(cols.slice());
      return;
    }
    // 가지치기: 아직 안 쓴 영역 중 마지막 행이 현재 행보다 앞이면 불가능
    for (let g = 0; g < n; g++) {
      if (!regUsed[g] && regMaxRow[g] < row) return;
    }
    for (let c = 0; c < n; c++) {
      if (colUsed[c]) continue;
      const g = region[row * n + c];
      if (regUsed[g]) continue;
      if (row > 0 && Math.abs(cols[row - 1] - c) <= 1) continue;
      nodes++;
      cols[row] = c;
      colUsed[c] = true;
      regUsed[g] = true;
      rec(row + 1);
      colUsed[c] = false;
      regUsed[g] = false;
      cols[row] = -1;
    }
  }
  rec(0);
  return { count, nodes, found };
}

// ---------- 3b. 모호성 보수 ----------
// 영역 g에서 cell을 제거해도 g가 연결 상태를 유지하는지 검사
function staysConnected(n, region, g, cell) {
  let start = -1;
  let size = 0;
  for (let i = 0; i < n * n; i++) {
    if (region[i] === g && i !== cell) {
      if (start === -1) start = i;
      size++;
    }
  }
  if (size === 0) return false;
  const seen = new Uint8Array(n * n);
  const stack = [start];
  seen[start] = 1;
  let visited = 0;
  while (stack.length) {
    const cur = stack.pop();
    visited++;
    const r = Math.floor(cur / n);
    const c = cur % n;
    const nb = [];
    if (r > 0) nb.push(cur - n);
    if (r < n - 1) nb.push(cur + n);
    if (c > 0) nb.push(cur - 1);
    if (c < n - 1) nb.push(cur + 1);
    for (const x of nb) {
      if (!seen[x] && x !== cell && region[x] === g) {
        seen[x] = 1;
        stack.push(x);
      }
    }
  }
  return visited === size;
}

// 다른 해(other)의 퀸 셀 중 하나를 이웃 영역으로 옮겨 그 해를 깨뜨린다.
// 의도한 해(queens)의 퀸 셀은 절대 옮기지 않는다.
function breakSolution(n, region, queens, other) {
  const rows = shuffle([...Array(n).keys()]);
  for (const r of rows) {
    if (other[r] === queens[r]) continue;
    const cell = r * n + other[r];
    const g = region[cell];
    if (cell === r * n + queens[r]) continue;
    const c = other[r];
    const nb = [];
    if (r > 0) nb.push(cell - n);
    if (r < n - 1) nb.push(cell + n);
    if (c > 0) nb.push(cell - 1);
    if (c < n - 1) nb.push(cell + 1);
    const targets = shuffle([...new Set(nb.map((x) => region[x]).filter((x) => x !== g))]);
    if (!targets.length) continue;
    if (!staysConnected(n, region, g, cell)) continue;
    region[cell] = targets[0];
    return true;
  }
  return false;
}

// ---------- 4. 퍼즐 하나 생성 ----------
function makePuzzle(n) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const queens = placeQueens(n);
    const region = growRegions(n, queens);
    if (!region) continue;
    for (let repair = 0; repair < 40; repair++) {
      const { count, nodes, found } = countSolutions(n, region, 2);
      if (count === 1) return { n, region, queens, nodes, attempts: attempt + 1, repairs: repair };
      const other = found.find((s) => s.some((c, r) => c !== queens[r]));
      if (!other || !breakSolution(n, region, queens, other)) break;
    }
  }
  throw new Error(`크기 ${n} 퍼즐 생성 실패`);
}

const LETTERS = 'ABCDEFGHIJKLMNOP';
function encode(p) {
  return {
    n: p.n,
    regions: Array.from(p.region, (g) => LETTERS[g]).join(''),
    solution: p.queens,
  };
}

// ---------- 메인 ----------
const planTotal = SIZE_PLAN.reduce((s, [, k]) => s + k, 0);
const levels = [];
const started = Date.now();
for (const [n, share] of SIZE_PLAN) {
  const want = Math.round((share / planTotal) * TOTAL);
  const batch = [];
  const t0 = Date.now();
  let totalAttempts = 0;
  const seen = new Set();
  while (batch.length < want) {
    const p = makePuzzle(n);
    const key = encode(p).regions;
    if (seen.has(key)) continue;
    seen.add(key);
    totalAttempts += p.attempts;
    batch.push(p);
  }
  // 같은 크기 안에서는 탐색 노드 수(대략적 난이도) 오름차순
  batch.sort((a, b) => a.nodes - b.nodes);
  levels.push(...batch);
  console.error(
    `${n}x${n}: ${batch.length}개 생성, 평균 시도 ${(totalAttempts / batch.length).toFixed(1)}회, ${Date.now() - t0}ms, 노드 범위 ${batch[0].nodes}~${batch[batch.length - 1].nodes}`,
  );
}

const out = {
  version: 1,
  seed: SEED,
  generatedAt: new Date().toISOString().slice(0, 10),
  levels: levels.map((p, i) => ({ id: i + 1, ...encode(p) })),
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
console.error(`총 ${out.levels.length}단계 → ${OUT} (${Date.now() - started}ms)`);
