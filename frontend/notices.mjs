// Checks that the versions in THIRD_PARTY_NOTICES.md are the versions in
// package-lock.json, and updates them with --write.
//
//   node notices.mjs           exits with an error if a version differs
//   node notices.mjs --write   updates the versions

import { readFileSync, writeFileSync } from 'node:fs';

// Name in THIRD_PARTY_NOTICES.md => npm package
const PACKAGES = {
  'three.js': 'three',
  'occt-import-js': 'occt-import-js',
  'dxf-viewer': 'dxf-viewer',
  'opentype.js': 'opentype.js',
  earcut: 'earcut',
  'Tabler Icons': '@tabler/icons',
  'Noto Sans': '@fontsource/noto-sans'
};

const noticesPath = new URL('../THIRD_PARTY_NOTICES.md', import.meta.url);
const lock = JSON.parse(readFileSync(new URL('package-lock.json', import.meta.url), 'utf8'));
const notices = readFileSync(noticesPath, 'utf8');
const differences = [];

const updated = notices.replace(/^\| \[([^\]]+)\]\(([^)]*)\) \| (\d[\w.]*)/gm, (row, name, url, version) => {
  const pkg = PACKAGES[name];
  const locked = pkg && lock.packages[`node_modules/${pkg}`]?.version;
  if (!locked || locked === version) return row;

  differences.push(`${name}: ${version} => ${locked}`);
  return `| [${name}](${url}) | ${locked}`;
});

if (process.argv.includes('--write')) {
  writeFileSync(noticesPath, updated);
  differences.forEach((difference) => console.log(`Updated ${difference}`));
} else if (differences.length > 0) {
  console.error('THIRD_PARTY_NOTICES.md is not up to date (run node notices.mjs --write):');
  differences.forEach((difference) => console.error(`  ${difference}`));
  process.exit(1);
}
