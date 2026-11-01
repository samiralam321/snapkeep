/**
 * SnapKeep Background Service Worker (Manifest V3)
 * Orchestrates periodic cleanup alarms, keyboard commands, screenshot message routing, and downloads.
 */

import { ALARMS, STORAGE_TYPES } from '../utils/constants.js';
import { runCleanup, updateExtensionBadge } from '../services/cleanup-service.js';
import { getSettings, updateSettings } from '../services/storage-service.js';
import { captureVisibleArea, startAreaSelection, captureFullPage, getActiveTab, isRestrictedUrl } from '../services/screenshot-service.js';

// Ephemeral in-memory store for pending captures before user makes storage decision
let pendingCaptureData = null;

// Lifecycle: Installation and Update
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[SnapKeep] Extension installed/updated:', details.reason);

  // Initialize alarms
  chrome.alarms.create(ALARMS.CLEANUP_ALARM_NAME, {
    periodInMinutes: ALARMS.CLEANUP_PERIOD_MINUTES
  });

  // Run initial cleanup sweep
  try {
    await runCleanup();
    await updateExtensionBadge();
  } catch (err) {
    console.error('[SnapKeep] Initial cleanup error:', err);
  }
});

// Lifecycle: Browser Startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('[SnapKeep] Browser started. Ensuring alarm & checking cleanup...');
  chrome.alarms.create(ALARMS.CLEANUP_ALARM_NAME, {
    periodInMinutes: ALARMS.CLEANUP_PERIOD_MINUTES
  });

  try {
    await runCleanup();
    await updateExtensionBadge();
  } catch (err) {
    console.error('[SnapKeep] Startup cleanup error:', err);
  }
});

// Alarm Listener
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARMS.CLEANUP_ALARM_NAME) {
    try {
      await runCleanup();
    } catch (err) {
      console.error('[SnapKeep] Scheduled cleanup error:', err);
    }
  }
});

/**
 * Open the Post-Capture Decision Window
 */
async function openDecisionWindow() {
  const url = chrome.runtime.getURL('capture/capture.html');

  // Try creating a focused popup window
  try {
    const currentWin = await chrome.windows.getCurrent();
    const width = 450;
    const height = 660;
    const left = Math.max(0, Math.round((currentWin.left || 0) + ((currentWin.width || 1200) - width) / 2));
    const top = Math.max(0, Math.round((currentWin.top || 0) + ((currentWin.height || 800) - height) / 2));

    await chrome.windows.create({
      url,
      type: 'popup',
      width,
      height,
      left,
      top,
      focused: true
    });
  } catch (err) {
    console.warn('[SnapKeep] Could not create popup window, opening tab instead:', err);
    await chrome.tabs.create({ url, active: true });
  }
}

// Commands (Keyboard shortcuts)
chrome.commands.onCommand.addListener(async (command) => {
  console.log('[SnapKeep] Command received:', command);

  try {
    if (command === 'capture-visible') {
      const settings = await getSettings();
      const result = await captureVisibleArea(settings.defaultFormat || 'png');
      pendingCaptureData = {
        mode: 'visible',
        dataUrl: result.dataUrl,
        sourceUrl: result.sourceUrl,
        sourceTitle: result.sourceTitle,
        format: result.format,
        timestamp: Date.now()
      };
      await openDecisionWindow();
    } else if (command === 'capture-area') {
      await startAreaSelection();
    } else if (command === 'capture-full') {
      const settings = await getSettings();
      const result = await captureFullPage(settings.defaultFormat || 'png');
      pendingCaptureData = {
        mode: 'full',
        ...result,
        timestamp: Date.now()
      };
      await openDecisionWindow();
    }
  } catch (err) {
    console.error(`[SnapKeep] Command ${command} failed:`, err);
  }
});

// Runtime Message Handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Area selection finished in content script
  if (request.action === 'SNIP_SELECTION_FINISHED') {
    (async () => {
      try {
        const settings = await getSettings();
        const tab = sender.tab || (await getActiveTab());

        // Capture visible tab immediately to crop
        const fullDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
          format: settings.defaultFormat === 'jpeg' ? 'jpeg' : 'png',
          quality: 95
        });

        pendingCaptureData = {
          mode: 'crop',
          fullDataUrl,
          cropRect: request.rect,
          devicePixelRatio: request.devicePixelRatio || 1,
          sourceUrl: request.pageUrl || tab.url || '',
          sourceTitle: request.pageTitle || tab.title || 'Untitled Webpage',
          format: settings.defaultFormat || 'png',
          timestamp: Date.now()
        };

        await openDecisionWindow();
        sendResponse({ success: true });
      } catch (err) {
        console.error('[SnapKeep] Failed processing snip selection:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // Retrieve pending capture data for the decision UI
  if (request.action === 'GET_PENDING_CAPTURE') {
    sendResponse({ pending: pendingCaptureData });
    return false;
  }

  // Clear pending capture data
  if (request.action === 'CLEAR_PENDING_CAPTURE') {
    pendingCaptureData = null;
    sendResponse({ cleared: true });
    return false;
  }

  // Manual Trigger: Capture visible area from popup
  if (request.action === 'TRIGGER_CAPTURE_VISIBLE') {
    (async () => {
      try {
        const settings = await getSettings();
        const result = await captureVisibleArea(settings.defaultFormat || 'png');
        pendingCaptureData = {
          mode: 'visible',
          dataUrl: result.dataUrl,
          sourceUrl: result.sourceUrl,
          sourceTitle: result.sourceTitle,
          format: result.format,
          timestamp: Date.now()
        };
        await openDecisionWindow();
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // Manual Trigger: Select Area from popup
  if (request.action === 'TRIGGER_START_SNIPPER') {
    (async () => {
      try {
        await startAreaSelection();
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // Manual Trigger: Capture Full Page from popup
  if (request.action === 'TRIGGER_CAPTURE_FULL') {
    (async () => {
      try {
        const settings = await getSettings();
        const result = await captureFullPage(settings.defaultFormat || 'png');
        pendingCaptureData = {
          mode: 'full',
          ...result,
          timestamp: Date.now()
        };
        await openDecisionWindow();
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // Manual Clean Trigger
  if (request.action === 'TRIGGER_MANUAL_CLEANUP') {
    (async () => {
      try {
        const result = await runCleanup({ isManual: true });
        sendResponse({ success: true, result });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // Update extension badge
  if (request.action === 'REFRESH_BADGE') {
    (async () => {
      await updateExtensionBadge();
      sendResponse({ refreshed: true });
    })();
    return true;
  }

  // Export Screenshot to Chrome Downloads folder
  if (request.action === 'EXPORT_SCREENSHOT_FILE') {
    (async () => {
      try {
        const { dataUrl, filename, storageType } = request;
        let subfolder = 'Temporary';
        if (storageType === STORAGE_TYPES.ONE_TIME) subfolder = 'One-Time';
        if (storageType === STORAGE_TYPES.PERMANENT) subfolder = 'Permanent';

        const downloadPath = `SnapKeep/${subfolder}/${filename}`;

        chrome.downloads.download({
          url: dataUrl,
          filename: downloadPath,
          saveAs: false,
          conflictAction: 'uniquify'
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ success: true, downloadId, path: downloadPath });
          }
        });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});
