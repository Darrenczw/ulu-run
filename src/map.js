// The map: OneMap Grey tiles under Singapore's five planning regions in flat colour.
// Zoomed out, the regions are solid lobes on cream water, like a park guide map.
// Zoomed in, they thin to a tint over the street map so routes stay readable.
// OneMap tiles are never cached (OneMap Terms of Use); offline, the flat regions remain.

import { bounds, pointsAlong, lineLength } from './geo.js';
import { fmtKm } from './data.js';

const maplibregl = window.maplibregl;
const C = {
  water: '#F5F1E4', ink: '#2C2E2A', paper: '#FFFDF7',
  west: '#8ED462', north: '#F5E211', 'north-east': '#EBC1FF', central: '#FF705D', east: '#2BA0FF',
};
const SG = [[103.6, 1.21], [104.05, 1.475]];
const TILE_OPACITY = ['interpolate', ['linear'], ['zoom'], 11.4, 0, 12.6, 1];
const REGION_OPACITY = ['interpolate', ['linear'], ['zoom'], 11.8, 1, 12.8, 0.38, 14.5, 0.22];

function arrowImage() {
  const s = 32;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.strokeStyle = C.paper;
  g.lineWidth = 4;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(11, 9);
  g.lineTo(20, 16);
  g.lineTo(11, 23);
  g.stroke();
  return g.getImageData(0, 0, s, s);
}

function el(cls, html) {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  return d;
}

