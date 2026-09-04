import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, QUEEN, X, EMPTY, MAX_LIVES } from '../js/engine.js';

const { levels } = JSON.parse(readFileSync(new URL('../data/puzzles.json', import.meta.url), 'utf8'));
const L1 = levels[0];

test('탭 순환: 빈칸 → X → 퀸 → 빈칸', () => {
  const g = new Game(L1, { autoX: false });
  const i = g.idx(0, L1.solution[0]);
  assert.equal(g.tap(i).type, 'x');
  assert.equal(g.view(i), X);
  assert.equal(g.tap(i).type, 'queen');
  assert.equal(g.view(i), QUEEN);
  assert.equal(g.tap(i).type, 'clear');
  assert.equal(g.view(i), EMPTY);
});

test('규칙 위반 퀸은 놓이지 않고 목숨이 준다', () => {
  const g = new Game(L1, { autoX: false });
  const a = g.idx(0, L1.solution[0]);
  g.tap(a); g.tap(a); // 퀸
  const b = g.idx(0, (L1.solution[0] + 2) % L1.n); // 같은 행
  g.tap(b);
  const res = g.tap(b);
  assert.equal(res.type, 'conflict');
  assert.equal(res.reason, 'row');
  assert.equal(g.lives, MAX_LIVES - 1);
  assert.equal(g.view(b), X);
  assert.equal(g.mistakes, 1);
});

test('인접 퀸은 adjacent 사유로 거부', () => {
  const g = new Game(L1, { autoX: false });
  const a = g.idx(2, 2);
  g.tap(a); g.tap(a);
  const b = g.idx(3, 3);
  g.tap(b);
  const res = g.tap(b);
  assert.equal(res.type, 'conflict');
  assert.equal(res.reason, 'adjacent');
});

test('목숨 3개 소진 시 over', () => {
  const g = new Game(L1, { autoX: false });
  const a = g.idx(0, 0);
  g.tap(a); g.tap(a);
  const b = g.idx(0, 3);
  g.tap(b);
  assert.equal(g.tap(b).type, 'conflict');
  assert.equal(g.tap(b).type, 'conflict');
  assert.equal(g.tap(b).type, 'over');
  assert.equal(g.lives, 0);
  assert.equal(g.tap(b).type, 'noop');
});

test('정답을 모두 놓으면 solved', () => {
  const g = new Game(L1, { autoX: true });
  let last;
  for (let r = 0; r < L1.n; r++) {
    const i = g.idx(r, L1.solution[r]);
    g.tap(i);
    last = g.tap(i);
  }
  assert.equal(last.type, 'solved');
  assert.equal(g.solved, true);
  assert.equal(g.stars(), 3);
});

test('자동 X: 퀸을 놓으면 같은 행/열/영역/인접 칸이 X로 보이고, 제거하면 사라진다', () => {
  const g = new Game(L1, { autoX: true });
  const i = g.idx(0, L1.solution[0]);
  g.tap(i); g.tap(i);
  assert.equal(g.view(g.idx(0, (L1.solution[0] + 2) % L1.n)), X);
  assert.equal(g.view(g.idx(4, L1.solution[0])), X);
  g.tap(i); // 제거
  assert.equal(g.view(g.idx(4, L1.solution[0])), EMPTY);
});

test('되돌리기', () => {
  const g = new Game(L1, { autoX: true });
  const i = g.idx(0, L1.solution[0]);
  g.tap(i); g.tap(i);
  assert.equal(g.undo(), true);
  assert.equal(g.view(i), X);
  assert.equal(g.undo(), true);
  assert.equal(g.view(i), EMPTY);
  assert.equal(g.undo(), false);
});

test('힌트는 정답 퀸을 놓고 잘못된 퀸을 치운다', () => {
  const g = new Game(L1, { autoX: false });
  const wrong = g.idx(0, (L1.solution[0] + 2) % L1.n);
  g.tap(wrong); g.tap(wrong);
  let h;
  for (let k = 0; k < L1.n; k++) { h = g.hint(); if (!h) break; }
  assert.equal(g.solved, true);
  assert.equal(g.cells[wrong], EMPTY);
  assert.ok(g.stars() < 3);
});

test('모든 단계: 해답을 그대로 놓으면 충돌 없이 클리어', () => {
  for (const lv of levels) {
    const g = new Game(lv, { autoX: true });
    let last;
    for (let r = 0; r < lv.n; r++) {
      const i = g.idx(r, lv.solution[r]);
      g.tap(i);
      last = g.tap(i);
      assert.notEqual(last.type, 'conflict', `#${lv.id} 행 ${r} 충돌`);
    }
    assert.equal(last.type, 'solved', `#${lv.id} 미해결`);
  }
});
