import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// PencilPattern es cliente-primero: solo necesitamos un dev-server estático (HMR).
// Los Web Workers se empaquetan como módulos ES (worker.format: 'es') para que
// `new Worker(new URL('...', import.meta.url), { type: 'module' })` funcione en dev y build.
export default defineConfig({
  plugins: [svelte()],
  worker: { format: 'es' },
  build: { target: 'esnext' },
  server: { port: 5173 },
});