export function createMap(container, data, { onSelect, onOpen }) {
  const map = new maplibregl.Map({
    container,
    bounds: SG,
    maxBounds: [[103.45, 1.1], [104.25, 1.56]],
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    style: {
      version: 8,
      sources: {
        onemap: {
          type: 'raster', tileSize: 256, minzoom: 11, maxzoom: 19,
          tiles: ['https://www.onemap.gov.sg/maps/tiles/Grey/{z}/{x}/{y}.png'],
          bounds: [103.596, 1.1443, 104.4309, 1.4835],
        },
        regions: { type: 'geojson', data: data.regions },
        pcn: { type: 'geojson', data: data.pcn },
        routes: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      },
      layers: [
        { id: 'water', type: 'background', paint: { 'background-color': C.water } },
        { id: 'streets', type: 'raster', source: 'onemap', paint: { 'raster-opacity': TILE_OPACITY, 'raster-fade-duration': 150 } },
        {
          id: 'regions', type: 'fill', source: 'regions',
          paint: { 'fill-color': ['match', ['get', 'key'], 'west', C.west, 'north', C.north, 'north-east', C['north-east'], 'central', C.central, 'east', C.east, C.west], 'fill-opacity': REGION_OPACITY },
        },
        { id: 'region-edges', type: 'line', source: 'regions', paint: { 'line-color': C.water, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 13, 0] } },
        { id: 'pcn-edge', type: 'line', source: 'pcn', minzoom: 12, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': C.ink, 'line-opacity': 0.28, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3, 16, 7] } },
        { id: 'pcn', type: 'line', source: 'pcn', minzoom: 12, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': C.paper, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 16, 4.5] } },
        {
          id: 'routes-dim', type: 'line', source: 'routes', filter: ['!', ['get', 'selected']],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': C.ink, 'line-opacity': 0.72, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 15, 4.5] },
        },
        {
          id: 'routes-casing', type: 'line', source: 'routes', filter: ['get', 'selected'],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': C.paper, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 7, 15, 13] },
        },
        {
          id: 'routes-selected', type: 'line', source: 'routes', filter: ['get', 'selected'],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': C.ink, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 4, 15, 7.5] },
        },
      ],
    },
  });

  let markers = [];
  let capsules = new Map();
  let labelled = []; // [{route, marker, length}] for capsule placement
  let startBox = null;
  let ready = false;
  const queue = [];
  const whenReady = (fn) => (ready ? fn() : queue.push(fn));

  map.on('load', () => {
    map.addImage('arrow', arrowImage(), { pixelRatio: 2 });
    map.addLayer({
      id: 'route-arrows', type: 'symbol', source: 'routes',
      filter: ['all', ['get', 'selected'], ['get', 'arrows']],
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 70, 'icon-image': 'arrow', 'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 16, 1], 'icon-allow-overlap': true, 'icon-rotation-alignment': 'map' },
    });
    ready = true;
    setOffline(!navigator.onLine);
    queue.splice(0).forEach((fn) => fn());
  });

  for (const layer of ['routes-dim', 'routes-selected']) {
    map.on('click', layer, (e) => {
      const id = e.features && e.features[0] && e.features[0].properties.id;
      if (id) onSelect(id, 'map');
    });
    map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
  }

  function clearMarkers() {
    markers.forEach((m) => m.remove());
    markers = [];
    capsules = new Map();
    labelled = [];
    startBox = null;
  }

  // Put each distance capsule somewhere along its own line where it doesn't cover another
  // capsule or the start marker. Re-run whenever the map stops moving.
  const FRACTIONS = [null, 0.3, 0.7, 0.2, 0.8, 0.42, 0.58, 0.12, 0.88, 0.36, 0.64, 0.25, 0.75, 0.5, 0.06, 0.94];
  function placeCapsules() {
    if (!labelled.length) return;
    const size = { w: map.getContainer().clientWidth, h: map.getContainer().clientHeight };
    const boxes = startBox ? [startBox()] : [];
    const hit = (b) => boxes.some((o) => b.x < o.x + o.w + 4 && o.x < b.x + b.w + 4 && b.y < o.y + o.h + 4 && o.y < b.y + b.h + 4);
    const order = [...labelled].sort((a, b) => (b.route.id === selectedNow) - (a.route.id === selectedNow));
    for (const item of order) {
      const w = item.marker.getElement().offsetWidth || 52;
      const h = 28;
      let chosen = null;
      for (const f of FRACTIONS) {
        const ll = f === null ? item.route.labelAt : (pointsAlong(item.route.coords, item.length * f)[0] || {}).coord;
        if (!ll) continue;
        const p = map.project(ll);
        const b = { x: p.x - w / 2, y: p.y - h / 2, w, h };
        if (b.x < 4 || b.y < 4 || b.x + w > size.w - 4 || b.y + h > size.h - 40) continue;
        if (!hit(b)) { chosen = { ll, b }; break; }
      }
      if (!chosen) {
        const p = map.project(item.route.labelAt);
        chosen = { ll: item.route.labelAt, b: { x: p.x - w / 2, y: p.y - h / 2, w, h } };
      }
      item.marker.setLngLat(chosen.ll);
      boxes.push(chosen.b);
    }
  }
  let selectedNow = null;
  map.on('moveend', placeCapsules);

  function addMarker(node, lngLat, anchor = 'center') {
    const m = new maplibregl.Marker({ element: node, anchor }).setLngLat(lngLat).addTo(map);
    markers.push(m);
    return m;
  }

  function startMarker(start, label) {
    const node = el('start-marker', `<span class="cap"><i></i>${label}</span>`);
    node.setAttribute('aria-hidden', 'true');
    addMarker(node, [start.lon, start.lat], 'bottom').setOffset([0, -4]);
    startBox = () => {
      const p = map.project([start.lon, start.lat]);
      const w = node.offsetWidth || 70;
      return { x: p.x - w / 2, y: p.y - 34, w, h: 30 };
    };
  }

  function setRoutes(routes, selectedId, arrows = false) {
    const fc = {
      type: 'FeatureCollection',
      features: routes.map((r) => ({ type: 'Feature', properties: { id: r.id, selected: r.id === selectedId, arrows }, geometry: { type: 'LineString', coordinates: r.coords } })),
    };
    map.getSource('routes').setData(fc);
  }

  // Route view needs more side room: the start and finish capsules are wide labels.
  function fit(coordLists, opts = {}) {
    if (!coordLists.length) return;
    const b = bounds(coordLists);
    const wide = matchMedia('(min-width: 900px)').matches;
    const side = opts.labels ? 92 : 56;
    map.fitBounds(b, {
      padding: wide ? { top: 80, bottom: 70, left: 120, right: 120 } : { top: 56, bottom: 92, left: side, right: side },
      maxZoom: 15.5, duration: opts.instant ? 0 : 650, essential: false,
    });
  }

  function setOffline(off) {
    document.getElementById('offline-note').hidden = !off;
    if (!ready) return;
    map.setLayoutProperty('streets', 'visibility', off ? 'none' : 'visible');
    map.setPaintProperty('regions', 'fill-opacity', off ? 1 : REGION_OPACITY);
  }
  addEventListener('online', () => setOffline(false));
  addEventListener('offline', () => setOffline(true));

  return {
    map,
    resize: () => map.resize(),

    showIsland() {
      whenReady(() => {
        clearMarkers();
        setRoutes([], null);
        map.fitBounds(SG, { padding: 8, duration: 600 });
      });
    },

    showResults(routes, selectedId, start, startLabel, { refit = true } = {}) {
      whenReady(() => {
        clearMarkers();
        setRoutes(routes, selectedId);
        for (const r of routes) {
          const checked = r.tier === 'checked';
          const node = el(`cap-marker${r.id === selectedId ? ' is-selected' : ''}`, `<span class="cap${checked ? ' cap--checked' : ''}">${r.km.toFixed(1)}K${checked && r.checked?.sample ? '<small>Sample</small>' : ''}</span>`);
          node.setAttribute('role', 'button');
          node.setAttribute('tabindex', '-1');
          node.setAttribute('aria-label', `${fmtKm(r.km)} kilometre ${checked ? 'Run and checked' : 'generated'} route`);
          node.addEventListener('click', (e) => {
            e.stopPropagation();
            if (node.classList.contains('is-selected')) onOpen(r.id);
            else onSelect(r.id, 'map');
          });
          capsules.set(r.id, node);
          labelled.push({ route: r, marker: addMarker(node, r.labelAt), length: lineLength(r.coords) });
        }
        selectedNow = selectedId;
        if (start) startMarker(start, startLabel);
        placeCapsules();
        if (refit) {
          if (routes.length) fit(routes.map((r) => r.coords));
          else if (start) map.flyTo({ center: [start.lon, start.lat], zoom: 14, duration: 650 });
        }
      });
    },

    select(id, routes) {
      whenReady(() => {
        setRoutes(routes, id);
        selectedNow = id;
        capsules.forEach((node, rid) => node.classList.toggle('is-selected', rid === id));
      });
    },

    showRoute(route) {
      whenReady(() => {
        clearMarkers();
        setRoutes([route], route.id, true);
        const total = route.km * 1000;
        const oneWay = route.shape === 'out-and-back' ? total / 2 : total;
        for (const p of pointsAlong(route.coords, 1000)) {
          if (p.at > oneWay - 250) break;
          addMarker(el('km-marker', String(Math.round(p.at / 1000))), p.coord);
        }
        if (route.shape === 'out-and-back') {
          const turn = pointsAlong(route.coords, total / 2)[0];
          if (turn) addMarker(el('cap-marker turn-marker', '<span class="cap">Turn here</span>'), turn.coord, 'bottom').setOffset([0, -6]);
        }
        if (route.shape === 'a-b') {
          addMarker(el('start-marker', `<span class="cap"><i></i>Finish · ${route.finish.name}</span>`), [route.finish.lon, route.finish.lat], 'bottom').setOffset([0, -4]);
        }
        startMarker(route.start, route.shape === 'a-b' ? `Start · ${route.start.name}` : `${route.start.name}`);
        fit([route.coords], { labels: true });
      });
    },

    showHere(point) {
      whenReady(() => addMarker(el('here-marker', ''), point));
    },
  };
}
