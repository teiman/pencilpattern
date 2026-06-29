// Constructor de ZIP en cliente, modo STORE (sin compresión). Suficiente para
// empaquetar PNGs (ya comprimidos) — p.ej. un set PBR o un export batch — sin
// añadir dependencias. Genera un Blob 'application/zip' válido.
//
// Uso:
//   const zip = new ZipBuilder();
//   zip.add('wood_BaseColor.png', pngBytes);
//   const blob = zip.blob();          // descargar / guardar

// ---- CRC-32 (tabla precalculada perezosamente) ----
let CRC_TABLE: Uint32Array | null = null;
function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  CRC_TABLE = t;
  return t;
}
function crc32(bytes: Uint8Array): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface Entry {
  nameBytes: Uint8Array;
  data: Uint8Array;
  crc: number;
  offset: number;
}

// Fecha/hora DOS fija (no usamos new Date() para mantener el build reproducible).
const DOS_TIME = 0;
const DOS_DATE = 0x21; // 1980-01-01

export class ZipBuilder {
  private entries: Entry[] = [];
  private parts: Uint8Array[] = [];
  private offset = 0;

  private push(b: Uint8Array): void {
    this.parts.push(b);
    this.offset += b.length;
  }

  /** Añade un fichero. `data` puede ser Uint8Array o ArrayBuffer. */
  add(name: string, data: Uint8Array | ArrayBuffer): this {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(bytes);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // local file header signature
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // flags: UTF-8 names
    local.setUint16(8, 0, true); // method: STORE
    local.setUint16(10, DOS_TIME, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, bytes.length, true); // compressed size
    local.setUint32(22, bytes.length, true); // uncompressed size
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true); // extra field length

    const entry: Entry = { nameBytes, data: bytes, crc, offset: this.offset };
    this.entries.push(entry);
    this.push(new Uint8Array(local.buffer));
    this.push(nameBytes);
    this.push(bytes);
    return this;
  }

  /** Cierra el archivo (central directory + EOCD) y devuelve el Blob. */
  blob(): Blob {
    const cdStart = this.offset;
    for (const e of this.entries) {
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); // central dir header signature
      cd.setUint16(4, 20, true); // version made by
      cd.setUint16(6, 20, true); // version needed
      cd.setUint16(8, 0x0800, true); // flags: UTF-8
      cd.setUint16(10, 0, true); // method: STORE
      cd.setUint16(12, DOS_TIME, true);
      cd.setUint16(14, DOS_DATE, true);
      cd.setUint32(16, e.crc, true);
      cd.setUint32(20, e.data.length, true); // compressed size
      cd.setUint32(24, e.data.length, true); // uncompressed size
      cd.setUint16(28, e.nameBytes.length, true);
      cd.setUint16(30, 0, true); // extra len
      cd.setUint16(32, 0, true); // comment len
      cd.setUint16(34, 0, true); // disk number start
      cd.setUint16(36, 0, true); // internal attrs
      cd.setUint32(38, 0, true); // external attrs
      cd.setUint32(42, e.offset, true); // offset of local header
      this.push(new Uint8Array(cd.buffer));
      this.push(e.nameBytes);
    }
    const cdSize = this.offset - cdStart;

    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true); // EOCD signature
    eocd.setUint16(4, 0, true); // disk number
    eocd.setUint16(6, 0, true); // cd start disk
    eocd.setUint16(8, this.entries.length, true); // entries on this disk
    eocd.setUint16(10, this.entries.length, true); // total entries
    eocd.setUint32(12, cdSize, true);
    eocd.setUint32(16, cdStart, true);
    eocd.setUint16(20, 0, true); // comment len
    this.push(new Uint8Array(eocd.buffer));

    return new Blob(this.parts as BlobPart[], { type: 'application/zip' });
  }
}

/** Crea un zip a partir de un mapa nombre→bytes y devuelve el Blob. */
export function zipFiles(files: Record<string, Uint8Array | ArrayBuffer>): Blob {
  const z = new ZipBuilder();
  for (const [name, data] of Object.entries(files)) z.add(name, data);
  return z.blob();
}
