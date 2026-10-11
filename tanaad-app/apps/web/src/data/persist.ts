import Dexie, { type Table } from 'dexie';
import type { StateStorage } from 'zustand/middleware';

/** IndexedDB-backed storage for the demo store (same place the real outbox will live). */
class TanaadDb extends Dexie {
  kv!: Table<{ key: string; value: string }, string>;
  constructor() { super('tanaad-demo'); this.version(1).stores({ kv: 'key' }); }
}
const db = new TanaadDb();

export const dexieStorage: StateStorage = {
  getItem: async (key) => (await db.kv.get(key))?.value ?? null,
  setItem: async (key, value) => { await db.kv.put({ key, value }); },
  removeItem: async (key) => { await db.kv.delete(key); },
};

export async function wipeStorage() { await db.delete(); }
