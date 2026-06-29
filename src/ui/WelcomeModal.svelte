<script lang="ts">
  import { store } from '../state/projectStore.svelte';

  // Bienvenida de primera ejecución. La visibilidad la decide App (flag localStorage
  // + sin autosave). Aquí solo presentamos las tres rutas de entrada.
  let { onClose }: { onClose: () => void } = $props();

  const firstExample = $derived(store.examples()[0]);

  function tour() {
    if (firstExample) store.loadExample(firstExample.id);
    onClose();
  }
  function explore() {
    onClose();
  }
  function blank() {
    store.newProject();
    onClose();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onKey} />

<div
  class="overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="welcome-title"
  tabindex="-1"
  onmousedown={(e) => {
    if (e.target === e.currentTarget) onClose();
  }}
>
  <div class="modal">
    <button class="close" onclick={onClose} title="Close (Esc)" aria-label="Close">×</button>
    <h2 id="welcome-title">Welcome to PencilPattern</h2>
    <p class="lead">
      A node-based procedural texture generator. You build textures in
      <b>bands</b> (rows) made of <b>nodes</b>, each running a <b>modifier</b> (a
      generator like noise/wood, or a filter that transforms the previous node).
      Nodes can read from any band.
    </p>
    <div class="choices">
      <button class="choice primary" onclick={tour}>
        <span class="ico">🎓</span>
        <span class="ct">
          <span class="ch">5-minute tour</span>
          <span class="cd">Open a guided example with notes next to the nodes.</span>
        </span>
      </button>
      <button class="choice" onclick={explore}>
        <span class="ico">🧩</span>
        <span class="ct">
          <span class="ch">Explore the demo</span>
          <span class="cd">Poke at the wood × pattern × blend project that's already loaded.</span>
        </span>
      </button>
      <button class="choice" onclick={blank}>
        <span class="ico">✏️</span>
        <span class="ct">
          <span class="ch">Start blank</span>
          <span class="cd">A fresh project with one empty band — build from scratch.</span>
        </span>
      </button>
    </div>
    <p class="hint">Tip: press <kbd>Ctrl</kbd>+<kbd>K</kbd> anytime for the command palette.</p>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.78);
    display: grid;
    place-items: center;
    z-index: 160;
  }
  .modal {
    position: relative;
    width: min(540px, 92vw);
    max-height: 90vh;
    overflow-y: auto;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 22px 24px;
  }
  .close {
    position: absolute;
    top: 10px;
    right: 12px;
    font-size: 20px;
    line-height: 1;
    padding: 2px 8px;
    background: none;
    border: none;
    color: var(--muted);
  }
  h2 {
    margin: 0 0 8px;
    font-size: 19px;
  }
  .lead {
    color: var(--muted);
    font-size: 13px;
    line-height: 1.5;
    margin: 0 0 16px;
  }
  .choices {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .choice {
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    padding: 11px 13px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--panel-2);
    cursor: pointer;
  }
  .choice:hover {
    border-color: var(--accent);
    background: var(--bg);
  }
  .choice.primary {
    border-color: var(--accent);
  }
  .ico {
    font-size: 22px;
    flex-shrink: 0;
  }
  .ct {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ch {
    font-weight: 600;
    color: var(--text);
  }
  .cd {
    font-size: 12px;
    color: var(--muted);
  }
  .hint {
    margin: 16px 0 0;
    font-size: 12px;
    color: var(--muted);
  }
  kbd {
    font-family: ui-monospace, monospace;
    font-size: 11px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 0 4px;
  }
</style>
