/**
 * Queens 보드 엔진 (UI와 무관한 순수 로직)
 *
 * 셀 상태: 0 = 비어 있음, 1 = 수동 X, 2 = 퀸
 * auto[i] > 0 이면 퀸 배치로 자동 표시된 X (표시상 X, 상태는 0)
 */
export const EMPTY = 0;
export const X = 1;
export const QUEEN = 2;

export const MAX_LIVES = 3;

export function parseLevel(level) {
  const n = level.n;
  const region = Array.from(level.regions, (ch) => ch.charCodeAt(0) - 65);
  return { id: level.id, n, region, solution: level.solution };
}

export class Game {
  constructor(level, { autoX = true } = {}) {
    const p = parseLevel(level);
    this.id = p.id;
    this.n = p.n;
    this.region = p.region;
    this.solution = p.solution;
    this.autoX = autoX;
    this.reset();
  }

  reset() {
    const n = this.n;
    this.cells = new Uint8Array(n * n);
    this.auto = new Uint8Array(n * n);
    this.lives = MAX_LIVES;
    this.hints = 0;
    this.mistakes = 0;
    this.history = [];
    this.solved = false;
  }

  idx(r, c) { return r * this.n + c; }
  rc(i) { return [Math.floor(i / this.n), i % this.n]; }

  /** 화면에 표시할 상태: 0/1/2 (auto X 포함) */
  view(i) {
    if (this.cells[i] === QUEEN) return QUEEN;
    if (this.cells[i] === X || this.auto[i] > 0) return X;
    return EMPTY;
  }

