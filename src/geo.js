// Small geometry helpers. Coordinates are [lon, lat] throughout, as in GeoJSON.

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

export function distance(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function lineLength(coords) {
  let m = 0;
  for (let i = 1; i < coords.length; i++) m += distance(coords[i - 1], coords[i]);
  return m;
}

// Points every `step` metres along a line, with how far along each one is.
export function pointsAlong(coords, step) {
  const out = [];
  let walked = 0;
  let next = step;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const seg = distance(a, b);
    while (seg > 0 && walked + seg >= next) {
      const t = (next - walked) / seg;
      out.push({ at: next, coord: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] });
      next += step;
    }
    walked += seg;
  }
  return out;
}

export function bounds(coordLists) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const coords of coordLists) {
    for (const [x, y] of coords) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
  }
  return [[w, s], [e, n]];
}

export function regionAt(point, regions) {
  const [x, y] = point;
  for (const f of regions.features) {
    for (const poly of f.geometry.coordinates) {
      const ring = poly[0];
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) return f.properties.key;
    }
  }
  return null;
}

// An SVG path of the route, fitted into a size x size box. Used where the street map isn't available.
export function outlinePath(coords, size, pad = 8) {
  const lat0 = rad(coords[0][1]);
  const pts = coords.map(([x, y]) => [x * Math.cos(lat0), y]);
  const [[w, s], [e, n]] = bounds([pts]);
  const span = Math.max(e - w, n - s) || 1e-6;
  const k = (size - pad * 2) / span;
  const ox = (size - (e - w) * k) / 2;
  const oy = (size - (n - s) * k) / 2;
  const P = pts.map(([x, y]) => [ox + (x - w) * k, oy + (n - y) * k]);
  const d = 'M' + P.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');
  return { d, start: P[0], end: P[P.length - 1] };
}
