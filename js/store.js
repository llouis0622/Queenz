/** localStorage 기반 상태 저장 */
const KEY = 'queenz.v1';

export const DEFAULT_AVATARS = ['👑', '💖', '🐱', '🐶', '🦊', '🐻', '🐼', '🐰', '🦄', '🍀', '⭐', '🌙'];

function defaults() {
  return {
    v: 1,
    activeProfile: 0,
    profiles: [
      { name: '플레이어 1', avatar: '👑', progress: {} },
      { name: '플레이어 2', avatar: '💖', progress: {} },
    ],
    settings: { theme: 'system', autoX: true, haptics: true },
  };
}

export const store = {
  state: load(),
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* 저장 불가 환경 */ }
  },
  get profile() { return this.state.profiles[this.state.activeProfile]; },
  get settings() { return this.state.settings; },
  setActive(i) { this.state.activeProfile = i; this.save(); },
  updateProfile(i, patch) { Object.assign(this.state.profiles[i], patch); this.save(); },
  setSetting(k, v) { this.state.settings[k] = v; this.save(); },
  resetProgress(i) { this.state.profiles[i].progress = {}; this.save(); },

  /** 단계 결과 기록 */
  recordClear(profileIdx, levelId, { ms, stars }) {
    const p = this.state.profiles[profileIdx];
    const prev = p.progress[levelId] ?? { bestMs: null, stars: 0, clears: 0, fails: 0 };
    p.progress[levelId] = {
      bestMs: prev.bestMs == null ? ms : Math.min(prev.bestMs, ms),
      stars: Math.max(prev.stars, stars),
      clears: prev.clears + 1,
      fails: prev.fails,
      lastMs: ms,
    };
    this.save();
    return { improved: prev.bestMs == null || ms < prev.bestMs, prevBest: prev.bestMs };
  },
  recordFail(profileIdx, levelId) {
    const p = this.state.profiles[profileIdx];
    const prev = p.progress[levelId] ?? { bestMs: null, stars: 0, clears: 0, fails: 0 };
    prev.fails++;
    p.progress[levelId] = prev;
    this.save();
  },
};

export function summarize(profile, total) {
  const entries = Object.entries(profile.progress).filter(([, v]) => v.clears > 0);
  const cleared = entries.length;
  let maxCleared = 0, stars = 0, ms = 0, perfect = 0, fails = 0;
  for (const [id, v] of entries) {
    maxCleared = Math.max(maxCleared, Number(id));
    stars += v.stars;
    ms += v.bestMs ?? 0;
    if (v.stars === 3) perfect++;
  }
  for (const v of Object.values(profile.progress)) fails += v.fails ?? 0;
  return { cleared, maxCleared, next: Math.min(maxCleared + 1, total), stars, ms, perfect, fails, total };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const d = defaults();
    const s = JSON.parse(raw);
    return { ...d, ...s, settings: { ...d.settings, ...(s.settings ?? {}) }, profiles: s.profiles?.length === 2 ? s.profiles : d.profiles };
  } catch {
    return defaults();
  }
}
