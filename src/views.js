// HTML for each screen. Plain template strings; app.js wires up events by data-action.

import { DISTANCES, SHAPES, SHAPE_NAMES, fmtKm, routeTitle, placeLabel } from './data.js';
import { outlinePath } from './geo.js';

const esc = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const icon = (name, cls = 'i') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const pct = (x) => `${Math.round(x * 100)}%`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const article = (km) => (/^8|^11|^18/.test(fmtKm(km)) ? 'an' : 'a');

export function tierCapsule(route, large = false) {
  const lg = large ? ' tier--lg' : '';
  const sample = route.checked && route.checked.sample ? '<span class="tier-sample">Sample</span>' : '';
  return route.tier === 'checked'
    ? `<span class="tier tier--checked${lg}">${icon('check')}Run &amp; checked${sample}</span>`
    : `<span class="tier tier--generated${lg}">Built from map</span>`;
}

function codes(place) {
  if (!place || !place.codes) return '';
  return `<span class="codes">${place.codes.map((c) => `<span class="code">${esc(c)}</span>`).join('')}</span>`;
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

function shapeTitle(r) {
  return r.shape === 'a-b' ? `A→B to ${r.finish.name} ${r.finish.kind}` : cap(SHAPE_NAMES[r.shape]);
}

function viaLine(r) {
  return r.via && r.via.length ? `via ${r.via.join(' & ')}` : 'via estate footpaths';
}

function factsLine(r) {
  return `${pct(r.pcnShare)} PCN · ${plural(r.crossings, 'crossing', 'crossings')}${r.stairs ? ` · ${plural(r.stairs, 'stair', 'stairs')}` : ''}`;
}

export function routeRow(r, { selected = false, saved = false, thumb = false } = {}) {
  const note = r.tier === 'checked' && r.checked ? `<span class="row-note">“${esc(r.checked.notes[0])}”</span>` : '';
  const lead = thumb
    ? thumbSvg(r)
    : `<span class="row-km"><b>${fmtKm(r.km)}</b><small>km</small></span>`;
  const title = thumb ? `${fmtKm(r.km)} km ${esc(shapeTitle(r).replace(/^Loop|^Out-and-back/, (m) => m.toLowerCase()))}` : esc(shapeTitle(r));
  const label = `${fmtKm(r.km)} kilometre ${SHAPE_NAMES[r.shape]}, ${r.tier === 'checked' ? (r.checked && r.checked.sample ? 'Run and checked, sample only' : 'Run and checked') : 'built from the map'}, ${pct(r.pcnShare)} on park connectors, ${plural(r.crossings, 'road crossing', 'road crossings')}. ${routeTitle(r)}`;
  return `<li class="route-item${r.tier === 'checked' ? ' route-item--checked' : ''}${selected ? ' is-selected' : ''}" data-id="${r.id}">
    <a class="row${thumb ? ' row--thumb' : ''}" href="#/route/${r.id}" aria-label="${esc(label)}">
      ${lead}
      <span class="row-main">
        <span class="row-title">${title}</span>
        <span class="row-via">${esc(thumb ? `from ${r.start.name}, ${viaLine(r)}` : viaLine(r))}</span>
        <span class="row-meta">${tierCapsule(r)}<span>${factsLine(r)}</span></span>
        ${note}
      </span>
    </a>
    <button class="save-btn" type="button" data-action="save" data-id="${r.id}" aria-pressed="${saved}" aria-label="${saved ? 'Remove from saved' : 'Save route'}">${icon('bookmark')}</button>
  </li>`;
}

export function thumbSvg(r) {
  const { d, start, end } = outlinePath(r.coords, 64, 9);
  return `<svg class="thumb" viewBox="0 0 64 64" style="background:var(--${r.region || 'west'})" aria-hidden="true">
    <path d="${d}"/><circle cx="${start[0].toFixed(1)}" cy="${start[1].toFixed(1)}" r="4"/>${r.shape === 'a-b' ? `<circle cx="${end[0].toFixed(1)}" cy="${end[1].toFixed(1)}" r="4"/>` : ''}
  </svg>`;
}

function rows(list, ctx) {
  return `<ul class="rows">${list.map((r) => routeRow(r, { selected: r.id === ctx.selectedId, saved: ctx.isSaved(r.id) })).join('')}</ul>`;
}

// ---------- Find ----------

export function findView(ctx) {
  const { start, target, shape, res } = ctx;
  const startBlock = start
    ? `<span class="start-text"><small>Start near</small><b>${esc(start.type === 'here' ? 'Your location' : start.name)}</b></span>${codes(start)}`
    : `<span class="start-text is-empty"><small>Start near</small><b>Where are you starting?</b></span>`;
  const startLabel = start ? `Start point: ${placeLabel(start)}. Change start point` : 'Choose a start point';

  const band = `<div class="band">
    <div class="start-row">
      <button class="start-btn" type="button" data-action="search" aria-label="${esc(startLabel)}">${icon('pin')}${startBlock}</button>
      <button class="round-btn" type="button" data-action="locate" aria-label="Use my location">${icon('locate')}</button>
    </div>
    <fieldset class="dist">
      <legend class="visually-hidden">Distance</legend>
      ${DISTANCES.map((d) => `<label><input type="radio" name="dist" value="${d}"${d === target ? ' checked' : ''} aria-label="${d === 21 ? '21 kilometres or more' : d + ' kilometres'}"><span>${d}K${d === 21 ? '+' : ''}</span></label>`).join('')}
    </fieldset>
  </div>`;

  return band + `<div class="scroll" id="scroll">${ctx.tip || ''}${resultsBody(ctx, res)}</div>`;
}

function shapeSelect(shape) {
  return `<label class="select-cap"><span class="visually-hidden">Shape</span>
    <select data-action="shape">${Object.entries(SHAPES).map(([k, v]) => `<option value="${k}"${k === shape ? ' selected' : ''}>${v}</option>`).join('')}</select>${icon('chevron-down')}</label>`;
}

function resultsBody(ctx, res) {
  const { start, target, shape } = ctx;
  // Non-breaking spaces keep the number and unit together in headings.
  const t = target === 21 ? '21\u00a0km or more' : `about ${target}\u00a0km`;
  if (res.kind === 'no-start') {
    return `<div class="notice">
      <h3>Where are you starting?</h3>
      <p>Pick a station or a town, or use your location. Every route starts there.</p>
      <div class="actions-inline">
        <button class="pill-btn pill-btn--ink" type="button" data-action="search">${icon('search')}Find a start point</button>
        <button class="pill-btn" type="button" data-action="pick-teck-whye">Teck Whye LRT</button>
      </div>
    </div>`;
  }
  if (res.kind === 'none-here') {
    return `<div class="list-head"><h2>No routes here yet</h2>${shapeSelect(shape)}</div>
    <div class="notice">
      <h3>Nothing near ${esc(placeLabel(start))} in this prototype</h3>
      <p>The prototype only has routes from Teck Whye LRT. The full app will build routes from any start point, on your phone.</p>
      <div class="actions-inline"><button class="pill-btn pill-btn--ink" type="button" data-action="pick-teck-whye">Go to Teck Whye</button></div>
    </div>`;
  }

  let html = '';
  const madeLabel = (n) => `<p class="section-label"><span>Made just now</span><span class="num">${plural(n, 'route', 'routes')}</span></p>`;
  if (ctx.building) {
    html += `<div class="list-head"><h2>Making routes at ${t}…</h2>${shapeSelect(shape)}</div>${skeleton()}`;
  } else if (res.made.length) {
    html += `<div class="list-head"><h2>${plural(res.made.length, 'new route', 'new routes')} at ${t}</h2>${shapeSelect(shape)}</div>`;
    html += rows(res.made, ctx);
    if (res.library.length) html += `<p class="section-label"><span>From the library</span></p>` + rows(res.library, ctx);
  } else if (res.library.length || res.auto.length) {
    const n = res.library.length + res.auto.length;
    html += `<div class="list-head"><h2>${plural(n, 'route', 'routes')} at ${t}</h2>${shapeSelect(shape)}</div>`;
    if (res.library.length) html += rows(res.library, ctx);
    if (res.auto.length) html += madeLabel(res.auto.length) + rows(res.auto, ctx);
  } else {
    const c = res.closest;
    const say = c.map((r) => `${article(r.km)} ${fmtKm(r.km)} km ${SHAPE_NAMES[r.shape]}`).join(' and ');
    html += `<div class="list-head"><h2>Nothing at ${t}</h2>${shapeSelect(shape)}</div>`;
    html += `<div class="notice"><p>Nothing at ${t} near here${shape !== 'any' ? ` as ${shape === 'loop' ? 'a' : 'an'} ${SHAPE_NAMES[shape]}` : ''}.${c.length ? ` Closest: ${say}.` : ' Try another shape.'}</p></div>`;
    if (c.length) html += rows(c, ctx);
  }

  if (!ctx.building) {
    const again = res.made.length > 0;
    html += `<button class="make-btn" type="button" data-action="make">
      <span>${again ? 'Shuffle: 3 different routes' : 'Make me a new route'}</span><span class="disc">${icon('shuffle')}</span>
    </button>
    <p class="make-sub">New routes are built from the PCN map. Nobody has run them yet.</p>`;
  }
  return html;
}

function skeleton() {
  const one = `<li class="route-item"><div class="row" aria-hidden="true"><span class="bar bar--km"></span><span class="row-main"><span class="bar" style="width:80%"></span><span class="bar" style="width:55%"></span></span></div></li>`;
  return `<ul class="rows skeleton" aria-label="Making routes">${one}${one}${one}</ul>`;
}

// ---------- Route ----------

export function routeView(ctx) {
  const r = ctx.route;
  if (!r) {
    return `<div class="band route-band"><div class="route-top"><a class="icon-btn" href="#/" aria-label="Back to routes">${icon('arrow-left')}</a></div></div>
    <div class="scroll"><div class="notice missing"><h3>This route isn't here any more</h3><p>The route library may have changed. Saved routes keep their own copy, so check Saved.</p>
    <div class="actions-inline"><a class="pill-btn pill-btn--ink" href="#/">Find a route</a><a class="pill-btn" href="#/saved">Saved</a></div></div></div>`;
  }
  const shape = SHAPE_NAMES[r.shape];
  const sub = r.shape === 'a-b'
    ? `${shape} from ${esc(placeLabel(r.start))} to ${esc(placeLabel(r.finish))}`
    : `${shape[0].toUpperCase() + shape.slice(1)} from ${esc(placeLabel(r.start))}`;
  const saved = ctx.isSaved(r.id);
  const via = r.via && r.via.length ? r.via.join(', ') : 'Estate footpaths; no park connector on this one';

  const finishLeg = r.shape === 'a-b'
    ? `<div class="leg"><span class="dot">${icon('flag')}</span><p><small>Finish</small><b>${esc(placeLabel(r.finish))}</b>${codes(r.finish)}</p></div>`
    : `<div class="leg"><span class="dot">${icon('flag')}</span><p><small>Finish</small><b>Back at the start</b>${r.shape === 'out-and-back' ? ' · turn round at the halfway marker' : ''}</p></div>`;

  let trust;
  if (r.tier === 'checked') {
    const c = r.checked;
    trust = `<section class="notes" aria-label="Darren's notes">
      <div class="notes-head"><h3>Darren's notes</h3>${c.sample ? '<span class="sample">Sample</span>' : ''}</div>
      ${c.notes.map((n) => `<p>${esc(n)}</p>`).join('')}
      <dl>
        <dt>Measured on the run</dt><dd>${c.measuredKm ? `${fmtKm(c.measuredKm)} km` : 'Not yet'}</dd>
        <dt>Last checked</dt><dd>${c.lastChecked ? esc(new Date(c.lastChecked).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })) : 'Not yet'}</dd>
        ${c.extras && c.extras.bestTime ? `<dt>Best time</dt><dd>${esc(c.extras.bestTime)}</dd>` : ''}
      </dl>
    </section>`;
  } else {
    trust = `<section class="judgement">
      <h3>Built from the PCN map, not yet run.</h3>
      <p>Paths can be closed or blocked on the day. Use your own judgement.</p>
    </section>`;
  }

  return `<div class="band route-band">
    <div class="route-top"><a class="icon-btn" href="#/" data-action="back" aria-label="Back to routes">${icon('arrow-left')}</a>${tierCapsule(r, true)}</div>
    <div class="route-head">
      <h1 class="route-km"><b>${fmtKm(r.km)}</b><span>km</span><span class="visually-hidden">${shape}</span></h1>
      <p class="route-sub">${sub}</p>
    </div>
  </div>
  <div class="scroll" id="scroll">
    <div class="facts" role="list" aria-label="Measured from the route line">
      <p class="fact" role="listitem"><b>${pct(r.pcnShare)}</b><span>on park connectors</span></p>
      <p class="fact" role="listitem"><b>${r.crossings}</b><span>road ${r.crossings === 1 ? 'crossing' : 'crossings'}</span></p>
      <p class="fact" role="listitem"><b>${r.stairs}</b><span>stair ${r.stairs === 1 ? 'section' : 'sections'}</span></p>
      <p class="fact" role="listitem"><b>${pct(r.repeatShare)}</b><span>${r.shape === 'out-and-back' ? 'repeated (there and back)' : 'repeated'}</span></p>
    </div>
    <div class="legs">
      <div class="leg"><span class="dot">${icon('pin')}</span><p><small>Start</small><b>${esc(placeLabel(r.start))}</b>${codes(r.start)}</p></div>
      <div class="leg"><span class="dot">${icon('map')}</span><p><small>Via</small><b>${esc(via)}</b></p></div>
      ${finishLeg}
    </div>
    ${trust}
    <div class="route-actions">
      <button class="secondary" type="button" data-action="save" data-id="${r.id}" aria-pressed="${saved}" aria-label="${saved ? 'Remove from saved' : 'Save route'}">${icon('bookmark')}</button>
      <button class="primary" type="button" data-action="gpx" data-id="${r.id}">${icon('download')}Send to watch (GPX)</button>
      <button class="secondary" type="button" data-action="share" data-id="${r.id}" aria-label="Share link to this route">${icon('share')}</button>
    </div>
  </div>`;
}

// ---------- Saved ----------

export function savedView(ctx) {
  const list = ctx.saved;
  const head = `<div class="band"><div class="page-head"><h1>Saved</h1><p>On this phone. Works offline.</p></div></div>`;
  if (!list.length) {
    return head + `<div class="scroll"><div class="empty">
      <p class="big-cap"><span>${icon('bookmark')}</span>Nothing saved yet</p>
      <p>Tap the bookmark on any route to keep it here.</p>
      <p>Saved routes stay on this phone. They open without signal, and the route line shows even when the street map can't load.</p>
      <a class="pill-btn pill-btn--ink" href="#/">Find a route</a>
    </div></div>`;
  }
  return head + `<div class="scroll"><ul class="rows">${list.map((s) => routeRow(s.route, { saved: true, thumb: true })).join('')}</ul></div>`;
}

// ---------- About ----------

export function aboutView() {
  return `<div class="band"><div class="page-head"><h1>About</h1><p>Ulu Run · prototype A2</p></div></div>
  <div class="scroll"><div class="prose">
    <section>
      <h2>Routes from your doorstep</h2>
      <p>Most route guides cover Marina Bay, East Coast and MacRitchie. Ulu Run builds routes in every neighbourhood, from the Park Connector Network, so a runner in Teck Whye gets as much as one in town.</p>
    </section>
    <section>
      <h2>Two kinds of route</h2>
      <div class="tier-pair">
        <p><span class="tier tier--checked">${icon('check')}Run &amp; checked</span> Darren has run it. It has his notes, his measured distance and the date he last checked it.</p>
        <p><span class="tier tier--generated">Built from map</span> The app built it from the PCN map. Nobody has run it yet.</p>
      </div>
    </section>
    <section>
      <h2>How routes are made</h2>
      <p>Routes stay on park connectors and park paths where they can. Ordinary footpaths only fill gaps or reach the start. The app avoids road crossings, stairs and running the same stretch twice.</p>
      <p>Every number on a route is measured from its line: distance, share on park connectors, road crossings, stairs and repeats.</p>
    </section>
    <section>
      <h2>Stay safe</h2>
      <p>Use your own judgement. Paths close for works, and the map can't show hoardings, locked gates, traffic or weather. Ulu Run can't promise a path is open, lit or shaded.</p>
    </section>
    <section>
      <h2>Your data</h2>
      <p>No account. Your location and saved routes stay on this phone. The only thing the app loads from elsewhere is the OneMap street map.</p>
    </section>
    <section>
      <h2>Credits and licences</h2>
      <ul>
        <li>Street map: <a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a> © contributors | <a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>.</li>
        <li>Contains information from Park Connector Loop (NParks), Master Plan 2025 Region Boundary (No Sea) and Master Plan 2025 Planning Area Boundary (No Sea) (URA), accessed on 11 Oct 2026 from <a href="https://data.gov.sg/" target="_blank" rel="noopener noreferrer">data.gov.sg</a>, which is made available under the terms of the <a href="https://data.gov.sg/open-data-licence" target="_blank" rel="noopener noreferrer">Singapore Open Data Licence version 1.0</a>.</li>
        <li>Footpaths and station names © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>, under the ODbL.</li>
        <li>Map engine: MapLibre GL JS (BSD-3-Clause). Typeface: Bricolage Grotesque (SIL Open Font Licence).</li>
      </ul>
      <p>Ulu Run is an independent project. It is not endorsed by NParks, SLA, URA or the Singapore Government.</p>
    </section>
    <section>
      <h2>About this prototype</h2>
      <p>Routes exist only around Teck Whye LRT. They were built ahead of time by the same search the app will run on your phone, and "Make me a new route" picks from them. The Run &amp; checked route is a sample until Darren runs it and writes his notes.</p>
    </section>
  </div></div>`;
}

// ---------- Search ----------

export function placeRow(p, i, active) {
  const kind = p.type === 'station' ? p.kind : p.type === 'town' ? 'Town' : '';
  return `<li role="none"><button class="place${active ? ' is-active' : ''}" type="button" role="option" data-idx="${i}" aria-selected="${active}">
    <span class="swatch" style="background:var(--${p.region || 'central'})" aria-hidden="true"></span>
    <b>${esc(p.name)}</b>${codes(p)}<small>${kind}</small>
  </button></li>`;
}
