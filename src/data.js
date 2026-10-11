// Loads the static data files and answers "which routes fit?".
// In the full app the library comes per region and live generation fills gaps (TECH-DESIGN.md).
// In this prototype, every route was generated ahead of time from Teck Whye LRT.

import { distance } from './geo.js';

export const DISTANCES = [3, 5, 8, 10, 15, 21];
export const SHAPES = { any: 'Any shape', loop: 'Loop', 'out-and-back': 'Out-and-back', 'a-b': 'A→B' };
export const SHAPE_NAMES = { loop: 'loop', 'out-and-back': 'out-and-back', 'a-b': 'A→B' };
export const REGION_NAMES = { central: 'Central', east: 'East', north: 'North', 'north-east': 'North-East', west: 'West' };
const NEAR_START_M = 1200;
const MATCH = 0.15;

export async function loadData() {
  const get = (p) => fetch(p).then((r) => {
    if (!r.ok) throw new Error(`${p}: ${r.status}`);
    return r.json();
  });
  const [regions, places, lib, checked, pcn] = await Promise.all([
    get('data/regions.json'),
    get('data/places.json'),
    get('data/prototype/routes.json'),
    get('data/checked.json'),
    get('data/prototype/pcn.json'),
  ]);
  const promoted = new Map(checked.routes.map((c) => [c.id, c]));
  const routes = lib.routes.map((r) => {
    const c = promoted.get(r.id);
    return c ? { ...r, tier: 'checked', set: 'library', checked: c } : r;
  });
  return { regions, places, routes, pcn, byId: new Map(routes.map((r) => [r.id, r])) };
}

export function matchesTarget(route, target) {
  if (target === 21) return route.km >= target * (1 - MATCH);
  return Math.abs(route.km - target) / target <= MATCH;
}

const tierRank = (r) => (r.tier === 'checked' ? 0 : 1);

export function sortRoutes(list, target, start) {
  return [...list].sort((a, b) =>
    tierRank(a) - tierRank(b) ||
    Math.abs(a.km - target) - Math.abs(b.km - target) ||
    distance(startPoint(a), start) - distance(startPoint(b), start));
}

export const startPoint = (r) => [r.start.lon, r.start.lat];

// Routes whose start is close to the chosen start point.
export function routesNear(data, start) {
  const p = [start.lon, start.lat];
  return data.routes.filter((r) => distance(startPoint(r), p) <= NEAR_START_M);
}

/**
 * What the results list shows.
 * kind: 'no-start' | 'none-here' | 'results'
 * For 'results': library (matching), made (from Make me a route), closest (when nothing matches).
 */
export function findResults(data, { start, target, shape, made }) {
  if (!start) return { kind: 'no-start' };
  const near = routesNear(data, start);
  if (!near.length) return { kind: 'none-here' };
  const p = [start.lon, start.lat];
  const pool = near.filter((r) => shape === 'any' || r.shape === shape);
  const madeRoutes = (made || []).map((id) => data.byId.get(id)).filter(Boolean);
  const madeIds = new Set(madeRoutes.map((r) => r.id));
  let library = sortRoutes(pool.filter((r) => r.set === 'library' && matchesTarget(r, target) && !madeIds.has(r.id)), target, p);
  let auto = [];
  // Fewer than 3 matches: the app makes more on its own (PRD 7.3).
  if (!madeRoutes.length && library.length < 3) {
    auto = sortRoutes(pool.filter((r) => r.set === 'fresh' && matchesTarget(r, target)), target, p).slice(0, 3 - library.length);
  }
  let closest = [];
  if (!library.length && !auto.length && !madeRoutes.length) {
    const byGap = [...pool].sort((a, b) => Math.abs(a.km - target) - Math.abs(b.km - target));
    const seen = new Set();
    for (const r of byGap) {
      const k = r.shape + Math.round(r.km);
      if (seen.has(k)) continue;
      seen.add(k);
      closest.push(r);
      if (closest.length === 2) break;
    }
  }
  return { kind: 'results', library, made: madeRoutes, auto, closest, pool };
}

// "Make me a route": up to 3 fresh options not already on screen. Shuffle asks again.
export function makeRoutes(data, { start, target, shape }, onScreen, round) {
  const near = routesNear(data, start);
  const candidates = near
    .filter((r) => (shape === 'any' || r.shape === shape) && matchesTarget(r, target) && r.tier !== 'checked')
    .sort((a, b) => (a.set === b.set ? a.id.localeCompare(b.id) : a.set === 'fresh' ? -1 : 1));
  const notShown = candidates.filter((r) => !onScreen.has(r.id));
  const list = notShown.length ? notShown : candidates;
  if (!list.length) return [];
  const startAt = (round * 3) % list.length;
  const out = [];
  for (let i = 0; i < Math.min(3, list.length); i++) out.push(list[(startAt + i) % list.length].id);
  return out;
}

export function routeTitle(r) {
  const via = r.via && r.via.length ? r.via.join(' & ') : 'estate footpaths';
  if (r.shape === 'a-b') return `To ${r.finish.name} ${r.finish.kind}, via ${via}`;
  return `Via ${via}`;
}

export function placeLabel(p) {
  if (!p) return '';
  if (p.type === 'here') return 'Your location';
  return p.type === 'station' ? `${p.name} ${p.kind}` : p.name;
}

export function fmtKm(km) {
  return km >= 10 ? km.toFixed(1) : km.toFixed(2).replace(/0$/, '');
}

export function searchPlaces(places, q, nearRegion) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const scored = [];
  for (const p of places) {
    const name = p.name.toLowerCase();
    let score = -1;
    if (p.codes && p.codes.some((c) => c.toLowerCase() === s)) score = 0;
    else if (name.startsWith(s)) score = 1;
    else if (name.split(/[\s-]+/).some((w) => w.startsWith(s))) score = 2;
    else if (p.codes && p.codes.some((c) => c.toLowerCase().startsWith(s))) score = 3;
    else if (name.includes(s)) score = 4;
    // Ties go to stations, then to places in the runner's own region.
    if (score >= 0) scored.push([score + (p.type === 'town' ? 0.5 : 0) + (nearRegion && p.region !== nearRegion ? 0.25 : 0), p]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).slice(0, 30).map((x) => x[1]);
}
