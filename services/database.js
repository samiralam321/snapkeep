/**
 * SnapKeep IndexedDB Database Service
 * Provides robust CRUD operations, index queries, and transactional cleanup for screenshots.
 */

import { DB_CONFIG, STORAGE_TYPES } from '../utils/constants.js';

let dbInstance = null;

/**
 * Open (or create) the SnapKeep IndexedDB
 * @returns {Promise<IDBDatabase>}
 */
export function openDatabase() {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_CONFIG.NAME, DB_CONFIG.VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(DB_CONFIG.STORE_SCREENSHOTS)) {
        const store = db.createObjectStore(DB_CONFIG.STORE_SCREENSHOTS, { keyPath: 'id' });
        store.createIndex('by_storageType', 'storageType', { unique: false });
        store.createIndex('by_expiresAt', 'expiresAt', { unique: false });
        store.createIndex('by_capturedAt', 'capturedAt', { unique: false });
        store.createIndex('by_status', 'status', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      dbInstance.onversionchange = () => {
        dbInstance.close();
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(new Error(`Failed to open IndexedDB: ${event.target.error?.message || 'Unknown error'}`));
    };
  });
}

/**
 * Save a new screenshot record
 * @param {Object} screenshot 
 * @returns {Promise<Object>}
 */
export async function saveScreenshot(screenshot) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_CONFIG.STORE_SCREENSHOTS, 'readwrite');
    const store = tx.objectStore(DB_CONFIG.STORE_SCREENSHOTS);

    const record = {
      id: screenshot.id,
      name: screenshot.name,
      blob: screenshot.blob,
      thumbnailDataUrl: screenshot.thumbnailDataUrl || null,
      capturedAt: screenshot.capturedAt || Date.now(),
      expiresAt: screenshot.expiresAt !== undefined ? screenshot.expiresAt : null,
      storageType: screenshot.storageType || STORAGE_TYPES.TEMPORARY,
      sourceUrl: screenshot.sourceUrl || '',
      sourceTitle: screenshot.sourceTitle || '',
      fileSize: screenshot.fileSize || (screenshot.blob ? screenshot.blob.size : 0),
      width: screenshot.width || 0,
      height: screenshot.height || 0,
      format: screenshot.format || 'png',
      status: screenshot.status || 'active'
    };

    const req = store.put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = (e) => reject(new Error(`Failed to save screenshot: ${e.target.error?.message}`));
  });
}

/**
 * Get a single screenshot by ID
 * @param {string} id 
 * @returns {Promise<Object|null>}
 */
export async function getScreenshot(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_CONFIG.STORE_SCREENSHOTS, 'readonly');
    const store = tx.objectStore(DB_CONFIG.STORE_SCREENSHOTS);
    const req = store.get(id);

    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(new Error(`Failed to get screenshot: ${e.target.error?.message}`));
  });
}

/**
 * Get all screenshots with optional filtering, searching, and sorting
 * @param {Object} options
 * @param {string} [options.storageType] - Filter by storageType ('all' | 'temporary' | 'one-time' | 'permanent')
 * @param {string} [options.searchQuery] - Search text matching name, title, or url
 * @param {string} [options.sortBy] - 'newest' | 'oldest' | 'size_desc' | 'size_asc' | 'name'
 * @param {boolean} [options.includeBlobs] - If false, omits heavy blobs to speed up UI lists
 * @returns {Promise<Array<Object>>}
 */
