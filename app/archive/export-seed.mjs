// One-off archival: serialize every data/*.js seed module's data exports to
// retained JSON under archive/seed/. Functions are skipped. Run once:
//   node archive/export-seed.mjs
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, 'seed');
mkdirSync(outDir, { recursive: true });

const modules = [
  'candidates', 'deals', 'flow', 'mandates',
  'news', 'personas', 'research', 'signals', 'workspace'
];

const manifest = { archivedAt: new Date().toISOString(), modules: {} };

for (const name of modules) {
  const mod = await import(`../data/${name}.js`);
  const data = {};
  for (const [key, val] of Object.entries(mod)) {
    if (typeof val === 'function') continue; // skip helpers/factories
    data[key] = val;
  }
  const file = join(outDir, `${name}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2));
  manifest.modules[name] = {
    file: `seed/${name}.json`,
    exports: Object.keys(data)
  };
  console.log(`archived ${name}: [${Object.keys(data).join(', ')}]`);
}

writeFileSync(join(outDir, '_manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\nmanifest written; ${modules.length} modules archived to archive/seed/`);
