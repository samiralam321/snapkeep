/**
 * SnapKeep Settings Page Controller
 */

import { initTheme, applyTheme } from '../utils/theme.js';
import { STORAGE_TYPES } from '../utils/constants.js';
import { getSettings, updateSettings } from '../services/storage-service.js';
import { runCleanup } from '../services/cleanup-service.js';
import { clearScreenshotsByType, clearAllScreenshots } from '../services/database.js';
import { formatRelativeTime, formatDate, formatBytes } from '../utils/formatters.js';
import { showToast } from '../services/notification-service.js';

// DOM Elements
const selectDefaultTier = document.getElementById('select-default-tier');
const selectTempDuration = document.getElementById('select-temp-duration');
const selectOneTimeDuration = document.getElementById('select-onetime-duration');
const selectImageFormat = document.getElementById('select-image-format');
const inputNamingPattern = document.getElementById('input-naming-pattern');

const toggleAutoCleanup = document.getElementById('toggle-auto-cleanup');
const toggleNotifications = document.getElementById('toggle-notifications');
const lblLastCleanup = document.getElementById('lbl-last-cleanup');
const btnCleanNow = document.getElementById('btn-clean-now-settings');

const themeOptions = document.querySelectorAll('.theme-option');
const btnConfigureShortcuts = document.getElementById('btn-configure-shortcuts');

const btnPurgeTemp = document.getElementById('btn-purge-temporary');
const btnEraseAll = document.getElementById('btn-erase-all');
const btnSaveSettings = document.getElementById('btn-save-settings');

const btnNavLibrary = document.getElementById('btn-nav-library');
const btnNavDashboard = document.getElementById('btn-nav-dashboard');