export async function getAllScreenshots({
  storageType = 'all',
  searchQuery = '',
  sortBy = 'newest',
  includeBlobs = true
} = {}) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_CONFIG.STORE_SCREENSHOTS, 'readonly');
    const store = tx.objectStore(DB_CONFIG.STORE_SCREENSHOTS);
    const results = [];

    const request = store.openCursor();

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const item = cursor.value;

        // Filter by storageType
        const matchesType = !storageType || storageType === 'all' || item.storageType === storageType;

        // Filter by searchQuery
        let matchesSearch = true;
        if (searchQuery && searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const nameMatch = (item.name || '').toLowerCase().includes(q);
          const titleMatch = (item.sourceTitle || '').toLowerCase().includes(q);
          const urlMatch = (item.sourceUrl || '').toLowerCase().includes(q);
          matchesSearch = nameMatch || titleMatch || urlMatch;
        }

        if (matchesType && matchesSearch) {
          if (!includeBlobs) {
            const { blob, ...shallowItem } = item;
            results.push(shallowItem);
          } else {
            results.push(item);
          }
        }
        cursor.continue();
      } else {
        // Apply sorting
        results.sort((a, b) => {
          if (sortBy === 'oldest') {
            return a.capturedAt - b.capturedAt;
          } else if (sortBy === 'size_desc') {
            return b.fileSize - a.fileSize;
          } else if (sortBy === 'size_asc') {
            return a.fileSize - b.fileSize;
          } else if (sortBy === 'name') {
            return (a.name || '').localeCompare(b.name || '');
          }
          // Default: newest first
          return b.capturedAt - a.capturedAt;
        });

        resolve(results);
      }
    };

    request.onerror = (e) => reject(new Error(`Failed to list screenshots: ${e.target.error?.message}`));
  });
}

/**
 * Update an existing screenshot metadata (e.g. rename, change storage type, move to permanent)
 * @param {string} id 
 * @param {Object} updates 
 * @returns {Promise<Object>}
 */
export async function updateScreenshot(id, updates) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_CONFIG.STORE_SCREENSHOTS, 'readwrite');
    const store = tx.objectStore(DB_CONFIG.STORE_SCREENSHOTS);

    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const current = getReq.result;
      if (!current) {
        return reject(new Error(`Screenshot with ID ${id} not found.`));
      }

      const updated = { ...current, ...updates };
      // Prevent tampering with id
      updated.id = id;

      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve(updated);
      putReq.onerror = (e) => reject(new Error(`Failed to update screenshot: ${e.target.error?.message}`));
    };
    getReq.onerror = (e) => reject(new Error(`Failed to find screenshot for update: ${e.target.error?.message}`));
  });
}

/**
 * Delete a single screenshot by ID
 * @param {string} id 
 * @returns {Promise<boolean>}
 */
export async function deleteScreenshot(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_CONFIG.STORE_SCREENSHOTS, 'readwrite');
    const store = tx.objectStore(DB_CONFIG.STORE_SCREENSHOTS);

    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = (e) => reject(new Error(`Failed to delete screenshot: ${e.target.error?.message}`));
  });
}

/**
 * Delete multiple screenshots by ID list
 * @param {Array<string>} ids 
 * @returns {Promise<number>} Number of successfully deleted items
 */
export async function deleteScreenshots(ids) {
  if (!ids || ids.length === 0) return 0;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_CONFIG.STORE_SCREENSHOTS, 'readwrite');
    const store = tx.objectStore(DB_CONFIG.STORE_SCREENSHOTS);
    let deletedCount = 0;

    tx.oncomplete = () => resolve(deletedCount);
    tx.onerror = (e) => reject(new Error(`Transaction failed deleting screenshots: ${e.target.error?.message}`));

    for (const id of ids) {
      const req = store.delete(id);
      req.onsuccess = () => { deletedCount++; };
    }
  });
}

/**
 * Find all expired screenshots (expiresAt !== null and <= now)
 * @param {number} [currentTime] 
 * @returns {Promise<Array<Object>>}
 */
export async function getExpiredScreenshots(currentTime = Date.now()) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_CONFIG.STORE_SCREENSHOTS, 'readonly');
    const store = tx.objectStore(DB_CONFIG.STORE_SCREENSHOTS);
    const expired = [];

    const request = store.openCursor();
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const item = cursor.value;
        // Strict safety rule: NEVER expire permanent screenshots
        if (item.storageType !== STORAGE_TYPES.PERMANENT && item.expiresAt && item.expiresAt <= currentTime) {
          expired.push(item);
        }
        cursor.continue();
      } else {
        resolve(expired);
      }
    };
    request.onerror = (e) => reject(new Error(`Failed to query expired screenshots: ${e.target.error?.message}`));
  });
}

/**
 * Delete all expired screenshots in a single atomic transaction
 * @param {number} [currentTime]
 * @returns {Promise<{ deletedCount: number, bytesFreed: number, deletedIds: Array<string> }>}
 */
