// Genera los PNG de preview faltantes conduciendo el dev server con Playwright.
// El motor elige solo el backend (WebGPU→WebGL2→CPU) vía su broker; aquí solo
// pedimos __renderPreview(id) y guardamos el dataURL como archivo.
//
// Uso: node scripts/gen-previews.mjs [id1 id2 …]
//   sin args  -> genera SOLO los ids que faltan en public/previews/
//   con args  -> genera exactamente esos ids
import { createRequire } from 'node:module';
import { writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'previews');

// Playwright está instalado globalmente (npx), no como dep local: resuélvelo
// desde el global npm root para poder importarlo en este script suelto.
const require = createRequire(import.meta.url);
const GLOBAL_ROOT = process.env.NPM_GLOBAL_ROOT || 'C:/Users/veran/AppData/Roaming/npm/node_modules';
const { chromium } = require(join(GLOBAL_ROOT, 'playwright'));
const URL = process.env.PREVIEW_URL || 'http://localhost:5174/';

const argIds = process.argv.slice(2);

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('[genPreviews]') || t.includes('backend')) console.log('  page>', t);
});

console.log('Abriendo', URL, '…');
await page.goto(URL, { waitUntil: 'load' });

// Espera a que los helpers de dev estén expuestos en window.
await page.waitForFunction(() => typeof window.__renderPreview === 'function' && typeof window.__listPreviewIds === 'function', null, { timeout: 30000 });

const { ids, backend } = await page.evaluate(() => window.__listPreviewIds());
console.log('Backend elegido por el broker:', backend);
if (backend === 'none') {
  console.error('Sin backend disponible; no se pueden renderizar previews.');
  await browser.close();
  process.exit(1);
}

const have = new Set(readdirSync(OUT).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, '')));
const targets = argIds.length ? argIds : ids.filter((id) => !have.has(id));
console.log('A generar:', targets.length ? targets.join(', ') : '(nada falta)');

let ok = 0;
for (const id of targets) {
  try {
    const dataUrl = await page.evaluate((mid) => window.__renderPreview(mid), id);
    const b64 = String(dataUrl).split(',')[1];
    writeFileSync(join(OUT, `${id}.png`), Buffer.from(b64, 'base64'));
    console.log(`  ✓ ${id}.png`);
    ok++;
  } catch (e) {
    console.warn(`  ✗ ${id}:`, e?.message ?? e);
  }
}

console.log(`Hecho: ${ok}/${targets.length} previews escritos en public/previews/`);
await browser.close();
