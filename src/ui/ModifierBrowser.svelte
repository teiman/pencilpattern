<script lang="ts">
  import { store } from '../state/projectStore.svelte';
  import { MODIFIERS } from '../engine/modifiers/registry';
  import type { ModifierCategory, ModifierDef } from '../engine/graph/types';

  // Browser de modificadores: se abre al pulsar "+ mod" en un carril. Lista los
  // modificadores agrupados por categoría, con búsqueda. Al elegir uno, lo añade.
  const CATEGORIES: { id: ModifierCategory; label: string }[] = [
    { id: 'noise', label: 'Noise' },
    { id: 'material', label: 'Materials' },
    { id: 'filter', label: 'Filters' },
    { id: 'tone', label: 'Tone / Color' },
    { id: 'stylize', label: 'Stylize' },
  ];

  // Excluye la fuente-imagen (se añade con Upload/Paste, no aquí).
  const ALL = MODIFIERS.filter((m) => !m.imageSource);

  let query = $state('');

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return q ? ALL.filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)) : ALL;
  });

  function groupOf(cat: ModifierCategory): ModifierDef[] {
    return filtered.filter((m) => m.category === cat);
  }

  const byId = new Map(ALL.map((m) => [m.id, m]));
  const noQuery = $derived(query.trim() === '');
  // Filas fijadas arriba solo sin búsqueda activa.
  const recent = $derived(
    noQuery ? store.recentModifierIds.map((id) => byId.get(id)).filter((m): m is ModifierDef => !!m) : [],
  );
  const favorites = $derived(
    noQuery ? store.favoriteModifierIds.map((id) => byId.get(id)).filter((m): m is ModifierDef => !!m) : [],
  );

  function kindLabel(m: ModifierDef): string {
    return m.inputArity === 0 ? 'source' : `${m.inputArity} in`;
  }
  function previewUrl(id: string): string {
    return `${import.meta.env.BASE_URL}previews/${id}.png`;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') store.closeModifierBrowser();
  }

  // Foco inicial en el buscador (sin atributo autofocus).
  function focusOnMount(el: HTMLInputElement) {
    el.focus();
  }
</script>

<svelte:window onkeydown={onKey} />

{#snippet card(m: ModifierDef)}
  <div class="card">
    <button class="pick" onclick={() => store.pickModifier(m.id)} title={m.description ? `${m.name} — ${m.description}` : `Add ${m.name}`}>
      <span class="thumb">
        <img
          src={previewUrl(m.id)}
          alt=""
          loading="lazy"
          onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
        />
      </span>
      <span class="label">
        <span class="name-row">
          <span class="name">{m.name}</span>
          <span class="meta">{kindLabel(m)}</span>
        </span>
        {#if m.description}<span class="desc">{m.description}</span>{/if}
      </span>
    </button>
    <button
      class="star"
      class:on={store.isFavoriteModifier(m.id)}
      onclick={(e) => {
        e.stopPropagation();
        store.toggleFavoriteModifier(m.id);
      }}
      title={store.isFavoriteModifier(m.id) ? 'Remove from favorites' : 'Add to favorites'}
      aria-pressed={store.isFavoriteModifier(m.id)}
    >{store.isFavoriteModifier(m.id) ? '★' : '☆'}</button>
  </div>
{/snippet}

<div
  class="overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="modbrowser-title"
  tabindex="-1"
  onmousedown={(e) => {
    if (e.target === e.currentTarget) store.closeModifierBrowser();
  }}
>
  <div class="modal">
    <div class="head">
      <h2 id="modbrowser-title">Add modifier</h2>
      <input
        class="search"
        placeholder="Search modifiers…"
        bind:value={query}
        use:focusOnMount
      />
      <button class="close" onclick={() => store.closeModifierBrowser()} title="Close (Esc)">×</button>
    </div>

    <div class="body">
      {#if favorites.length}
        <div class="group">★ Favorites</div>
        <div class="grid">
          {#each favorites as m (m.id)}{@render card(m)}{/each}
        </div>
      {/if}
      {#if recent.length}
        <div class="group">Recent</div>
        <div class="grid">
          {#each recent as m (m.id)}{@render card(m)}{/each}
        </div>
      {/if}
      {#each CATEGORIES as cat (cat.id)}
        {@const items = groupOf(cat.id)}
        {#if items.length}
          <div class="group">{cat.label}</div>
          <div class="grid">
            {#each items as m (m.id)}{@render card(m)}{/each}
          </div>
        {/if}
      {/each}
      {#if filtered.length === 0}
        <p class="empty">No modifiers match “{query}”.</p>
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
    width: min(760px, 94vw);
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
    flex-wrap: wrap;
    gap: 10px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--line);
    background: var(--panel-2);
  }
  .head h2 {
    margin: 0;
    font-size: 15px;
    flex-shrink: 0;
  }
  .search {
    flex: 1 1 180px;
    min-width: 140px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    color: var(--text);
    padding: 6px 10px;
    font-size: 13px;
  }
  .close {
    font-size: 18px;
    line-height: 1;
    padding: 2px 9px;
    flex-shrink: 0;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 14px;
  }
  .group {
    font-weight: 600;
    color: var(--accent);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 12px 0 6px;
    border-bottom: 1px solid var(--line);
    padding-bottom: 3px;
  }
  .group:first-child {
    margin-top: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 10px;
  }
  .card {
    position: relative;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel-2);
  }
  .card:hover {
    border-color: var(--accent);
    background: var(--bg);
  }
  .pick {
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-align: left;
    padding: 6px;
    width: 100%;
    background: none;
    border: none;
    border-radius: 8px;
    cursor: pointer;
  }
  .pick:hover {
    border-color: transparent;
  }
  .star {
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 0 4px;
    font-size: 14px;
    line-height: 1;
    background: rgba(0, 0, 0, 0.55);
    border: none;
    border-radius: 4px;
    color: var(--muted);
    opacity: 0;
    transition: opacity 0.12s;
  }
  .card:hover .star,
  .star.on,
  .star:focus-visible {
    opacity: 1;
  }
  .star.on {
    color: var(--accent);
  }
  .thumb {
    display: block;
    aspect-ratio: 1;
    width: 100%;
    border-radius: 5px;
    overflow: hidden;
    background:
      repeating-conic-gradient(#2a2a2a 0% 25%, #222 0% 50%) 50% / 16px 16px;
    border: 1px solid var(--line);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    image-rendering: auto;
    display: block;
  }
  .label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 2px 2px;
  }
  .name-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
  }
  .card .name {
    font-weight: 600;
    color: var(--text);
    line-height: 1.2;
  }
  .card .meta {
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.4px;
    flex-shrink: 0;
  }
  .card .desc {
    font-size: 10.5px;
    line-height: 1.3;
    color: var(--muted);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .empty {
    color: var(--muted);
    font-style: italic;
  }
</style>
