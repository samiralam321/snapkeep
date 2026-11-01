/**
 * SnapKeep Automatic Cleanup Engine
 * Safely inspects, expires, and prunes temporary & one-time screenshots past their expiration timestamps.
 * Strictly guarantees that permanent screenshots are NEVER deleted automatically.
 */

import { deleteExpiredScreenshots, getStorageStats } from './database.js';
import { recordCleanupEvent, getSettings } from './storage-service.js';
import { sendCleanupDesktopNotification } from './notification-service.js';

let isCleanupRunning = false;

/**
 * Execute a cleanup cycle
 * @param {Object} options
 * @param {boolean} [options.isManual] - Whether triggered manually by the user
 * @param {number} [options.currentTime] - Specific reference timestamp (defaults to Date.now())
 * @returns {Promise<{ deletedCount: number, bytesFreed: number, deletedIds: Array<string> }>}
 */
export async function runCleanup({ isManual = false, currentTime = Date.now() } = {}) {
  // Prevent concurrent cleanup runs
  if (isCleanupRunning) {
    return { deletedCount: 0, bytesFreed: 0, deletedIds: [] };
  }

  isCleanupRunning = true;

  try {
    const settings = await getSettings();

    // If auto-cleanup is disabled and this was not a manual trigger, exit
    if (!settings.autoCleanupEnabled && !isManual) {
      return { deletedCount: 0, bytesFreed: 0, deletedIds: [] };
    }

    const result = await deleteExpiredScreenshots(currentTime);

    if (result.deletedCount > 0) {
      console.log(`[SnapKeep Cleanup] Cleaned ${result.deletedCount} expired screenshots (${result.bytesFreed} bytes freed).`);

      // Record event in storage & rolling history
      await recordCleanupEvent({
        count: result.deletedCount,
        bytesFreed: result.bytesFreed,
        timestamp: currentTime
      });

      // Send desktop notification if enabled
      await sendCleanupDesktopNotification(result.deletedCount, result.bytesFreed);

      // Update badge
      await updateExtensionBadge();
    } else {
      // Even if 0 deleted, record that cleanup check ran if manual
      if (isManual) {
        await recordCleanupEvent({
          count: 0,
          bytesFreed: 0,
          timestamp: currentTime
        });
      }
    }

    return result;
  } catch (error) {
    console.error('[SnapKeep Cleanup] Cleanup operation encountered an error:', error);
    throw error;
  } finally {
    isCleanupRunning = false;
  }
}

/**
 * Update the extension icon badge with the number of active temporary/one-time items
 */
export async function updateExtensionBadge() {
  if (typeof chrome === 'undefined' || !chrome.action) return;

  try {
    const stats = await getStorageStats();
    const activeExpiringCount = stats.scheduledForDeletionCount;

    if (activeExpiringCount > 0) {
      chrome.action.setBadgeText({ text: String(activeExpiringCount) });
      chrome.action.setBadgeBackgroundColor({ color: '#6366F1' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (err) {
    // Non-fatal if badge update fails
    console.warn('Could not update action badge:', err);
  }
}