  get queenCount() {
    let k = 0;
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i] === QUEEN) k++;
    return k;
  }

  /** (r,c)에 퀸을 놓았을 때 충돌하는 기존 퀸 셀 목록과 사유 */
  conflictsAt(r, c) {
    const n = this.n;
    const g = this.region[this.idx(r, c)];
    const out = [];
    let reason = null;
    for (let i = 0; i < n * n; i++) {
      if (this.cells[i] !== QUEEN) continue;
      const [qr, qc] = this.rc(i);
      if (qr === r && qc === c) continue;
      if (Math.abs(qr - r) <= 1 && Math.abs(qc - c) <= 1) { out.push(i); reason ??= 'adjacent'; continue; }
      if (qr === r) { out.push(i); reason ??= 'row'; continue; }
      if (qc === c) { out.push(i); reason ??= 'col'; continue; }
      if (this.region[i] === g) { out.push(i); reason ??= 'region'; }
    }
    return { cells: out, reason };
  }

  /** 자동 X 대상 셀: 같은 행/열/영역 + 인접 8칸 */
  coveredBy(r, c) {
    const n = this.n;
    const g = this.region[this.idx(r, c)];
    const set = new Set();
    for (let i = 0; i < n; i++) { set.add(this.idx(r, i)); set.add(this.idx(i, c)); }
    for (let i = 0; i < n * n; i++) if (this.region[i] === g) set.add(i);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nc >= 0 && nr < n && nc < n) set.add(this.idx(nr, nc));
    }
    set.delete(this.idx(r, c));
    return [...set];
  }

  snapshot() {
    this.history.push({ cells: this.cells.slice(), auto: this.auto.slice() });
    if (this.history.length > 200) this.history.shift();
  }

  undo() {
    const s = this.history.pop();
    if (!s) return false;
    this.cells = s.cells;
    this.auto = s.auto;
    return true;
  }

  setQueen(i, on) {
    const [r, c] = this.rc(i);
    if (on) {
      this.cells[i] = QUEEN;
      if (this.autoX) for (const j of this.coveredBy(r, c)) this.auto[j]++;
    } else {
      this.cells[i] = EMPTY;
      if (this.autoX) for (const j of this.coveredBy(r, c)) if (this.auto[j] > 0) this.auto[j]--;
    }
  }

  /**
   * 탭: 빈칸 → X → 퀸 → 빈칸
   * 반환: { type: 'x'|'queen'|'clear'|'conflict'|'solved'|'over'|'noop', cells, reason }
   */
  tap(i) {
    if (this.solved || this.lives <= 0) return { type: 'noop' };
    const v = this.view(i);
    if (v === EMPTY) {
      this.snapshot();
      this.cells[i] = X;
      return { type: 'x', cells: [i] };
    }
    if (v === X) {
      const [r, c] = this.rc(i);
      const { cells, reason } = this.conflictsAt(r, c);
      if (cells.length) {
        this.lives--;
        this.mistakes++;
        return { type: this.lives <= 0 ? 'over' : 'conflict', cells: [i, ...cells], reason };
      }
      this.snapshot();
      this.cells[i] = EMPTY; // 수동 X 제거 후 퀸
      this.setQueen(i, true);
      if (this.checkSolved()) return { type: 'solved', cells: [i] };
      return { type: 'queen', cells: [i] };
    }
    // 퀸 → 빈칸
    this.snapshot();
    this.setQueen(i, false);
    return { type: 'clear', cells: [i] };
  }

  /** 드래그로 X 표시/해제 (빈칸 ↔ 수동 X 만) */
  paint(i, toX) {
    if (this.solved || this.lives <= 0) return false;
    if (toX) {
      if (this.view(i) !== EMPTY) return false;
      this.cells[i] = X;
      return true;
    }
    if (this.cells[i] !== X) return false;
    this.cells[i] = EMPTY;
    return true;
  }

  checkSolved() {
    const n = this.n;
    if (this.queenCount !== n) return false;
    const cols = new Set(), regs = new Set();
    let prev = -9;
    for (let r = 0; r < n; r++) {
      let found = -1;
      for (let c = 0; c < n; c++) if (this.cells[this.idx(r, c)] === QUEEN) { if (found >= 0) return false; found = c; }
      if (found < 0) return false;
      if (Math.abs(found - prev) <= 1) return false;
      cols.add(found); regs.add(this.region[this.idx(r, found)]);
      prev = found;
    }
    if (cols.size !== n || regs.size !== n) return false;
    this.solved = true;
    return true;
  }

  /** 힌트: 정답 퀸이 없는 행 하나에 정답 퀸을 놓는다(잘못된 퀸이 있으면 먼저 제거). */
  hint() {
    if (this.solved || this.lives <= 0) return null;
    const n = this.n;
    // 정답과 다른 퀸이 있는 행을 우선 정리
    const rows = [];
    for (let r = 0; r < n; r++) {
      const sol = this.idx(r, this.solution[r]);
      if (this.cells[sol] === QUEEN) continue;
      rows.push(r);
    }
    if (!rows.length) return null;
    this.snapshot();
    const r = rows[Math.floor(Math.random() * rows.length)];
    const target = this.idx(r, this.solution[r]);
    // 이 퀸과 충돌하는 기존(잘못된) 퀸 제거
    const { cells } = this.conflictsAt(r, this.solution[r]);
    for (const i of cells) this.setQueen(i, false);
    if (this.cells[target] === X) this.cells[target] = EMPTY;
    this.setQueen(target, true);
    this.hints++;
    const solved = this.checkSolved();
    return { cell: target, removed: cells, solved };
  }

  stars() {
    if (this.mistakes === 0 && this.hints === 0) return 3;
    if (this.mistakes <= 1 && this.hints <= 1) return 2;
    return 1;
  }
}

/** 영역 경계용 클래스 계산 */
export function borderClasses(region, n, i) {
  const r = Math.floor(i / n), c = i % n, g = region[i];
  const cls = [];
  if (r > 0 && region[i - n] !== g) cls.push('bt');
  if (c > 0 && region[i - 1] !== g) cls.push('bl');
  if (c < n - 1 && region[i + 1] !== g) cls.push('br');
  if (r < n - 1 && region[i + n] !== g) cls.push('bb');
  return cls;
}
