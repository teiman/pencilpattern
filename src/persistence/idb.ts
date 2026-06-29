// Persistencia de proyectos en IndexedDB. Cada entrada es un "sobre" con el
// proyecto (DAG + parámetros; las imágenes subidas viajan embebidas como dataURL
// en params.src) y metadatos (fecha de guardado).
import { openDB, type IDBPDatabase } from 'idb';
import type { Project } from '../engine/graph/types';

const DB_NAME = 'pencilpattern';
const STORE = 'projects';
let dbp: Promise<IDBPDatabase> | null = null;

interface Envelope {
  project: Project;
  savedAt: number;
}

export interface SavedMeta {
  name: string;
  savedAt: number;
}

function db(): Promise<IDBPDatabase> {
  if (!dbp) {
    dbp = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      },
    });
  }
  return dbp;
}

export async function saveProject(name: string, p: Project): Promise<void> {
  const env: Envelope = { project: p, savedAt: Date.now() };
  await (await db()).put(STORE, env, name);
}

export async function loadProjectByName(name: string): Promise<Project | undefined> {
  const v = (await (await db()).get(STORE, name)) as Envelope | Project | undefined;
  if (!v) return undefined;
  // Acepta sobres nuevos y proyectos crudos (datos antiguos).
  const env = v as Envelope;
  if (env.project && env.project.states) return env.project;
  const raw = v as Project;
  return raw.states ? raw : undefined;
}

export async function listProjects(exclude: string[] = []): Promise<SavedMeta[]> {
  const d = await db();
  const keys = (await d.getAllKeys(STORE)) as string[];
  const out: SavedMeta[] = [];
  for (const name of keys) {
    if (exclude.includes(name)) continue;
    const v = (await d.get(STORE, name)) as Envelope | undefined;
    out.push({ name, savedAt: v?.savedAt ?? 0 });
  }
  out.sort((a, b) => b.savedAt - a.savedAt);
  return out;
}

export async function deleteProject(name: string): Promise<void> {
  await (await db()).delete(STORE, name);
}

export async function clearProjects(): Promise<void> {
  await (await db()).clear(STORE);
}

export async function persistStorage(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
    try {
      await navigator.storage.persist();
    } catch {
      /* sin permiso de persistencia */
    }
  }
}
