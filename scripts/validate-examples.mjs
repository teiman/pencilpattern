// Valida todos los ejemplos del tutorial conduciendo el dev server con Playwright.
// El motor elige backend (WebGPU→WebGL2→CPU); aquí renderizamos el nodo final de
// cada ejemplo y reportamos los degenerados (negro/blanco/sólido) o con error.
//
// Uso: node scripts/validate-examples.mjs
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const GLOBAL_ROOT = process.env.NPM_GLOBAL_ROOT || 'C:/Users/veran/AppData/Roaming/npm/node_modules';
const { chromium } = require(join(GLOBAL_ROOT, 'playwright'));

const URL = process.env.PREVIEW_URL || 'http://localhost:5174/';

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  pageerror>', e.message));

console.log('Abriendo', URL, '…');
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => typeof window.__validateAllExamples === 'function', null, { timeout: 30000 });

const backend = await page.evaluate(async () => (await window.__listPreviewIds()).backend);
console.log('Backend:', backend);

const t0 = Date.now();
const { total, bad } = await page.evaluate(() => window.__validateAllExamples());
console.log(`\nValidados ${total} ejemplos en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`Degenerados: ${bad.length}\n`);
for (const b of bad) {
  console.log(`  ✗ ${b.id.padEnd(10)} ${b.reason?.padEnd(20) ?? ''} mean=${b.meanL.toFixed(3)} std=${b.stdL.toFixed(3)} buckets=${b.uniqueBuckets}`);
}

await browser.close();
process.exit(bad.length ? 1 : 0);
