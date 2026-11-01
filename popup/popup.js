/**
 * SnapKeep Popup Controller
 * Rock-solid capture triggers, active tab validation, and responsive feedback.
 */

import { initTheme } from '../utils/theme.js';
import { getStorageStats, getAllScreenshots } from '../services/database.js';
import { formatBytes, formatRelativeTime } from '../utils/formatters.js';
import { showToast } from '../services/notification-service.js';

// DOM Elements
const btnCaptureVisible = document.getElementById('btn-capture-visible');
const btnCaptureArea = document.getElementById('btn-capture-area');
const btnCaptureFull = document.getElementById('btn-capture-full');

const btnQuickClean = document.getElementById('btn-quick-clean');
const btnOpenSettings = document.getElementById('btn-open-settings');
const btnOpenDashboard = document.getElementById('btn-open-dashboard');
const btnOpenLibrary = document.getElementById('btn-open-library');
const btnViewAll = document.getElementById('btn-view-all');

const statTotalCount = document.getElementById('stat-total-count');
const statTempCount = document.getElementById('stat-temp-count');
const statPermCount = document.getElementById('stat-perm-count');
const statTotalBytes = document.getElementById('stat-total-bytes');
const statScheduledDeletion = document.getElementById('stat-scheduled-deletion');

const progressTemp = document.getElementById('progress-temp');
const progressPerm = document.getElementById('progress-perm');

const recentList = document.getElementById('recent-list');
const emptyRecentState = document.getElementById('empty-recent-state');

const popupNotice = document.getElementById('popup-notice');
const popupNoticeText = document.getElementById('popup-notice-text');

const RESTRICTED_SCHEMES = ['chrome://', 'chrome-extension://', 'devtools://', 'edge://', 'about:', 'view-source:'];
const RESTRICTED_HOSTS = ['chromewebstore.google.com', 'chrome.google.com'];

function isRestricted(url) {
  if (!url) return true;
  if (RESTRICTED_SCHEMES.some(s => url.startsWith(s))) return true;
  try {
    const parsed = new URL(url);
    if (RESTRICTED_HOSTS.some(h => parsed.hostname.includes(h))) return true;
  } catch {
    return true;
  }
  return false;
}

function showNotice(message, type = 'warning') {
  if (!popupNotice || !popupNoticeText) return;
  popupNoticeText.textContent = message;
  popupNotice.className = `popup-notice ${type === 'error' ? 'notice-error' : ''}`;
  popupNotice.style.display = 'block';
}

function hideNotice() {
  if (popupNotice) popupNotice.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', async () => {
  await initTheme();
  setupEventListeners();
  await checkActiveTabStatus();
  await loadDashboardOverview();
  await loadRecentScreenshots();
});

async function checkActiveTabStatus() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && isRestricted(tab.url)) {
      showNotice('You are on an internal Chrome tab. Switch to any regular website (e.g. google.com) to capture screenshots.');
    }
  } catch (err) {
    console.warn('Could not query active tab on popup open:', err);
  }
}

function setupEventListeners() {
  // Capture actions
  btnCaptureVisible.addEventListener('click', () => {
    handleCaptureTrigger('TRIGGER_CAPTURE_VISIBLE', btnCaptureVisible);
  });

  btnCaptureArea.addEventListener('click', () => {
    handleCaptureTrigger('TRIGGER_START_SNIPPER', btnCaptureArea);
  });

  btnCaptureFull.addEventListener('click', () => {
    handleCaptureTrigger('TRIGGER_CAPTURE_FULL', btnCaptureFull);
  });

  // Navigation
  btnOpenLibrary.addEventListener('click', openLibrary);
  if (btnViewAll) btnViewAll.addEventListener('click', openLibrary);

  if (btnOpenDashboard) {
    btnOpenDashboard.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
    });
  }

  if (btnOpenSettings) {
    btnOpenSettings.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
    });
  }

  // Manual cleanup
  if (btnQuickClean) {
    btnQuickClean.addEventListener('click', async () => {
      btnQuickClean.classList.add('rotating');
      try {
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: 'TRIGGER_MANUAL_CLEANUP' }, resolve);
        });

        if (response && response.success) {
          const count = response.result.deletedCount;
          if (count > 0) {
            showToast(`Cleaned ${count} expired screenshot${count > 1 ? 's' : ''}!`, 'success');
          } else {
            showToast('No expired screenshots to clean.', 'info');
          }
          await loadDashboardOverview();
          await loadRecentScreenshots();
        } else {
          showNotice('Cleanup failed: ' + (response?.error || 'Unknown error'), 'error');
        }
      } catch (err) {
        showNotice('Cleanup failed: ' + err.message, 'error');
      } finally {
        btnQuickClean.classList.remove('rotating');
      }
    });
  }
}

