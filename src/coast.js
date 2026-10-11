// The results panel's top edge: the start region's real northern outline, from the
// planning-region data. When the start moves to another region, the edge morphs to the new one.

const W = 390;
const H = 36;
const TOP = 3;

function pathFor(profile) {
  const n = profile.length;
  const pts = profile.map((v, i) => [(i / (n - 1)) * W, TOP + (1 - v) * (H - TOP - 6)]);
  // Catmull-Rom through the samples, as cubic Béziers, so the edge reads as a coastline, not a chart.
  let d = `M0 ${H} L0 ${pts[0][1].toFixed(2)} `;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)} `;
  }
  return d + `L${W} ${H} Z`;
}

export function createCoast(pathEl, profiles) {
  let current = null;
  let frame = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  return function setRegion(key) {
    const target = profiles[key] || profiles.central;
    if (!current || reduce.matches) {
      current = target.slice();
      pathEl.setAttribute('d', pathFor(current));
      return;
    }
    const from = current.slice();
    const t0 = performance.now();
    const dur = 420;
    cancelAnimationFrame(frame);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - t, 4);
      current = from.map((v, i) => v + (target[i] - v) * e);
      pathEl.setAttribute('d', pathFor(current));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };
}