export async function deleteExpiredScreenshots(currentTime = Date.now()) {
  const expired = await getExpiredScreenshots(currentTime);
  if (expired.length === 0) {
    return { deletedCount: 0, bytesFreed: 0, deletedIds: [] };
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_CONFIG.STORE_SCREENSHOTS, 'readwrite');
    const store = tx.objectStore(DB_CONFIG.STORE_SCREENSHOTS);
    const deletedIds = [];
    let bytesFreed = 0;

    tx.oncomplete = () => {
      resolve({
        deletedCount: deletedIds.length,
        bytesFreed,
        deletedIds
      });
    };

    tx.onerror = (e) => reject(new Error(`Failed to delete expired screenshots: ${e.target.error?.message}`));

    for (const item of expired) {
      // Double check permanent safety lock
      if (item.storageType === STORAGE_TYPES.PERMANENT) continue;

      bytesFreed += item.fileSize || 0;
      deletedIds.push(item.id);
      store.delete(item.id);
    }
  });
}

/**
 * Calculate detailed, accurate storage statistics directly from IndexedDB
 * @returns {Promise<{
 *   totalCount: number,
 *   totalBytes: number,
 *   temporaryCount: number,
 *   temporaryBytes: number,
 *   oneTimeCount: number,
 *   oneTimeBytes: number,
 *   permanentCount: number,
 *   permanentBytes: number,
 *   scheduledForDeletionCount: number,
 *   expiredCount: number
 * }>}
 */
export async function getStorageStats() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_CONFIG.STORE_SCREENSHOTS, 'readonly');
    const store = tx.objectStore(DB_CONFIG.STORE_SCREENSHOTS);

    const stats = {
      totalCount: 0,
      totalBytes: 0,
      temporaryCount: 0,
      temporaryBytes: 0,
      oneTimeCount: 0,
      oneTimeBytes: 0,
      permanentCount: 0,
      permanentBytes: 0,
      scheduledForDeletionCount: 0,
      expiredCount: 0
    };

    const now = Date.now();
    const req = store.openCursor();

    req.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const item = cursor.value;
        const size = item.fileSize || (item.blob ? item.blob.size : 0);

        stats.totalCount++;
        stats.totalBytes += size;

        if (item.storageType === STORAGE_TYPES.TEMPORARY) {
          stats.temporaryCount++;
          stats.temporaryBytes += size;
          stats.scheduledForDeletionCount++;
        } else if (item.storageType === STORAGE_TYPES.ONE_TIME) {
          stats.oneTimeCount++;
          stats.oneTimeBytes += size;
          stats.scheduledForDeletionCount++;
        } else if (item.storageType === STORAGE_TYPES.PERMANENT) {
          stats.permanentCount++;
          stats.permanentBytes += size;
        }

        if (item.expiresAt && item.expiresAt <= now && item.storageType !== STORAGE_TYPES.PERMANENT) {
          stats.expiredCount++;
        }

        cursor.continue();
      } else {
        resolve(stats);
      }
    };

    req.onerror = (e) => reject(new Error(`Failed to calculate storage stats: ${e.target.error?.message}`));
  });
}

/**
 * Clear all screenshots belonging to a specific storage type
 * @param {string} storageType 
 * @returns {Promise<number>}
 */
export async function clearScreenshotsByType(storageType) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_CONFIG.STORE_SCREENSHOTS, 'readwrite');
    const store = tx.objectStore(DB_CONFIG.STORE_SCREENSHOTS);
    let count = 0;

    const req = store.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        if (cursor.value.storageType === storageType) {
          cursor.delete();
          count++;
        }
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve(count);
    tx.onerror = (err) => reject(new Error(`Failed to clear screenshots by type: ${err.target.error?.message}`));
  });
}

/**
 * Clear all screenshots from IndexedDB
 * @returns {Promise<void>}
 */
export async function clearAllScreenshots() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_CONFIG.STORE_SCREENSHOTS, 'readwrite');
    const store = tx.objectStore(DB_CONFIG.STORE_SCREENSHOTS);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(new Error(`Failed to clear database: ${e.target.error?.message}`));
  });
}