async function handleCaptureTrigger(action, buttonEl) {
  hideNotice();

  try {
    // 1. Get active tab from the window that hosts this popup
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      showNotice('No active webpage found. Please open a webpage and try again.', 'error');
      return;
    }

    // 2. Check if the tab is an internal Chrome page
    if (isRestricted(tab.url)) {
      showNotice('Chrome security prevents extensions from capturing chrome:// and Web Store pages. Please switch to a regular website (e.g. google.com or github.com) and click Snap Screen!', 'warning');
      return;
    }

    if (buttonEl) {
      buttonEl.style.opacity = '0.7';
      buttonEl.style.pointerEvents = 'none';
    }

    // 3. Dispatch to service worker with explicit tabId and windowId
    chrome.runtime.sendMessage({
      action,
      tabId: tab.id,
      windowId: tab.windowId
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[SnapKeep] Runtime message error:', chrome.runtime.lastError);
        showNotice(chrome.runtime.lastError.message, 'error');
        if (buttonEl) {
          buttonEl.style.opacity = '1';
          buttonEl.style.pointerEvents = 'auto';
        }
        return;
      }

      if (response && !response.success && response.error) {
        showNotice(response.error, 'error');
        if (buttonEl) {
          buttonEl.style.opacity = '1';
          buttonEl.style.pointerEvents = 'auto';
        }
        return;
      }

      // Close popup cleanly once capture has successfully initiated
      window.close();
    });
  } catch (err) {
    console.error('[SnapKeep] Capture trigger exception:', err);
    showNotice(err.message || 'Capture failed', 'error');
    if (buttonEl) {
      buttonEl.style.opacity = '1';
      buttonEl.style.pointerEvents = 'auto';
    }
  }
}

function openLibrary() {
  chrome.tabs.create({ url: chrome.runtime.getURL('library/library.html') });
}

async function loadDashboardOverview() {
  try {
    const stats = await getStorageStats();

    if (statTotalCount) statTotalCount.textContent = stats.totalCount;
    if (statTempCount) statTempCount.textContent = stats.temporaryCount + stats.oneTimeCount;
    if (statPermCount) statPermCount.textContent = stats.permanentCount;

    if (statTotalBytes) statTotalBytes.textContent = `${formatBytes(stats.totalBytes)} used`;
    if (statScheduledDeletion) statScheduledDeletion.textContent = `${stats.scheduledForDeletionCount} scheduled for cleanup`;

    // Progress bar calculations if elements exist
    if (progressTemp && progressPerm) {
      if (stats.totalBytes > 0) {
        const tempPercent = Math.round(((stats.temporaryBytes + stats.oneTimeBytes) / stats.totalBytes) * 100);
        const permPercent = 100 - tempPercent;
        progressTemp.style.width = `${tempPercent}%`;
        progressPerm.style.width = `${permPercent}%`;
      } else {
        progressTemp.style.width = '0%';
        progressPerm.style.width = '0%';
      }
    }
  } catch (err) {
    console.warn('Failed loading storage overview:', err);
  }
}

async function loadRecentScreenshots() {
  try {
    const screenshots = await getAllScreenshots({
      sortBy: 'newest',
      includeBlobs: true
    });

    const recents = screenshots.slice(0, 3);

    if (recents.length === 0) {
      if (emptyRecentState) emptyRecentState.style.display = 'flex';
      return;
    }

    if (emptyRecentState) emptyRecentState.style.display = 'none';
    if (!recentList) return;
    recentList.innerHTML = '';

    recents.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'recent-item-card';

      let thumbSrc = '';
      if (item.blob) {
        thumbSrc = URL.createObjectURL(item.blob);
      } else if (item.thumbnailDataUrl) {
        thumbSrc = item.thumbnailDataUrl;
      } else {
        thumbSrc = '../icons/icon48.png';
      }

      const isPerm = item.storageType === 'permanent';
      const isOneTime = item.storageType === 'one-time';
      const dotColor = isPerm ? '#00C875' : isOneTime ? '#EF4444' : '#F59E0B';
      const label = isPerm ? 'Permanent' : isOneTime ? '15m' : '24h';

      card.innerHTML = `
        <img class="recent-thumb" src="${thumbSrc}" alt="Thumbnail">
        <div class="recent-info">
          <div class="recent-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
          <div class="recent-meta">
            <span>${formatRelativeTime(item.capturedAt)}</span>
            <span>&bull;</span>
            <span style="display: inline-flex; align-items: center; gap: 4px; font-weight: 500;">
              <span style="width: 5px; height: 5px; border-radius: 50%; background: ${dotColor};"></span>
              ${label}
            </span>
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        chrome.tabs.create({
          url: chrome.runtime.getURL(`library/library.html?id=${item.id}`)
        });
      });

      recentList.appendChild(card);
    });
  } catch (err) {
    console.warn('Failed loading recents:', err);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
