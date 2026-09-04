import { Game, QUEEN, X, MAX_LIVES, borderClasses } from './engine.js';
import { store, summarize, DEFAULT_AVATARS } from './store.js';

const $ = (sel, root = document) => root.querySelector(sel);
const screenEl = $('#screen');
const titleEl = $('#topbar-title');
const backBtn = $('#btn-back');
const toastEl = $('#toast');
const modalEl = $('#modal');

let LEVELS = [];
let current = null; // 진행 중 게임 컨텍스트

// ---------- 유틸 ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function fmt(ms) {
  if (ms == null) return '–';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (x) => String(x).padStart(2, '0');
  return h ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}
function fmtLong(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 ${s % 60}초`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}
function starsHtml(k) {
  return [1, 2, 3].map((i) => `<span class="${i <= k ? '' : 'off'}">★</span>`).join('');
}
function buzz(pattern) {
  if (store.settings.haptics && navigator.vibrate) { try { navigator.vibrate(pattern); } catch { /* 무시 */ } }
}
let toastTimer = null;
function toast(msg, { danger = false, ms = 1800, onClick = null } = {}) {
  toastEl.textContent = msg;
  toastEl.className = `toast show${danger ? ' danger' : ''}${onClick ? ' action' : ''}`;
  toastEl.onclick = onClick;
  clearTimeout(toastTimer);
  if (ms > 0) toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

// ---------- PWA 설치 ----------
const install = { prompt: null, installed: false };
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}
install.installed = isStandalone();
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  install.prompt = e;
  renderInstallCard();
});
window.addEventListener('appinstalled', () => {
  install.installed = true;
  install.prompt = null;
  renderInstallCard();
  toast('홈 화면에 설치됐어요! 🎉');
});
function installHelpHtml() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua);
  if (ios) return '아이폰은 <b>Safari</b>에서 공유 버튼(⬆︎) → <b>홈 화면에 추가</b>를 눌러 주세요.';
  return '크롬 메뉴(⋮) → <b>홈 화면에 추가</b> 또는 <b>앱 설치</b>를 눌러 주세요. 삼성 인터넷은 메뉴 → <b>현재 페이지 추가</b> → <b>홈 화면</b>이에요.';
}
async function promptInstall() {
  if (install.installed) { toast('이미 홈 화면에 설치되어 있어요'); return; }
  if (!install.prompt) {
    openModal(`
      <h3>홈 화면에 설치</h3>
      <p class="muted" style="margin:0 0 12px;line-height:1.7">이 브라우저에서는 설치 버튼을 바로 띄울 수 없어요.<br />${installHelpHtml()}</p>
      <p class="muted" style="font-size:12px;margin:0 0 12px">설치하면 전체 화면 앱처럼 실행되고, 오프라인에서도 동작해요.</p>
      <button class="btn block" id="ih-close">닫기</button>`);
    $('#ih-close').addEventListener('click', closeModal);
    return;
  }
  const ev = install.prompt;
  install.prompt = null;
  ev.prompt();
  const { outcome } = await ev.userChoice;
  if (outcome !== 'accepted') { install.prompt = ev; toast('나중에 설정에서 다시 설치할 수 있어요'); }
  renderInstallCard();
}
/** 홈 화면의 설치 카드: 설치 가능하고 아직 설치 전일 때만 표시 */
function renderInstallCard() {
  const el = $('#install-card');
  if (!el) return;
  el.hidden = install.installed || !install.prompt;
}

// ---------- 테마 ----------
const mq = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = store.settings.theme;
  const dark = t === 'dark' || (t === 'system' && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute('content', dark ? '#111114' : '#f7f7f8');
}
mq.addEventListener('change', applyTheme);
$('#btn-theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme === 'dark';
  store.setSetting('theme', dark ? 'light' : 'dark');
  applyTheme();
});

// ---------- 모달 ----------
function openModal(html, { dismissible = true } = {}) {
  const card = $('.modal-card', modalEl);
  card.innerHTML = html;
  modalEl.hidden = false;
  $('.modal-backdrop', modalEl).onclick = dismissible ? closeModal : null;
  return card;
}
function closeModal() { modalEl.hidden = true; }

// ---------- 라우팅 ----------
function go(hash) { location.hash = hash; }
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, arg] = h.split('/');
  closeModal();
  stopTimer();
  document.onvisibilitychange = null;
  current = null;
  if (name === 'levels') renderLevels();
  else if (name === 'play' && arg) renderGame(Number(arg));
  else renderHome();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
backBtn.addEventListener('click', () => {
  const h = location.hash;
  if (h.startsWith('#/play')) go('/levels');
  else go('/');
});

function setChrome(title, { back = false } = {}) {
  titleEl.textContent = title;
  backBtn.hidden = !back;
}

// ---------- 홈 ----------
function renderHome() {
  setChrome('Queenz');
  const total = LEVELS.length;
  const sums = store.state.profiles.map((p) => summarize(p, total));
  const active = store.state.activeProfile;
  const lead = sums[0].cleared === sums[1].cleared ? -1 : sums[0].cleared > sums[1].cleared ? 0 : 1;
  const me = sums[active];
  const nextLevel = LEVELS[me.next - 1];
  const allDone = me.cleared >= total;

  screenEl.innerHTML = `
    <div class="hero">
      <img class="logo" src="./icons/icon.svg" alt="" />
      <h1>Queenz</h1>
      <p>둘이서 함께하는 Queens 퍼즐 · ${total}단계</p>
    </div>
    <div class="card install-card row" id="install-card" hidden>
      <img src="./icons/icon.svg" alt="" width="40" height="40" style="border-radius:12px" />
      <div class="grow"><b>홈 화면에 설치</b><div class="muted" style="font-size:13px">앱처럼 실행하고 오프라인에서도 플레이</div></div>
      <button class="btn small primary" id="btn-install-home">설치</button>
    </div>
    <div class="profiles">
      ${store.state.profiles.map((p, i) => `
        <button class="profile ${i === active ? 'active' : ''}" data-profile="${i}">
          ${i === active ? '<span class="badge">지금 나</span>' : ''}
          ${lead === i ? '<span class="lead" title="앞서는 중">🏆</span>' : ''}
          <div class="avatar">${esc(p.avatar)}</div>
          <div class="name">${esc(p.name)}</div>
          <div class="stat"><b>${sums[i].cleared}</b>/${total} 클리어</div>
          <div class="progress-bar"><i style="width:${(sums[i].cleared / total) * 100}%"></i></div>
          <div class="edit" data-edit="${i}">프로필 편집</div>
        </button>`).join('')}
    </div>
    <div class="card" style="margin-top:12px">
      <div class="row">
        <div class="grow">
          <div class="muted" style="font-size:13px">${esc(store.profile.avatar)} ${esc(store.profile.name)}의 다음 단계</div>
          <div style="font-size:22px;font-weight:800">${allDone ? '모든 단계 클리어! 🎉' : `${me.next}단계 <span class="muted" style="font-size:14px;font-weight:600">${nextLevel.n}×${nextLevel.n}</span>`}</div>
        </div>
      </div>
      <div style="display:grid;gap:8px;margin-top:12px">
        <button class="btn primary block" id="btn-continue">${allDone ? '아무 단계나 다시 풀기' : me.cleared ? '이어서 하기' : '시작하기'}</button>
        <button class="btn block" id="btn-levels">단계 목록</button>
      </div>
    </div>
    <div class="card compare">
      <h2>둘의 기록 비교</h2>
      <table>
        <tr><th></th><th>${esc(store.state.profiles[0].avatar)} ${esc(store.state.profiles[0].name)}</th><th>${esc(store.state.profiles[1].avatar)} ${esc(store.state.profiles[1].name)}</th></tr>
        ${cmpRow('클리어', sums.map((s) => s.cleared), 'max')}
        ${cmpRow('별', sums.map((s) => s.stars), 'max', '★')}
        ${cmpRow('완벽 클리어', sums.map((s) => s.perfect), 'max')}
        ${cmpRow('플레이 시간', sums.map((s) => s.ms), 'none', '', fmtLong)}
        ${cmpRow('실패 횟수', sums.map((s) => s.fails), 'min')}
      </table>
    </div>
    <p class="help" style="margin-top:14px">각자 자기 폰에서 프로필을 고르고 플레이하세요.<br />기록은 이 기기에만 저장돼요.</p>
  `;
  for (const el of screenEl.querySelectorAll('[data-profile]')) {
    el.addEventListener('click', (e) => {
      const editTarget = e.target.closest('[data-edit]');
      const i = Number(el.dataset.profile);
      if (editTarget) { editProfile(i); return; }
      store.setActive(i);
      renderHome();
    });
  }
  $('#btn-continue').addEventListener('click', () => go(`/play/${allDone ? 1 : me.next}`));
  $('#btn-install-home').addEventListener('click', promptInstall);
  renderInstallCard();
  $('#btn-levels').addEventListener('click', () => go('/levels'));

  function cmpRow(label, vals, mode, suffix = '', f = (x) => x) {
    const win = mode === 'none' || vals[0] === vals[1] ? -1 : (mode === 'max' ? vals[0] > vals[1] : vals[0] < vals[1]) ? 0 : 1;
    return `<tr><td>${label}</td>${vals.map((v, i) => `<td class="${win === i ? 'win' : ''}">${f(v)}${suffix}</td>`).join('')}</tr>`;
  }
}

function editProfile(i) {
  const p = store.state.profiles[i];
  let avatar = p.avatar;
  const card = openModal(`
    <h3>프로필 편집</h3>
    <div class="field"><label>이름</label><input id="pf-name" maxlength="12" value="${esc(p.name)}" /></div>
    <div class="field"><label>아바타</label><div class="avatars" id="pf-avatars">${DEFAULT_AVATARS.map((a) => `<button data-a="${a}" class="${a === avatar ? 'on' : ''}">${a}</button>`).join('')}</div></div>
    <div style="display:grid;gap:8px;margin-top:8px">
      <button class="btn primary block" id="pf-save">저장</button>
      <button class="btn danger block" id="pf-reset">이 프로필 진행 초기화</button>
    </div>
  `);
  $('#pf-avatars', card).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    avatar = b.dataset.a;
    for (const x of card.querySelectorAll('#pf-avatars button')) x.classList.toggle('on', x === b);
  });
  $('#pf-save', card).addEventListener('click', () => {
    const name = $('#pf-name', card).value.trim() || p.name;
    store.updateProfile(i, { name, avatar });
    closeModal();
    renderHome();
  });
  $('#pf-reset', card).addEventListener('click', () => {
    if (confirm(`${p.name}의 모든 진행 기록을 지울까요? 되돌릴 수 없어요.`)) {
      store.resetProgress(i);
      closeModal();
      renderHome();
      toast('진행 기록을 초기화했어요');
    }
  });
}

// ---------- 단계 목록 ----------
function renderLevels() {
  setChrome('단계 목록', { back: true });
  const p = store.profile;
  const sum = summarize(p, LEVELS.length);
  const groups = new Map();
  for (const lv of LEVELS) {
    if (!groups.has(lv.n)) groups.set(lv.n, []);
    groups.get(lv.n).push(lv);
  }
  screenEl.innerHTML = `
    <div class="card row" style="padding:12px 14px">
      <div class="avatar" style="font-size:26px">${esc(p.avatar)}</div>
      <div class="grow"><b>${esc(p.name)}</b><div class="muted" style="font-size:13px">${sum.cleared}/${LEVELS.length} 클리어 · ★ ${sum.stars}</div></div>
      <button class="btn small primary" id="lv-next">${sum.next}단계로</button>
    </div>
    ${[...groups].map(([n, list]) => {
      const done = list.filter((l) => p.progress[l.id]?.clears > 0).length;
      return `<section class="size-section" id="size-${n}">
        <h2>${n}×${n} <span class="muted" style="font-weight:500">${list[0].id}–${list[list.length - 1].id}단계</span><span class="pill">${done}/${list.length}</span></h2>
        <div class="level-grid">${list.map((l) => levelBtn(l, p, sum)).join('')}</div>
      </section>`;
    }).join('')}
  `;
  $('#lv-next').addEventListener('click', () => go(`/play/${sum.next}`));
  screenEl.addEventListener('click', (e) => {
    const b = e.target.closest('.level');
    if (!b) return;
    if (b.classList.contains('locked')) { toast('이전 단계를 먼저 클리어하세요'); buzz(30); return; }
    go(`/play/${b.dataset.id}`);
  });
  // 다음 단계 위치로 스크롤
  requestAnimationFrame(() => {
    const nextEl = $('.level.next');
    if (nextEl && sum.cleared > 0) nextEl.scrollIntoView({ block: 'center' });
  });

  function levelBtn(l, prof, s) {
    const rec = prof.progress[l.id];
    const cleared = rec?.clears > 0;
    const locked = l.id > s.maxCleared + 1;
    const isNext = l.id === s.next && !cleared;
    const cls = ['level', cleared && 'cleared', locked && 'locked', isNext && 'next'].filter(Boolean).join(' ');
    return `<button class="${cls}" data-id="${l.id}" ${locked ? 'aria-disabled="true"' : ''}>
      ${locked ? '<svg class="lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>' : `<span>${l.id}</span>`}
      <span class="stars">${starsHtml(rec?.stars ?? 0)}</span>
    </button>`;
  }
}

// ---------- 게임 ----------
let timerHandle = null;
function stopTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } }

function renderGame(id) {
  const level = LEVELS[id - 1];
  if (!level) { go('/levels'); return; }
  const sum = summarize(store.profile, LEVELS.length);
  if (id > sum.maxCleared + 1) { toast('아직 잠긴 단계예요'); go('/levels'); return; }

  setChrome(`${id}단계`, { back: true });
  const game = new Game(level, { autoX: store.settings.autoX });
  const n = game.n;
  const best = store.profile.progress[id]?.bestMs ?? null;
  current = { id, game, elapsed: 0, lastTick: null, running: false, finished: false };

  screenEl.innerHTML = `
    <div class="game">
      <div class="card hud">
        <div class="lvl">${id}<small>/ ${LEVELS.length} · ${n}×${n}</small></div>
        <div class="lives" id="lives" aria-label="목숨"></div>
        <div class="timer" id="timer">0:00</div>
      </div>
      <div class="board-wrap"><div class="board" id="board" style="--n:${n}"></div></div>
      <div class="controls">
        <button class="btn" id="c-undo"><svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>되돌리기</button>
        <button class="btn" id="c-hint"><svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.6 1 1.3 1 2.5h6c0-1.2.3-1.9 1-2.5A6 6 0 0 0 12 3z"/></svg>힌트</button>
        <button class="btn" id="c-restart"><svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>다시 시작</button>
        <button class="btn" id="c-list"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>목록</button>
      </div>
      <p class="help">각 행·열·색 영역에 퀸을 하나씩. 퀸끼리는 대각선으로도 붙을 수 없어요.<br />탭: 빈칸 → ✕ → 👑 · 드래그로 ✕ 여러 칸 표시${best != null ? ` · 최고 기록 ${fmt(best)}` : ''}</p>
    </div>
  `;

  const boardEl = $('#board');
  const cellEls = [];
  for (let i = 0; i < n * n; i++) {
    const d = document.createElement('div');
    d.className = `cell g${game.region[i]} ${borderClasses(game.region, n, i).join(' ')}`;
    d.dataset.i = i;
    boardEl.appendChild(d);
    cellEls.push(d);
  }
  const renderCell = (i) => {
    const v = game.view(i);
    cellEls[i].innerHTML = v === QUEEN ? '<svg class="mark queen"><use href="#sym-queen"/></svg>' : v === X ? '<span class="mark x">✕</span>' : '';
  };
  const renderAll = () => { for (let i = 0; i < n * n; i++) renderCell(i); renderLives(); };
  const renderLives = () => {
    $('#lives').innerHTML = Array.from({ length: MAX_LIVES }, (_, i) => `<span class="${i < game.lives ? '' : 'lost'}">❤️</span>`).join('');
  };
  const renderTimer = () => { $('#timer').textContent = fmt(current.elapsed); };

  // 타이머
  const startTimer = () => {
    if (current.running || current.finished) return;
    current.running = true;
    current.lastTick = performance.now();
    stopTimer();
    timerHandle = setInterval(() => {
      const now = performance.now();
      current.elapsed += now - current.lastTick;
      current.lastTick = now;
      renderTimer();
    }, 250);
  };
  const pauseTimer = () => {
    if (!current.running) return;
    current.elapsed += performance.now() - current.lastTick;
    current.running = false;
    stopTimer();
    renderTimer();
  };
  document.onvisibilitychange = () => { if (document.hidden) pauseTimer(); else if (!current.finished) startTimer(); };

  const flash = (cells, cls, ms) => {
    for (const i of cells) { cellEls[i].classList.remove(cls); void cellEls[i].offsetWidth; cellEls[i].classList.add(cls); }
    setTimeout(() => { for (const i of cells) cellEls[i].classList.remove(cls); }, ms);
  };
  const REASON = { row: '같은 행에 이미 퀸이 있어요', col: '같은 열에 이미 퀸이 있어요', region: '같은 색 영역에 이미 퀸이 있어요', adjacent: '퀸끼리 붙어 있을 수 없어요' };

  const handle = (res) => {
    if (res.type === 'noop') return;
    if (res.type === 'conflict' || res.type === 'over') {
      buzz([60, 40, 60]);
      flash(res.cells, 'conflict', 900);
      renderLives();
      toast(`${REASON[res.reason]} · 목숨 -1`, { danger: true });
      if (res.type === 'over') setTimeout(gameOver, 700);
      return;
    }
    for (let i = 0; i < n * n; i++) renderCell(i);
    if (res.type === 'queen') buzz(15);
    if (res.type === 'solved') { buzz([30, 30, 80]); setTimeout(win, 350); }
  };

  // 입력: 탭 & 드래그
  let drag = null;
  const cellFromEvent = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const c = el && el.closest('.cell');
    return c && boardEl.contains(c) ? Number(c.dataset.i) : -1;
  };
  boardEl.addEventListener('pointerdown', (e) => {
    if (current.finished) return;
    const i = cellFromEvent(e);
    if (i < 0) return;
    startTimer();
    boardEl.setPointerCapture(e.pointerId);
    const v = game.view(i);
    drag = { start: i, moved: false, mode: v === QUEEN ? null : v === X && game.cells[i] === X ? 'erase' : v === X ? null : 'x', visited: new Set([i]), snapped: false };
    e.preventDefault();
  });
  boardEl.addEventListener('pointermove', (e) => {
    if (!drag || drag.mode === null) return;
    const i = cellFromEvent(e);
    if (i < 0 || drag.visited.has(i)) return;
    if (!drag.moved) {
      // 드래그 시작: 첫 칸도 함께 처리
      drag.moved = true;
      game.snapshot();
      if (game.paint(drag.start, drag.mode === 'x')) renderCell(drag.start);
    }
    drag.visited.add(i);
    if (game.paint(i, drag.mode === 'x')) renderCell(i);
  });
  const endDrag = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moved) handle(game.tap(d.start));
    else buzz(10);
  };
  boardEl.addEventListener('pointerup', endDrag);
  boardEl.addEventListener('pointercancel', () => { drag = null; });

  // 컨트롤
  $('#c-undo').addEventListener('click', () => { if (game.undo()) { renderAll(); buzz(10); } else toast('되돌릴 게 없어요'); });
  $('#c-hint').addEventListener('click', () => {
    if (current.finished) return;
    startTimer();
    const h = game.hint();
    if (!h) { toast('힌트를 줄 게 없어요'); return; }
    renderAll();
    flash([h.cell], 'hint', 1400);
    toast(`힌트 사용 (${game.hints}회) · 별이 줄어요`);
    if (h.solved) setTimeout(win, 350);
  });
  $('#c-restart').addEventListener('click', () => {
    if (game.history.length === 0 && game.lives === MAX_LIVES) return;
    if (!confirm('처음부터 다시 시작할까요? 목숨과 시간이 초기화돼요.')) return;
    restart();
  });
  $('#c-list').addEventListener('click', () => go('/levels'));

  function restart() {
    closeModal();
    game.reset();
    current.elapsed = 0; current.finished = false; current.running = false;
    renderAll(); renderTimer();
  }

  function gameOver() {
    pauseTimer();
    current.finished = true;
    store.recordFail(store.state.activeProfile, id);
    openModal(`
      <div class="result">
        <div class="big">💔</div>
        <h3>목숨을 모두 잃었어요</h3>
        <p class="muted">${id}단계 · ${fmt(current.elapsed)} 경과</p>
        <div class="actions" style="margin-top:14px">
          <button class="btn primary" id="r-retry">다시 도전</button>
          <button class="btn" id="r-list">단계 목록</button>
        </div>
      </div>`, { dismissible: false });
    $('#r-retry').addEventListener('click', restart);
    $('#r-list').addEventListener('click', () => go('/levels'));
  }

  function win() {
    pauseTimer();
    current.finished = true;
    for (let i = 0; i < n * n; i++) if (game.cells[i] === QUEEN) cellEls[i].classList.add('solved');
    const stars = game.stars();
    const { improved, prevBest } = store.recordClear(store.state.activeProfile, id, { ms: current.elapsed, stars });
    const other = store.state.profiles[1 - store.state.activeProfile];
    const otherRec = other.progress[id];
    const hasNext = id < LEVELS.length;
    openModal(`
      <div class="result">
        <div class="big">${stars === 3 ? '🏆' : '🎉'}</div>
        <h3>${id}단계 클리어!</h3>
        <div class="stars">${starsHtml(stars)}</div>
        <div class="stats">
          <div>시간<b>${fmt(current.elapsed)}</b></div>
          <div>최고 기록<b>${improved && prevBest != null ? `${fmt(current.elapsed)} 🆕` : fmt(prevBest ?? current.elapsed)}</b></div>
          <div>${esc(other.avatar)} ${esc(other.name)}<b>${otherRec?.bestMs != null ? fmt(otherRec.bestMs) : '아직'}</b></div>
        </div>
        ${otherRec?.bestMs != null ? `<p class="muted" style="margin:0 0 12px;font-size:13px">${current.elapsed < otherRec.bestMs ? `${esc(other.name)}보다 ${fmtLong(otherRec.bestMs - current.elapsed)} 빨랐어요! 🔥` : `${esc(other.name)}가 ${fmtLong(current.elapsed - otherRec.bestMs)} 더 빨라요. 다시 도전해 보세요!`}</p>` : ''}
        <div class="actions">
          ${hasNext ? '<button class="btn primary" id="r-next">다음 단계</button>' : '<p class="muted">마지막 단계까지 모두 클리어했어요! 👑</p>'}
          <button class="btn" id="r-again">다시 풀기</button>
          <button class="btn" id="r-list">단계 목록</button>
        </div>
      </div>`, { dismissible: false });
    if (hasNext) $('#r-next').addEventListener('click', () => go(`/play/${id + 1}`));
    $('#r-again').addEventListener('click', restart);
    $('#r-list').addEventListener('click', () => go('/levels'));
  }

  renderAll();
  renderTimer();
}

// ---------- 설정 ----------
$('#btn-settings').addEventListener('click', () => {
  const s = store.settings;
  const card = openModal(`
    <h3>설정</h3>
    <div class="setting">
      <div class="label">테마</div>
      <div class="seg" id="st-theme">
        <button data-v="system" class="${s.theme === 'system' ? 'on' : ''}">시스템</button>
        <button data-v="light" class="${s.theme === 'light' ? 'on' : ''}">라이트</button>
        <button data-v="dark" class="${s.theme === 'dark' ? 'on' : ''}">다크</button>
      </div>
    </div>
    <div class="setting">
      <div class="label">자동 ✕ 표시<small>퀸을 놓으면 같은 행·열·영역·인접 칸에 ✕ 자동 표시</small></div>
      <button class="switch ${s.autoX ? 'on' : ''}" id="st-autox" aria-label="자동 X"></button>
    </div>
    <div class="setting">
      <div class="label">진동<small>퀸 배치·실수 시 짧은 진동</small></div>
      <button class="switch ${s.haptics ? 'on' : ''}" id="st-haptics" aria-label="진동"></button>
    </div>
    <div class="setting">
      <div class="label">홈 화면에 설치<small>${install.installed ? '설치되어 앱으로 실행 중이에요' : '앱처럼 실행 · 오프라인 플레이 · 전체 화면'}</small></div>
      <button class="btn small ${install.installed ? '' : 'primary'}" id="st-install" ${install.installed ? 'disabled' : ''}>${install.installed ? '설치됨 ✓' : '설치'}</button>
    </div>
    <p class="muted" style="font-size:12px;margin:12px 0 0">Queenz · ${LEVELS.length}단계 · 오프라인에서도 동작해요</p>
    <button class="btn block" style="margin-top:12px" id="st-close">닫기</button>
  `);
  $('#st-theme', card).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    store.setSetting('theme', b.dataset.v);
    for (const x of card.querySelectorAll('#st-theme button')) x.classList.toggle('on', x === b);
    applyTheme();
  });
  $('#st-autox', card).addEventListener('click', (e) => {
    store.setSetting('autoX', !store.settings.autoX);
    e.currentTarget.classList.toggle('on', store.settings.autoX);
    toast('다음 단계부터 적용돼요');
  });
  $('#st-haptics', card).addEventListener('click', (e) => {
    store.setSetting('haptics', !store.settings.haptics);
    e.currentTarget.classList.toggle('on', store.settings.haptics);
    buzz(20);
  });
  $('#st-install', card)?.addEventListener('click', promptInstall);
  $('#st-close', card).addEventListener('click', closeModal);
});

// ---------- 서비스 워커 ----------
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          toast('새 버전이 있어요 · 눌러서 업데이트', { ms: 0, onClick: () => w.postMessage({ type: 'SKIP_WAITING' }) });
        }
      });
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
  } catch (e) { console.warn('SW 등록 실패', e); }
}

// ---------- 시작 ----------
async function boot() {
  applyTheme();
  try {
    const res = await fetch('./data/puzzles.json');
    LEVELS = (await res.json()).levels;
  } catch (e) {
    screenEl.innerHTML = `<div class="card"><h3>퍼즐 데이터를 불러오지 못했어요</h3><p class="muted">네트워크 연결을 확인하고 다시 열어 주세요.</p></div>`;
    return;
  }
  route();
  registerSW();
}
boot();
