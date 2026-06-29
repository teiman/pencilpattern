import type { ModifierDef } from '../graph/types';
import { hashString } from '../graph/hash';

// Fuente "imagen subida": no es un shader. El estado guarda en params.src un
// dataURL; el backend lo sube como textura (ver GpuBackend.imageToTexture).
// La clave de caché depende del contenido de la imagen (hash del src).
export const imageSource: ModifierDef = {
  id: 'image',
  name: 'Uploaded image',
  category: 'material',
  inputArity: 0,
  shaderVersion: 1,
  imageSource: true,
  params: [],
  pack: (p) => [hashString(String(p['src'] ?? ''))],
  wgsl: '', // nunca se compila (se sube como textura)
};
