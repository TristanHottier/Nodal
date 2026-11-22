// Minimal promise wrapper over IndexedDB: one object store of string keys to JSON values.

export interface KvStore {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
}

const fail = (r: { error: DOMException | null }) =>
  new Error(r.error?.message ?? "IndexedDB error");

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(fail(req));
    };
  });
}

/** Open (and create on first use) a version 1 database holding one object store. */
export function openStore(dbName = "nodal", storeName = "projects"): Promise<KvStore> {
  return new Promise<KvStore>((resolve, reject) => {
    let open: IDBOpenDBRequest;
    try {
      open = indexedDB.open(dbName, 1);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    open.onupgradeneeded = () => {
      open.result.createObjectStore(storeName);
    };
    open.onerror = () => {
      reject(fail(open));
    };
    open.onsuccess = () => {
      const db = open.result;
      resolve({
        get: (key) =>
          request(db.transaction(storeName, "readonly").objectStore(storeName).get(key)),
        put: async (key, value) => {
          await request(
            db.transaction(storeName, "readwrite").objectStore(storeName).put(value, key),
          );
        },
      });
    };
  });
}
