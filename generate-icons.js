import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const iconDir = path.resolve('public/icons');
const svg = path.join(iconDir, 'duetto-icon-light.svg');

if (!fs.existsSync(svg)) {
  console.error('missing', svg);
  process.exit(1);
}

const sizes = [
  { name: 'icon16.png', width: 16 },
  { name: 'icon48.png', width: 48 },
  { name: 'icon128.png', width: 128 },
];

for (const { name, width } of sizes) {
  const dest = path.join(iconDir, name);
  execFileSync(
    'npx',
    ['--yes', '@resvg/resvg-js-cli', '--fit-width', String(width), svg, dest],
    { stdio: 'inherit' }
  );
  console.log('ok', name);
}
