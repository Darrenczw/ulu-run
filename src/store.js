// Everything the app remembers lives on this phone, in localStorage.
// Every read and write is guarded: private mode or blocked storage must never break the app.

const KEYS = { saved: 'ulu:saved:v1', start: 'ulu:start:v1', prefs: 'ulu:prefs:v1', visits: 'ulu:visits:v1', tip: 'ulu:tip-a2hs:v1' };

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const store = {
  saved() { return read(KEYS.saved, []); },
  isSaved(id) { return this.saved().some((s) => s.route.id === id); },
  // Saved routes are stored in full, so they stay the same even if the library changes (PRD 7.7).
  toggleSaved(route) {
    const list = this.saved();
    const i = list.findIndex((s) => s.route.id === route.id);
    if (i >= 0) list.splice(i, 1);
    else list.unshift({ savedAt: new Date().toISOString(), route });
    return write(KEYS.saved, list) ? i < 0 : null;
  },
  start() { return read(KEYS.start, null); },
  setStart(start) { write(KEYS.start, start); },
  prefs() { return { target: 5, shape: 'any', ...read(KEYS.prefs, {}) }; },
  setPrefs(p) { write(KEYS.prefs, p); },
  countVisit() {
    const n = read(KEYS.visits, 0) + 1;
    write(KEYS.visits, n);
    return n;
  },
  tipShown() { return read(KEYS.tip, false); },
  setTipShown() { write(KEYS.tip, true); },
};
