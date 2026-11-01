/**
 * In-Memory IndexedDB Mock for Unit Testing
 */

class MockCursor {
  constructor(records, onRequest) {
    this.records = [...records];
    this.index = 0;
    this.onRequest = onRequest;
  }

  get value() {
    return this.records[this.index];
  }

  continue() {
    this.index++;
    this.advance();
  }

  advance() {
    if (this.index < this.records.length) {
      this.onRequest.result = this;
      if (this.onRequest.onsuccess) {
        this.onRequest.onsuccess({ target: this.onRequest });
      }
    } else {
      this.onRequest.result = null;
      if (this.onRequest.onsuccess) {
        this.onRequest.onsuccess({ target: this.onRequest });
      }
    }
  }

  delete() {
    const item = this.records[this.index];
    if (item && item.id) {
      this.onRequest.store._data.delete(item.id);
    }
  }
}

class MockObjectStore {
  constructor(name, dataMap) {
    this.name = name;
    this._data = dataMap;
    this.indices = new Map();
  }

  createIndex(name, keyPath, options) {
    this.indices.set(name, { keyPath, options });
  }

  put(record) {
    const req = { onsuccess: null, onerror: null, result: record.id };
    this._data.set(record.id, JSON.parse(JSON.stringify(record)));
    queueMicrotask(() => {
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  get(id) {
    const req = { onsuccess: null, onerror: null, result: null };
    const val = this._data.get(id);
    req.result = val ? JSON.parse(JSON.stringify(val)) : null;
    queueMicrotask(() => {
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  delete(id) {
    const req = { onsuccess: null, onerror: null, result: undefined };
    this._data.delete(id);
    queueMicrotask(() => {
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  clear() {
    const req = { onsuccess: null, onerror: null };
    this._data.clear();
    queueMicrotask(() => {
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  openCursor() {
    const req = { onsuccess: null, onerror: null, result: null, store: this };
    const records = Array.from(this._data.values());
    const cursor = new MockCursor(records, req);
    queueMicrotask(() => {
      cursor.advance();
    });
    return req;
  }
}

class MockTransaction {
  constructor(stores, mode, db) {
    this.stores = stores;
    this.mode = mode;
    this.db = db;
    this.oncomplete = null;
    this.onerror = null;

    queueMicrotask(() => {
      if (this.oncomplete) this.oncomplete({ target: this });
    });
  }

  objectStore(name) {
    return this.db._stores.get(name);
  }
}

class MockDatabase {
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this._stores = new Map();
    this.objectStoreNames = {
      contains: (n) => this._stores.has(n)
    };
  }

  createObjectStore(name, options) {
    const store = new MockObjectStore(name, new Map());
    this._stores.set(name, store);
    return store;
  }

  transaction(storeNames, mode) {
    return new MockTransaction(storeNames, mode, this);
  }

  close() {}
}

export function setupMockIndexedDB() {
  const dbs = new Map();

  globalThis.indexedDB = {
    open(name, version = 1) {
      const req = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: null
      };

      queueMicrotask(() => {
        let db = dbs.get(name);
        const isNew = !db;
        if (isNew) {
          db = new MockDatabase(name, version);
          dbs.set(name, db);
        }

        req.result = db;

        if (isNew && req.onupgradeneeded) {
          req.onupgradeneeded({ target: req });
        }

        if (req.onsuccess) {
          req.onsuccess({ target: req });
        }
      });

      return req;
    }
  };
}
