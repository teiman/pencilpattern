<script lang="ts">
  import { store } from '../state/projectStore.svelte';
  import { getModifier, hasModifier } from '../engine/modifiers/registry';

  // Chip de MODIFICADOR entre cajas. El estado `toCode` es producido por este
  // modificador; su caja (Cell) muestra el resultado. Chip y caja son SEPARADOS.
  let { toCode }: { toCode: string } = $props();
  const node = $derived(store.project.states[toCode]);
  const modId = $derived(node?.modifierId);
  // Lee el nombre directamente del id (reactivo) y, si no se reconoce, muestra el
  // propio id en vez de un "?" mudo.
  const label = $derived(modId ? (hasModifier(modId) ? getModifier(modId).name : modId) : '—');
  const sel = $derived(store.selected?.code === toCode && store.selected?.kind === 'modifier');
  // El primer nodo de la banda no tiene nada a su izquierda: sin "bracito".
  const isFirst = $derived(store.isFirst(toCode));
  const extra = $derived((node?.inputs.slice(1) ?? []).filter(Boolean));
  // Nombres legibles de las entradas extra (cross-lane) en vez de códigos crudos.
  const extraNames = $derived(extra.map((c) => store.displayName(c)));
  const tip = $derived(
    extra.length ? `Inputs: ${extraNames.join(', ')}` : 'Edit this modifier',
  );
</script>

<button
  class="edge"
  class:sel
  onclick={() => store.selectModifier(toCode)}
  oncontextmenu={(e) => {
    e.preventDefault();
    store.selectModifier(toCode);
    store.openContextMenu(e.clientX, e.clientY, store.chipMenu(toCode));
  }}
  title={tip}
>
  {#if !isFirst}<span class="line"></span>{/if}
  <span class="chip">{label}{#if extra.length}<small> +{extraNames.join(', ')}</small>{/if}</span>
  <span class="arrow">▶</span>
</button>

<style>
  .edge {
    align-self: center;
    background: none;
    border: none;
    padding: 0;
    display: flex;
    align-items: center;
    cursor: pointer;
    flex: 0 0 auto;
  }
  .line {
    width: 8px;
    height: 2px;
    background: var(--line);
  }
  .chip {
    border: 1px solid var(--line);
    background: var(--panel-2);
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 11px;
    white-space: nowrap;
    color: var(--text);
  }
  .edge:hover .chip {
    border-color: var(--accent-2);
  }
  .edge.sel .chip {
    border-color: var(--accent);
    color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .arrow {
    font-size: 9px;
    color: var(--line);
    margin-left: 2px;
  }
  small {
    color: var(--muted);
  }
</style>
