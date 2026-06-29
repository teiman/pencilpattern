<script lang="ts">
  import { store } from '../state/projectStore.svelte';
  import type { Band } from '../engine/graph/types';
  import Cell from './Cell.svelte';
  import Edge from './Edge.svelte';

  let { band }: { band: Band } = $props();
  const stops = $derived(band.stops.filter((c) => store.project.states[c]));
  // Hint según la posición de la banda: la primera suele empezar por un generador;
  // las siguientes a menudo combinan/transforman lo de arriba.
  const isFirstBand = $derived(store.project.bands[0]?.id === band.id);
  const emptyHint = $derived(
    isFirstBand
      ? 'Empty lane — start with a generator (FBM, Worley, Wood…):'
      : 'Empty lane — add a generator, a filter, or an image:',
  );

  let dragOver = $state(false);
  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    dragOver = true;
  }
  function onDrop(e: DragEvent) {
    dragOver = false;
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    e.preventDefault();
    void store.handleDrop(band.id, files);
  }
</script>

<div class="band">
  <div
    class="lane-head"
    oncontextmenu={(e) => {
      e.preventDefault();
      store.openContextMenu(e.clientX, e.clientY, store.laneMenu(band.id));
    }}
    role="toolbar"
    tabindex="-1"
  >
    <input
      class="name"
      value={band.name}
      oninput={(e) => store.renameBand(band.id, e.currentTarget.value)}
      aria-label="Lane name"
      spellcheck="false"
    />
    <button class="del" onclick={() => store.removeBand(band.id)} title="Delete lane">✕</button>
  </div>
  <div
    class="lane"
    class:dragover={dragOver}
    ondragover={onDragOver}
    ondragleave={() => (dragOver = false)}
    ondrop={onDrop}
    role="group"
    aria-label="Lane nodes (drop an image here to add it)"
  >
    {#if stops.length === 0}
      <div class="empty">
        <span class="hint">{emptyHint}</span>
        <button onclick={() => store.openModifierBrowser(band.id)} title="Modifier (generator or filter)">＋ mod</button>
        <button onclick={() => store.addUploadedImage(band.id)} title="Upload an image file">⬆ Upload image</button>
        <button onclick={() => store.addPastedImage(band.id)} title="Paste image from clipboard">📋 Paste</button>
      </div>
    {:else}
      {#each stops as code (code)}
        {#if !store.isImage(code)}<Edge toCode={code} />{/if}
        <div class="node">
          <Cell {code} />
          {#if store.project.states[code]?.note}
            <div class="note">{store.project.states[code]?.note}</div>
          {/if}
        </div>
      {/each}
      <button class="ghost" onclick={() => store.openModifierBrowser(band.id)} title="Add modifier">＋ mod</button>
    {/if}
  </div>
</div>

<style>
  .band {
    flex: 0 0 auto;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel);
    overflow: hidden;
  }
  .lane-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 8px;
    background: var(--panel-2);
    border-bottom: 1px solid var(--line);
  }
  .name {
    font: inherit;
    font-weight: 600;
    color: var(--text);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 5px;
    padding: 2px 6px;
    min-width: 0;
    flex: 1;
  }
  .name:focus {
    border-color: var(--accent-2);
    background: var(--bg);
  }
  .del {
    flex: 0 0 auto;
    padding: 2px 8px;
    color: var(--muted);
    border-color: transparent;
    background: transparent;
  }
  .del:hover {
    border-color: var(--danger-border);
    color: var(--danger);
  }
  .lane {
    display: flex;
    gap: 4px;
    padding: 12px;
    overflow-x: auto;
    align-items: center;
    border-radius: 8px;
    outline: 2px dashed transparent;
    outline-offset: -4px;
    transition: outline-color 0.12s, background 0.12s;
  }
  .lane.dragover {
    outline-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .node {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    flex: 0 0 auto;
  }
  .note {
    max-width: 210px;
    font-size: 11px;
    line-height: 1.3;
    color: #e7d9a8;
    background: #2a2410;
    border: 1px solid #5a4a2c;
    border-radius: 6px;
    padding: 5px 8px;
  }
  .ghost {
    align-self: center;
    border-style: dashed;
    color: var(--muted);
    height: 40px;
    min-width: 56px;
    margin-left: 6px;
    flex: 0 0 auto;
    opacity: 0.35;
    transition: opacity 0.12s;
  }
  .ghost:hover,
  .ghost:focus-visible {
    opacity: 1;
  }
  .empty {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 8px 2px;
  }
  .hint {
    color: var(--muted);
    font-style: italic;
    margin-right: 4px;
  }
</style>
