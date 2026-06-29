// Caché de texturas por clave de contenido, con desalojo LRU bajo presupuesto de
// memoria (VRAM). El desalojo se hace al final de cada pasada (`trim`), nunca
// durante el cálculo, para no destruir texturas en uso.
import type { GpuTexture } from '../gpu/types';

interface Entry {
  tex: GpuTexture;
  used: number; // contador monótono (LRU)
}

export interface CacheStats {
  entries: number;
  bytes: number;
  budget: number;
  hits: number;
  misses: number;
}

export class TextureCache {
  private map = new Map<string, Entry>();
  private clock = 0;
  private bytes = 0;
  private hits = 0;
  private misses = 0;

  constructor(private budgetBytes: number) {}

  has(key: string): boolean {
    return this.map.has(key);
  }

  /** Devuelve la textura y la marca como usada (LRU). */
  get(key: string): GpuTexture | undefined {
    const e = this.map.get(key);
    if (!e) {
      this.misses++;
      return undefined;
    }
    e.used = ++this.clock;
    this.hits++;
    return e.tex;
  }

  set(key: string, tex: GpuTexture): void {
    const prev = this.map.get(key);
    if (prev) {
      this.bytes -= prev.tex.bytes;
      if (prev.tex !== tex) prev.tex.destroy();
    }
    this.map.set(key, { tex, used: ++this.clock });
    this.bytes += tex.bytes;
  }

  /** Desaloja las entradas más frías hasta quedar bajo presupuesto. `keep` no se desaloja. */
  trim(keep?: ReadonlySet<string>): void {
    if (this.bytes <= this.budgetBytes) return;
    const entries = [...this.map.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [key, e] of entries) {
      if (this.bytes <= this.budgetBytes) break;
      if (keep?.has(key)) continue;
      this.map.delete(key);
      this.bytes -= e.tex.bytes;
      e.tex.destroy();
    }
  }

  clear(): void {
    for (const e of this.map.values()) e.tex.destroy();
    this.map.clear();
    this.bytes = 0;
  }

  setBudget(bytes: number): void {
    this.budgetBytes = bytes;
  }

  stats(): CacheStats {
    return {
      entries: this.map.size,
      bytes: this.bytes,
      budget: this.budgetBytes,
      hits: this.hits,
      misses: this.misses,
    };
  }
}
