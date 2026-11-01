/**
 * SnapKeep Popup Controller
 */

import { initTheme } from '../utils/theme.js';
import { getStorageStats, getAllScreenshots } from '../services/database.js';
import { formatBytes, formatRelativeTime } from '../utils/formatters.js';
import { showToast } from '../services/notification-service.js';

// Elements
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

document.addEventListener('DOMContentLoaded', async () => {
  await initTheme();
  setupEventListeners();
  await loadDashboardOverview();
  await loadRecentScreenshots();
});

function setupEventListeners() {
  // Capture actions
  btnCaptureVisible.addEventListener('click', async () => {
    chrome.runtime.sendMessage({ action: 'TRIGGER_CAPTURE_VISIBLE' });
    window.close();
  });

  btnCaptureArea.addEventListener('click', async () => {
    chrome.runtime.sendMessage({ action: 'TRIGGER_START_SNIPPER' });
    window.close();
  });

  btnCaptureFull.addEventListener('click', async () => {
    chrome.runtime.sendMessage({ action: 'TRIGGER_CAPTURE_FULL' });
    window.close();
  });

  // Navigation
  btnOpenLibrary.addEventListener('click', openLibrary);
  btnViewAll.addEventListener('click', openLibrary);

  btnOpenDashboard.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  });

  btnOpenSettings.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
  });

  // Manual cleanup
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
        showToast('Cleanup failed: ' + (response?.error || 'Unknown error'), 'error');
      }
    } catch (err) {
      showToast('Cleanup failed: ' + err.message, 'error');
    } finally {
      btnQuickClean.classList.remove('rotating');
    }
  });
}

function openLibrary() {
  chrome.tabs.create({ url: chrome.runtime.getURL('library/library.html') });
}

async function loadDashboardOverview() {
  try {
    const stats = await getStorageStats();

    statTotalCount.textContent = stats.totalCount;
    statTempCount.textContent = stats.temporaryCount + stats.oneTimeCount;
    statPermCount.textContent = stats.permanentCount;

    statTotalBytes.textContent = `${formatBytes(stats.totalBytes)} used`;
    statScheduledDeletion.textContent = `${stats.scheduledForDeletionCount} scheduled for cleanup`;

    // Progress bar calculations
    if (stats.totalBytes > 0) {
      const tempPercent = Math.round(((stats.temporaryBytes + stats.oneTimeBytes) / stats.totalBytes) * 100);
      const permPercent = 100 - tempPercent;
      progressTemp.style.width = `${tempPercent}%`;
      progressPerm.style.width = `${permPercent}%`;
    } else {
      progressTemp.style.width = '0%';
      progressPerm.style.width = '0%';
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
      emptyRecentState.style.display = 'block';
      return;
    }

    emptyRecentState.style.display = 'none';
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
      const dotColor = isPerm ? '#10B981' : isOneTime ? '#EF4444' : '#D97706';
      const label = isPerm ? 'Permanent' : isOneTime ? '15m' : '24h';

      card.innerHTML = `
        <img class="recent-thumb" src="${thumbSrc}" alt="Thumbnail">
        <div class="recent-info">
          <div class="recent-name" title="${item.name}">${escapeHtml(item.name)}</div>
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
