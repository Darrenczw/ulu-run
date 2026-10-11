// Ulu Run app shell: routing, state and events. Screens are in views.js, the map in map.js.

import { loadData, findResults, makeRoutes, placeLabel, searchPlaces, fmtKm, SHAPE_NAMES } from './data.js';
import { regionAt } from './geo.js';
import { createMap } from './map.js';
import { createCoast } from './coast.js';
import { store } from './store.js';
import { exportGpx } from './gpx.js';
import { findView, routeView, savedView, aboutView, placeRow } from './views.js';

const $ = (s) => document.querySelector(s);
const app = $('#app');
const body = $('#panel-body');
const dialog = $('#search');
const input = $('#search-input');
const resultsEl = $('#search-results');

const prefs = store.prefs();
const state = {
  start: store.start(),
  target: prefs.target,
  shape: prefs.shape,
  made: [],
  makeRound: 0,
  building: false,
  selectedId: null,
  view: 'find',
  routeId: null,
  cameFromFind: false,
};

let data;
let mapApi;
let setCoast;
let searchHits = [];
let activeHit = 0;
const visits = store.countVisit();

// ---------- helpers ----------

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), 2600);
}

function regionKey() {
  if (state.view === 'route') {
    const r = currentRoute();
    if (r) return r.region || 'west';
  }
  if (!state.start) return 'island';
  return state.start.region || regionAt([state.start.lon, state.start.lat], data.regions) || 'central';
}

function currentRoute() {
  if (!state.routeId) return null;
  return data.byId.get(state.routeId) || store.saved().find((s) => s.route.id === state.routeId)?.route || null;
}

function routeById(id) {
  return data.byId.get(id) || store.saved().find((s) => s.route.id === id)?.route || null;
}

function savePrefs() {
  store.setPrefs({ target: state.target, shape: state.shape });
}

function visibleResults(res) {
  if (res.kind !== 'results') return [];
  if (res.made.length) return [...res.made, ...res.library];
  if (res.library.length || res.auto.length) return [...res.library, ...res.auto];
  return res.closest;
}

function a2hsTip() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (visits < 2 || standalone || store.tipShown() || !ios) return '';
  return `<div class="notice" data-tip><h3>Keep Ulu Run on your Home Screen</h3><p>Tap Share, then “Add to Home Screen”. It opens faster and works without signal.</p>
    <div class="actions-inline"><button class="pill-btn" type="button" data-action="dismiss-tip">Got it</button></div></div>`;
}

// ---------- rendering ----------

function render({ refit = true } = {}) {
  app.dataset.view = state.view;
  const key = regionKey();
  app.dataset.region = key;
  setCoast(key);
  document.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.tab === (state.view === 'route' ? 'find' : state.view);
    if (on) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
  const savedCount = store.saved().length;
  const badge = $('#saved-count');
  badge.hidden = !savedCount;
  badge.textContent = savedCount;

  const ctx = { ...state, isSaved: (id) => store.isSaved(id) };
  if (state.view === 'find') {
    ctx.res = findResults(data, state);
    ctx.tip = a2hsTip();
    body.innerHTML = findView(ctx);
    const shown = visibleResults(ctx.res);
    if (!state.start) mapApi.showIsland();
    else mapApi.showResults(shown, state.selectedId, state.start, state.start.type === 'here' ? 'You' : state.start.codes?.[0] || state.start.name, { refit });
    if (state.start?.type === 'here') mapApi.showHere([state.start.lon, state.start.lat]);
    document.title = 'Ulu Run';
  } else if (state.view === 'route') {
    ctx.route = currentRoute();
    body.innerHTML = routeView(ctx);
    if (ctx.route) {
      mapApi.showRoute(ctx.route);
      document.title = `${fmtKm(ctx.route.km)} km ${SHAPE_NAMES[ctx.route.shape]} · Ulu Run`;
    }
  } else if (state.view === 'saved') {
    ctx.saved = store.saved();
    body.innerHTML = savedView(ctx);
    document.title = 'Saved · Ulu Run';
  } else {
    body.innerHTML = aboutView();
    document.title = 'About · Ulu Run';
  }
  app.classList.remove('is-full');
  bindScroll();
}

