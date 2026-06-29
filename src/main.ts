import './app.css';
import { mount } from 'svelte';
import App from './ui/App.svelte';
import { store } from './state/projectStore.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('#app no encontrado');

const app = mount(App, { target });

void store.boot();

// Generador de previews del browser de modificadores (solo dev): expone
// window.__genPreviews(). Ver src/dev/genPreviews.ts.
if (import.meta.env.DEV) {
  void import('./dev/genPreviews');
  (window as unknown as Record<string, unknown>)['__store'] = store;
}

// PWA: registra el service worker SOLO en producción. En desarrollo lo
// desregistramos y limpiamos cachés para no servir assets obsoletos (la causa de
// que un cambio de código no se viera al recargar).
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  } else {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {});
    if (typeof caches !== 'undefined') {
      caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
    }
  }
}

export default app;
