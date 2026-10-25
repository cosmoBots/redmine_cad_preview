// Builds the CAD viewer into ../assets
//
//   cd frontend
//   npm ci
//   npm run build

import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

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

// Fonts for texts in DXF drawings (opentype.js reads WOFF, but not WOFF2)
mkdirSync(`${assets}fonts`, { recursive: true });
for (const subset of ['latin', 'latin-ext']) {
  copyFileSync(`node_modules/@fontsource/noto-sans/files/noto-sans-${subset}-400-normal.woff`,
               `${assets}fonts/noto-sans-${subset}-400-normal.woff`);
}
