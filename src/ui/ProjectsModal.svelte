<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from '../state/projectStore.svelte';
  import type { SavedMeta } from '../persistence/idb';

  let {
    onClose,
    initialTab = 'guardados',
    tutorialsOnly = false,
  }: { onClose: () => void; initialTab?: 'guardados' | 'ejemplos'; tutorialsOnly?: boolean } = $props();
  let tab = $state<'guardados' | 'ejemplos'>(tutorialsOnly ? 'ejemplos' : initialTab);
  let saved = $state<SavedMeta[]>([]);
  let name = $state('');

  async function refresh() {
    saved = await store.listSaved();
  }
  onMount(refresh);

  async function doSave() {
    if (!name.trim()) return;
    await store.saveAs(name);
    name = '';
    await refresh();
  }
  async function doOpen(n: string) {
    await store.openSaved(n);
    onClose();
  }
  async function doDelete(n: string) {
    await store.deleteSaved(n);
    await refresh();
  }
  function fmtDate(t: number): string {
    return t ? new Date(t).toLocaleString() : '';
  }
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label="Projects and examples" tabindex="-1" onmousedown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
  <div class="modal">
    <div class="head">
      <div class="tabs">
        {#if !tutorialsOnly}
          <button class="tab" class:active={tab === 'guardados'} onclick={() => (tab = 'guardados')}>Saved</button>
        {/if}
        <button class="tab" class:active={tab === 'ejemplos'} onclick={() => (tab = 'ejemplos')}>Examples / Tutorial</button>
      </div>
      <button class="close" onclick={onClose} title="Close">×</button>
    </div>

    <div class="body">
      {#if tab === 'guardados'}
        <div class="row">
          <input placeholder="Composition name" bind:value={name} onkeydown={(e) => { if (e.key === 'Enter') doSave(); }} />
          <button onclick={doSave} disabled={!name.trim()}>Save</button>
        </div>
        <div class="row file">
          <button onclick={() => store.exportFile()}>⬇ Export to file</button>
          <button onclick={() => { store.importFile(); onClose(); }}>⬆ Import file</button>
        </div>
        <ul class="list">
          {#each saved as s (s.name)}
            <li>
              <button class="open" onclick={() => doOpen(s.name)}>{s.name}</button>
              <span class="meta">{fmtDate(s.savedAt)}</span>
              <button class="del" onclick={() => doDelete(s.name)} title="Delete">✕</button>
            </li>
          {/each}
          {#if saved.length === 0}<li class="empty">No saved compositions yet.</li>{/if}
        </ul>
      {:else}
        <p class="hint">Load an example: it appears with floating comments next to the relevant nodes to explain how it works.</p>
        <div class="gallery">
          {#each store.examples() as e (e.id)}
            <button class="ex-card" onclick={() => { store.loadExample(e.id); onClose(); }} title={e.description}>
              <span class="ex-title">{e.title}</span>
              <span class="ex-desc">{e.description}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.78);
    display: grid;
    place-items: center;
    z-index: 100;
  }
  .modal {
    width: min(720px, 94vw);
    height: 80vh;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 6px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--line);
    background: var(--panel-2);
  }
  .tabs {
    display: flex;
    gap: 6px;
  }
  .tab.active {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }
  .close {
    font-size: 18px;
    padding: 2px 9px;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .row {
    display: flex;
    gap: 8px;
  }
  .row input {
    flex: 1;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 5px;
    padding: 5px 8px;
  }
  .hint {
    color: var(--muted);
    font-size: 12px;
    margin: 0;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .list li {
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 4px 8px;
    background: var(--panel-2);
  }
  .list .open {
    background: none;
    border: none;
    color: var(--text);
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    flex: 0 0 auto;
  }
  .list .open:hover {
    color: var(--accent);
  }
  .list .meta {
    color: var(--muted);
    font-size: 11px;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .list .del {
    border-color: transparent;
    background: transparent;
    color: var(--muted);
    padding: 2px 7px;
  }
  .list .del:hover {
    border-color: var(--danger-border);
    color: var(--danger);
  }
  .empty {
    color: var(--muted);
    font-style: italic;
    justify-content: center;
  }
  .gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 8px;
  }
  .ex-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel-2);
    cursor: pointer;
  }
  .ex-card:hover {
    border-color: var(--accent);
    background: var(--bg);
  }
  .ex-title {
    font-weight: 600;
    color: var(--text);
  }
  .ex-desc {
    font-size: 11.5px;
    line-height: 1.35;
    color: var(--muted);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
