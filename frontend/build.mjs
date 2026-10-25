// Builds the CAD viewer into ../assets
//
//   cd frontend
//   npm ci
//   npm run build

import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// Tabler icons of the viewer toolbar, in addition to the icons of Redmine
const ICONS = ['zoom-scan', 'box', 'ruler-measure', 'angle',
               'arrows-maximize', 'arrows-minimize', 'maximize', 'minimize',
               'file-type-png', 'file-type-pdf', 'file-3d', 'file-vector'];

const assets = new URL('../assets/', import.meta.url).pathname;

await esbuild.build({
  entryPoints: ['src/cad_preview.js'],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  minify: true,
  legalComments: 'eof',
  outfile: `${assets}javascripts/cad_preview.js`
});

// occt-import-js (STEP, IGES, BREP) is loaded only when needed
const occt = 'node_modules/occt-import-js/dist/';
copyFileSync(`${occt}occt-import-js.js`, `${assets}javascripts/occt-import-js.js`);
copyFileSync(`${occt}occt-import-js.wasm`, `${assets}javascripts/occt-import-js.wasm`);

// SVG sprite in the same format as app/assets/images/icons.svg of Redmine,
// used with sprite_icon(name, plugin: 'redmine_cad_preview')
const symbols = ICONS.map((name) => {
  const svg = readFileSync(`node_modules/@tabler/icons/icons/outline/${name}.svg`, 'utf8');
  const paths = [...svg.matchAll(/<(path|circle|rect|line|polyline|polygon|ellipse)\b[^>]*\/>/g)]
    .map((m) => m[0])
    .filter((element) => !element.includes('stroke="none"'))
    .map((element) => `      ${element.replace(/\s*\/>$/, '/>')}`);
  return `    <symbol viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" id="icon--${name}">\n` +
         `${paths.join('\n')}\n    </symbol>`;
});
mkdirSync(`${assets}images`, { recursive: true });
writeFileSync(`${assets}images/icons.svg`,
              `<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" class="icon--sprite">\n  <defs>\n` +
              `${symbols.join('\n')}\n  </defs>\n</svg>\n`);

// Fonts for texts in DXF drawings (opentype.js reads WOFF, but not WOFF2)
mkdirSync(`${assets}fonts`, { recursive: true });
for (const subset of ['latin', 'latin-ext']) {
  copyFileSync(`node_modules/@fontsource/noto-sans/files/noto-sans-${subset}-400-normal.woff`,
               `${assets}fonts/noto-sans-${subset}-400-normal.woff`);
}
