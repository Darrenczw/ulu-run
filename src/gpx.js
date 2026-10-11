// GPX 1.1 export. One track, named with the shape, distance and trust tier (PRD 7.8, 7.9).

import { SHAPE_NAMES, fmtKm } from './data.js';

const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function gpxName(route) {
  const tier = route.tier === 'checked' ? 'Run & checked' : 'Built from map';
  return `Ulu Run · ${route.start.name} ${SHAPE_NAMES[route.shape]} ${fmtKm(route.km)} km · ${tier}`;
}

export function gpxFileName(route) {
  const tier = route.tier === 'checked' ? 'checked' : 'generated';
  return `ulu-run-${slug(route.start.name)}-${slug(SHAPE_NAMES[route.shape].replace('→', '-to-'))}-${fmtKm(route.km)}km-${tier}.gpx`;
}

export function toGpx(route) {
  const name = esc(gpxName(route));
  const pts = route.coords.map(([lon, lat]) => `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Ulu Run" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${name}</name>
    <desc>${esc(route.tier === 'checked' ? 'Run & checked by Darren.' : 'Built from the PCN map, not yet run. Use your own judgement on the day.')} Path data: NParks PCN (data.gov.sg, SODL v1.0) and © OpenStreetMap contributors.</desc>
  </metadata>
  <trk>
    <name>${name}</name>
    <type>running</type>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}

// iPhone: the share sheet, so the file can go straight to a watch or running app.
// Elsewhere: a normal download.
export async function exportGpx(route) {
  const file = new File([toGpx(route)], gpxFileName(route), { type: 'application/gpx+xml' });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ files: [file], title: gpxName(route) });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