function bindScroll() {
  const scroll = $('#scroll');
  if (!scroll || state.view !== 'find' || matchMedia('(min-width: 900px)').matches) return;
  scroll.addEventListener('scroll', () => {
    if (scroll.scrollTop > 48) app.classList.add('is-full');
    else if (scroll.scrollTop <= 0) app.classList.remove('is-full');
  }, { passive: true });
}

// ---------- routing ----------

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const prev = state.view;
  if (h.startsWith('route/')) {
    state.view = 'route';
    state.routeId = decodeURIComponent(h.slice(6));
    state.cameFromFind = prev === 'find' || prev === 'saved';
  } else if (h === 'saved') state.view = 'saved';
  else if (h === 'about') state.view = 'about';
  else state.view = 'find';
  render();
  $('#scroll')?.scrollTo(0, 0);
}

// ---------- actions ----------

function setStart(place) {
  const region = place.region || regionAt([place.lon, place.lat], data.regions);
  state.start = { ...place, region };
  state.made = [];
  state.makeRound = 0;
  state.selectedId = null;
  store.setStart(state.start);
  if (state.view !== 'find') location.hash = '#/';
  else render();
}

function select(id, from) {
  state.selectedId = id;
  const res = findResults(data, state);
  mapApi.select(id, visibleResults(res));
  document.querySelectorAll('.route-item').forEach((li) => li.classList.toggle('is-selected', li.dataset.id === id));
  if (from === 'map') {
    const li = document.querySelector(`.route-item[data-id="${id}"]`);
    li?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
}

function make() {
  const res = findResults(data, state);
  const onScreen = new Set(visibleResults(res).map((r) => r.id));
  const ids = makeRoutes(data, state, onScreen, state.makeRound);
  if (!ids.length) {
    toast(`Nothing new at ${state.target} km from here. Try another distance or shape.`);
    return;
  }
  $('#toast').classList.remove('is-on');
  state.building = true;
  render({ refit: false });
  // Live generation runs in a background worker in the full app; here the routes are already built.
  setTimeout(() => {
    state.building = false;
    state.made = ids;
    state.makeRound += 1;
    state.selectedId = null;
    render();
  }, 650);
}

function toggleSave(id, btn) {
  const r = routeById(id);
  if (!r) return;
  const nowSaved = store.toggleSaved(r);
  if (nowSaved === null) {
    toast("Couldn't save on this phone. Storage may be full or blocked.");
    return;
  }
  toast(nowSaved ? 'Saved. It works offline too.' : 'Removed from saved');
  if (state.view === 'saved') render();
  else {
    document.querySelectorAll(`[data-action="save"][data-id="${id}"]`).forEach((b) => {
      b.setAttribute('aria-pressed', String(nowSaved));
      b.setAttribute('aria-label', nowSaved ? 'Remove from saved' : 'Save route');
    });
    const n = store.saved().length;
    const badge = $('#saved-count');
    badge.hidden = !n;
    badge.textContent = n;
  }
  btn?.focus({ preventScroll: true });
}

async function share(id) {
  const r = routeById(id);
  if (!r) return;
  const url = `${location.origin}${location.pathname}#/route/${id}`;
  const title = `${fmtKm(r.km)} km ${SHAPE_NAMES[r.shape]} from ${placeLabel(r.start)} · Ulu Run`;
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title, url });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied');
  } catch {
    prompt('Copy this link', url);
  }
}

function locate(btn) {
  const msg = $('#locate-msg');
  if (!('geolocation' in navigator)) {
    msg.textContent = "This browser can't share your location. Search instead.";
    toast("This browser can't share your location. Search instead.");
    return;
  }
  btn?.setAttribute('aria-busy', 'true');
  msg.textContent = 'Finding you…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      btn?.removeAttribute('aria-busy');
      const { longitude: lon, latitude: lat } = pos.coords;
      if (lon < 103.55 || lon > 104.1 || lat < 1.15 || lat > 1.5) {
        msg.textContent = 'You seem to be outside Singapore. Search for a start point instead.';
        toast('You seem to be outside Singapore. Search for a start point instead.');
        return;
      }
      msg.textContent = 'Your location stays on this phone.';
      if (dialog.open) dialog.close();
      setStart({ type: 'here', name: 'Your location', lon, lat });
    },
    (err) => {
      btn?.removeAttribute('aria-busy');
      const text = err.code === 1
        ? 'Location is off for this site. Search for a station instead.'
        : "Couldn't find you. Try again outdoors, or search.";
      msg.textContent = text;
      toast(text);
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
  );
}

