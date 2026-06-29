<script lang="ts">
  import { store } from '../state/projectStore.svelte';
  import { MODIFIERS } from '../engine/modifiers/registry';

  // Paleta de comandos (Ctrl+K): busca acciones, modificadores y nodos.
  let { onClose }: { onClose: () => void } = $props();

  type Cmd = { id: string; label: string; hint: string; run: () => void };

  // Banda destino para "añadir modificador": la del nodo seleccionado, o la primera.
  function targetBand(): string | undefined {
    const sel = store.selected;
    if (sel) return store.bandOf(sel.code)?.id;
    return store.project.bands[0]?.id;
  }

  function buildCommands(): Cmd[] {
    const cmds: Cmd[] = [];
    // Acciones estáticas.
    cmds.push(
      { id: 'a:save', label: 'Save project', hint: 'action', run: () => void store.quickSave() },
      { id: 'a:export', label: 'Export active node as PNG', hint: 'action', run: () => void store.exportActive() },
      { id: 'a:exportall', label: 'Export all nodes (zip)', hint: 'action', run: () => void store.exportAll() },
      { id: 'a:exportpbr', label: 'Export PBR bundle (zip)', hint: 'action', run: () => void store.exportPbrBundle() },
      { id: 'a:exportorm', label: 'Export ORM channel-pack (AO·Rough·Metal)', hint: 'action', run: () => void store.exportOrmPack() },
      { id: 'a:addband', label: 'Add band', hint: 'action', run: () => store.addBand() },
      { id: 'a:randomize', label: 'Randomize seeds', hint: 'action', run: () => store.randomizeSeeds() },
      { id: 'a:undo', label: 'Undo', hint: 'action', run: () => store.undo() },
      { id: 'a:redo', label: 'Redo', hint: 'action', run: () => store.redo() },
    );
    if (store.selected) {
      const c = store.selected.code;
      cmds.push(
        { id: 'a:dup', label: `Duplicate ${store.displayName(c)}`, hint: 'node', run: () => store.duplicateStop(c) },
        { id: 'a:view', label: `Open viewer: ${store.displayName(c)}`, hint: 'node', run: () => void store.openViewer(c) },
      );
    }
    // Añadir modificadores.
    const band = targetBand();
    if (band) {
      for (const m of MODIFIERS) {
        if (m.imageSource) continue;
        cmds.push({ id: `m:${m.id}`, label: `Add ${m.name}`, hint: 'add', run: () => store.addModifier(band, m.id) });
      }
    }
    // Seleccionar nodos existentes.
    for (const code of Object.keys(store.project.states)) {
      const kind = store.project.states[code].modifierId === 'image' ? 'image' : 'modifier';
      cmds.push({
        id: `s:${code}`,
        label: `Go to ${store.displayName(code)}`,
        hint: 'select',
        run: () => (kind === 'image' ? store.selectImage(code) : store.selectModifier(code)),
      });
    }
    return cmds;
  }

  const all = buildCommands();
  let query = $state('');
  let active = $state(0);

  const results = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const list = q ? all.filter((c) => c.label.toLowerCase().includes(q)) : all;
    return list.slice(0, 40);
  });

  $effect(() => {
    void results;
    active = 0;
  });

  function run(c: Cmd) {
    onClose();
    c.run();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = Math.min(active + 1, results.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(active - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = results[active];
      if (c) run(c);
    }
  }
  function focusOnMount(el: HTMLInputElement) {
    el.focus();
  }
</script>

<div
  class="overlay"
  role="dialog"
  tabindex="-1"
  onmousedown={(e) => {
    if (e.target === e.currentTarget) onClose();
  }}
>
  <div class="palette">
    <input
      class="search"
      placeholder="Type a command, modifier or node…"
      bind:value={query}
      onkeydown={onKey}
      use:focusOnMount
    />
    <div class="results">
      {#each results as c, i (c.id)}
        <button class="cmd" class:active={i === active} onclick={() => run(c)} onmousemove={() => (active = i)}>
          <span class="cmd-label">{c.label}</span>
          <span class="cmd-hint">{c.hint}</span>
        </button>
      {/each}
      {#if results.length === 0}
        <p class="empty">No matches.</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    place-items: start center;
    padding-top: 12vh;
    z-index: 150;
  }
  .palette {
    width: min(560px, 92vw);
    max-height: 64vh;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .search {
    border: none;
    border-bottom: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--text);
    font-size: 14px;
    padding: 11px 14px;
    width: 100%;
  }
  .results {
    overflow-y: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .cmd {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    text-align: left;
    background: none;
    border: none;
    border-radius: 6px;
    padding: 7px 10px;
    color: var(--text);
    font-size: 13px;
    cursor: pointer;
  }
  .cmd.active {
    background: var(--accent);
    color: var(--on-accent);
  }
  .cmd-hint {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--muted);
    flex-shrink: 0;
  }
  .cmd.active .cmd-hint {
    color: var(--on-accent);
    opacity: 0.8;
  }
  .empty {
    color: var(--muted);
    font-style: italic;
    padding: 10px 12px;
    margin: 0;
  }
</style>
