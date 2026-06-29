// Renderiza el nodo final de ejemplos concretos a PNG (para inspección visual).
// Uso: node scripts/snap-examples.mjs id1 id2 …   → escribe en scratchpad.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const GLOBAL_ROOT = process.env.NPM_GLOBAL_ROOT || 'C:/Users/veran/AppData/Roaming/npm/node_modules';
const { chromium } = require(join(GLOBAL_ROOT, 'playwright'));
const URL = process.env.PREVIEW_URL || 'http://localhost:5175/';
const OUT = process.env.SNAP_OUT || '.';
const ids = process.argv.slice(2);

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => typeof window.__validateExample === 'function', null, { timeout: 30000 });

for (const id of ids) {
  const dataUrl = await page.evaluate(async (eid) => {
    const { exampleById } = await import('/src/engine/examples.ts?t=' + Date.now());
    const e = exampleById(eid);
    if (!e) return null;
    const project = e.build();
    const last = project.bands[project.bands.length - 1];
    const finalCode = last.stops[last.stops.length - 1];
    // reusar validateExample para montar el motor y exportar, pero queremos el dataURL:
    const { Engine } = await import('/src/engine/engine.ts');
    const eng = new Engine();
    await eng.init();
    await eng.loadProject(project);
    const blob = await eng.exportPng(finalCode, 128);
    await eng.dispose();
    return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
  }, id);
  if (!dataUrl) { console.log('skip', id); continue; }
  writeFileSync(join(OUT, `ex-${id}.png`), Buffer.from(String(dataUrl).split(',')[1], 'base64'));
  console.log('✓', id);
}
await browser.close();