// Confirmation Modal Elements
const confirmModal = document.getElementById('confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
const btnConfirmProceed = document.getElementById('btn-confirm-proceed');
let pendingConfirmAction = null;

document.addEventListener('DOMContentLoaded', async () => {
  await initTheme();
  setupEventListeners();
  await loadCurrentSettings();
});

function setupEventListeners() {
  btnNavLibrary.addEventListener('click', () => {
    window.location.href = '../library/library.html';
  });

  btnNavDashboard.addEventListener('click', () => {
    window.location.href = '../dashboard/dashboard.html';
  });

  // Theme selection
  themeOptions.forEach((opt) => {
    opt.addEventListener('click', () => {
      themeOptions.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      const radio = opt.querySelector('input[type="radio"]');
      radio.checked = true;
      applyTheme(radio.value);
    });
  });

  // Shortcut configuration
  btnConfigureShortcuts.addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  // Manual cleanup button
  btnCleanNow.addEventListener('click', async () => {
    try {
      btnCleanNow.disabled = true;
      const res = await runCleanup({ isManual: true });
      if (res.deletedCount > 0) {
        showToast(`Cleaned up ${res.deletedCount} expired screenshot${res.deletedCount > 1 ? 's' : ''} (${formatBytes(res.bytesFreed)} freed).`, 'success');
      } else {
        showToast('No expired screenshots found.', 'info');
      }
      lblLastCleanup.textContent = 'Just now';
    } catch (err) {
      showToast('Cleanup failed: ' + err.message, 'error');
    } finally {
      btnCleanNow.disabled = false;
    }
  });

  // Save Settings
  btnSaveSettings.addEventListener('click', async () => {
    try {
      btnSaveSettings.disabled = true;
      btnSaveSettings.textContent = 'Saving...';

      const selectedThemeRadio = document.querySelector('input[name="theme-pref"]:checked');
      const theme = selectedThemeRadio ? selectedThemeRadio.value : 'system';

      const updates = {
        defaultStorageType: selectDefaultTier.value,
        temporaryDurationHours: parseInt(selectTempDuration.value, 10),
        oneTimeDurationMinutes: parseInt(selectOneTimeDuration.value, 10),
        defaultFormat: selectImageFormat.value,
        namingPattern: inputNamingPattern.value.trim() || 'Screenshot_{YYYY}-{MM}-{DD}_{HH}-{mm}-{ss}',
        autoCleanupEnabled: toggleAutoCleanup.checked,
        cleanupNotificationsEnabled: toggleNotifications.checked,
        theme
      };

      await updateSettings(updates);
      applyTheme(theme);
      showToast('Settings saved successfully.', 'success');
    } catch (err) {
      console.error('Failed saving settings:', err);
      showToast('Failed to save settings: ' + err.message, 'error');
    } finally {
      btnSaveSettings.disabled = false;
      btnSaveSettings.textContent = 'Save Settings';
    }
  });

  // Danger zone: Purge Temporary
  btnPurgeTemp.addEventListener('click', () => {
    showConfirmDialog(
      'Purge All Temporary Screenshots?',
      'This will immediately and permanently delete ALL temporary and one-time screenshots from local storage. Permanent screenshots will be untouched.',
      async () => {
        const deletedTemp = await clearScreenshotsByType(STORAGE_TYPES.TEMPORARY);
        const deletedOneTime = await clearScreenshotsByType(STORAGE_TYPES.ONE_TIME);
        const total = deletedTemp + deletedOneTime;
        showToast(`Purged ${total} temporary screenshot${total !== 1 ? 's' : ''}.`, 'success');
        chrome.runtime.sendMessage({ action: 'REFRESH_BADGE' });
      }
    );
  });

  // Danger zone: Erase All
  btnEraseAll.addEventListener('click', () => {
    showConfirmDialog(
      'Erase ALL SnapKeep Screenshots?',
      'Warning: This action is permanent and cannot be undone. All temporary, one-time, and permanent screenshots will be completely erased from your browser.',
      async () => {
        await clearAllScreenshots();
        showToast('All screenshots erased successfully.', 'success');
        chrome.runtime.sendMessage({ action: 'REFRESH_BADGE' });
      }
    );
  });

  // Confirm Modal listeners
  btnConfirmCancel.addEventListener('click', closeConfirmDialog);
  btnConfirmProceed.addEventListener('click', async () => {
    if (pendingConfirmAction) {
      await pendingConfirmAction();
      closeConfirmDialog();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && confirmModal.style.display !== 'none') {
      closeConfirmDialog();
    }
  });
}

async function loadCurrentSettings() {
  try {
    const settings = await getSettings();

    selectDefaultTier.value = settings.defaultStorageType || STORAGE_TYPES.TEMPORARY;
    selectTempDuration.value = String(settings.temporaryDurationHours || 24);
    selectOneTimeDuration.value = String(settings.oneTimeDurationMinutes || 15);
    selectImageFormat.value = settings.defaultFormat || 'png';
    inputNamingPattern.value = settings.namingPattern || 'Screenshot_{YYYY}-{MM}-{DD}_{HH}-{mm}-{ss}';

    toggleAutoCleanup.checked = settings.autoCleanupEnabled !== false;
    toggleNotifications.checked = settings.cleanupNotificationsEnabled !== false;

    if (settings.lastCleanupTimestamp) {
      lblLastCleanup.textContent = `${formatRelativeTime(settings.lastCleanupTimestamp)} (${formatDate(settings.lastCleanupTimestamp)})`;
    } else {
      lblLastCleanup.textContent = 'Never';
    }

    // Set theme
    const theme = settings.theme || 'system';
    themeOptions.forEach(opt => {
      const radio = opt.querySelector('input[type="radio"]');
      if (radio.value === theme) {
        radio.checked = true;
        opt.classList.add('selected');
      } else {
        radio.checked = false;
        opt.classList.remove('selected');
      }
    });
  } catch (err) {
    console.warn('Failed loading current settings:', err);
  }
}

function showConfirmDialog(title, message, onProceed) {
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  pendingConfirmAction = onProceed;
  confirmModal.style.display = 'flex';
}

function closeConfirmDialog() {
  confirmModal.style.display = 'none';
  pendingConfirmAction = null;
}
