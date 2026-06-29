<script lang="ts">
  import { store } from '../state/projectStore.svelte';
  import type { ContextItem } from '../state/projectStore.svelte';

  // Menú contextual global. Se monta una vez en App; el contenido y la posición
  // vienen de store.contextMenu (lo abre cualquier host vía store.openContextMenu).
  const m = $derived(store.contextMenu);

  let menuEl = $state<HTMLDivElement | null>(null);
  // Posición ajustada para no desbordar la ventana.
  let pos = $state<{ x: number; y: number }>({ x: 0, y: 0 });

  $effect(() => {
    const cm = store.contextMenu;
    if (!cm) return;
    pos = { x: cm.x, y: cm.y };
    // Tras montar, corrige si se sale por el borde derecho/inferior.
    requestAnimationFrame(() => {
      if (!menuEl) return;
      const r = menuEl.getBoundingClientRect();
      let { x, y } = cm;
      if (x + r.width > window.innerWidth) x = Math.max(4, window.innerWidth - r.width - 4);
      if (y + r.height > window.innerHeight) y = Math.max(4, window.innerHeight - r.height - 4);
      pos = { x, y };
    });
  });

  function run(item: ContextItem) {
    if (item.kind !== 'item' || item.disabled) return;
    store.closeContextMenu();
    item.action();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') store.closeContextMenu();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if m}
  <!-- Capa que captura clic/scroll fuera para cerrar. -->
  <div
    class="cm-overlay"
    role="presentation"
    onpointerdown={() => store.closeContextMenu()}
    oncontextmenu={(e) => {
      e.preventDefault();
      store.closeContextMenu();
    }}
    onwheel={() => store.closeContextMenu()}
  ></div>
  <div
    bind:this={menuEl}
    class="cm"
    role="menu"
    tabindex="-1"
    style:left={`${pos.x}px`}
    style:top={`${pos.y}px`}
  >
    {#each m.items as item, i (i)}
      {#if item.kind === 'sep'}
        <div class="cm-sep" role="separator"></div>
      {:else}
        <button
          class="cm-item"
          class:danger={item.danger}
          role="menuitem"
          disabled={item.disabled}
          onclick={() => run(item)}
        >{item.label}</button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .cm-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
  }
  .cm {
    position: fixed;
    z-index: 201;
    min-width: 168px;
    padding: 4px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .cm-item {
    text-align: left;
    background: none;
    border: none;
    border-radius: 5px;
    padding: 5px 10px;
    color: var(--text);
    font-size: 12px;
    cursor: pointer;
  }
  .cm-item:hover:not(:disabled),
  .cm-item:focus-visible {
    background: var(--accent);
    color: var(--on-accent);
  }
  .cm-item:disabled {
    color: var(--muted);
    cursor: default;
    opacity: 0.6;
  }
  .cm-item.danger:hover:not(:disabled) {
    background: var(--danger-border);
    color: var(--danger);
  }
  .cm-sep {
    height: 1px;
    background: var(--line);
    margin: 3px 4px;
  }
</style>