// ---------- search dialog ----------

function openSearch() {
  input.value = '';
  renderSearch();
  dialog.showModal();
  input.focus();
}

function renderSearch() {
  const q = input.value;
  if (q.trim()) {
    searchHits = searchPlaces(data.places, q, state.start?.region || 'west');
  } else {
    const region = state.start?.region || 'west';
    searchHits = data.places.filter((p) => p.type === 'station' && p.region === region);
  }
  activeHit = 0;
  if (!searchHits.length) {
    resultsEl.innerHTML = `<li class="search-hint">No station or town called “${q.replace(/[<>&]/g, '')}”. Try a station code like BP4, or a town like Bedok.</li>`;
    return;
  }
  const head = q.trim() ? '' : `<li class="search-hint">Stations in the ${(state.start?.region || 'west').replace('-', ' ')}. Type a name, code (BP4) or town.</li>`;
  resultsEl.innerHTML = head + searchHits.map((p, i) => placeRow(p, i, q.trim() && i === activeHit)).join('');
}

input.addEventListener('input', renderSearch);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (searchHits[activeHit]) {
      dialog.close();
      setStart(searchHits[activeHit]);
    }
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    activeHit = Math.max(0, Math.min(searchHits.length - 1, activeHit + (e.key === 'ArrowDown' ? 1 : -1)));
    resultsEl.querySelectorAll('.place').forEach((b, i) => {
      b.classList.toggle('is-active', i === activeHit);
      b.setAttribute('aria-selected', String(i === activeHit));
      if (i === activeHit) b.scrollIntoView({ block: 'nearest' });
    });
  }
});
resultsEl.addEventListener('click', (e) => {
  const b = e.target.closest('.place');
  if (!b) return;
  dialog.close();
  setStart(searchHits[Number(b.dataset.idx)]);
});
$('#locate-row').addEventListener('click', (e) => locate(e.currentTarget));
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close();
});

// ---------- panel events ----------

body.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'search') openSearch();
  else if (a === 'locate') locate(el);
  else if (a === 'pick-teck-whye') setStart(data.places.find((p) => p.type === 'station' && p.name === 'Teck Whye'));
  else if (a === 'make') make();
  else if (a === 'save') {
    e.preventDefault();
    toggleSave(el.dataset.id, el);
  } else if (a === 'gpx') {
    const r = routeById(el.dataset.id);
    if (r) exportGpx(r).then((how) => how === 'downloaded' && toast('GPX file downloaded. Open it in Garmin Connect or Strava.'));
  } else if (a === 'share') share(el.dataset.id);
  else if (a === 'back' && state.cameFromFind) {
    e.preventDefault();
    history.back();
  } else if (a === 'dismiss-tip') {
    store.setTipShown();
    el.closest('[data-tip]')?.remove();
  }
});

body.addEventListener('change', (e) => {
  if (e.target.name === 'dist') {
    state.target = Number(e.target.value);
    state.made = [];
    state.makeRound = 0;
    state.selectedId = null;
    savePrefs();
    render();
  } else if (e.target.dataset.action === 'shape') {
    state.shape = e.target.value;
    state.made = [];
    state.makeRound = 0;
    state.selectedId = null;
    savePrefs();
    render();
  }
});

// Desktop: pointing at a row previews it on the map.
body.addEventListener('pointerover', (e) => {
  if (e.pointerType !== 'mouse' || state.view !== 'find') return;
  const li = e.target.closest('.route-item');
  if (li && li.dataset.id !== state.selectedId) select(li.dataset.id, 'list');
});

// ---------- boot ----------

async function boot() {
  try {
    data = await loadData();
  } catch (err) {
    body.innerHTML = `<div class="scroll"><div class="notice"><h3>Couldn't load the route data</h3><p>Check your connection and reload. (${String(err.message || err).replace(/[<>&]/g, '')})</p></div></div>`;
    return;
  }
  setCoast = createCoast($('#coast-path'), data.regions.profiles);
  mapApi = createMap($('#map'), data, {
    onSelect: (id, from) => select(id, from),
    onOpen: (id) => (location.hash = `#/route/${id}`),
  });
  addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
