/**
 * SnapKeep Storage Service
 * Manages user preferences, configuration defaults, and cleanup history using chrome.storage.local.
 */

import { DEFAULT_SETTINGS } from '../utils/constants.js';

const SETTINGS_KEY = 'snapkeep_settings';
const CLEANUP_HISTORY_KEY = 'snapkeep_cleanup_history';

/**
 * Retrieve user settings with default fallbacks
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
export async function getSettings() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    return { ...DEFAULT_SETTINGS };
  }

  return new Promise((resolve) => {
    chrome.storage.local.get([SETTINGS_KEY], (result) => {
      if (chrome.runtime.lastError) {
        console.error('Error fetching settings:', chrome.runtime.lastError);
        return resolve({ ...DEFAULT_SETTINGS });
      }
      resolve({ ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] || {}) });
    });
  });
}

/**
 * Update user settings
 * @param {Partial<typeof DEFAULT_SETTINGS>} updates 
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
export async function updateSettings(updates) {
  const current = await getSettings();
  const updated = { ...current, ...updates };

  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    return updated;
  }

  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [SETTINGS_KEY]: updated }, () => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      resolve(updated);
    });
  });
}

/**
 * Record a cleanup run event
 * @param {Object} event - { count, bytesFreed, timestamp }
 */
export async function recordCleanupEvent({ count = 0, bytesFreed = 0, timestamp = Date.now() }) {
  await updateSettings({
    lastCleanupTimestamp: timestamp,
    lastCleanupCount: count,
    lastCleanupBytesFreed: bytesFreed
  });

  // Also append to rolling cleanup history (up to last 20 events)
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get([CLEANUP_HISTORY_KEY], (res) => {
      const history = res[CLEANUP_HISTORY_KEY] || [];
      history.unshift({ timestamp, count, bytesFreed });
      if (history.length > 20) history.pop();
      chrome.storage.local.set({ [CLEANUP_HISTORY_KEY]: history });
    });
  }
}

/**
 * Get recent cleanup history
 * @returns {Promise<Array<{ timestamp: number, count: number, bytesFreed: number }>>}
 */
export async function getCleanupHistory() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    return [];
  }
  return new Promise((resolve) => {
    chrome.storage.local.get([CLEANUP_HISTORY_KEY], (res) => {
      resolve(res[CLEANUP_HISTORY_KEY] || []);
    });
  });
}
