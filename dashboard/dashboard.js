/**
 * SnapKeep Storage Dashboard Controller
 */

import { initTheme } from '../utils/theme.js';
import { getStorageStats } from '../services/database.js';
import { getSettings, getCleanupHistory } from '../services/storage-service.js';
import { runCleanup } from '../services/cleanup-service.js';
import { formatBytes, formatDate, formatRelativeTime } from '../utils/formatters.js';
import { showToast } from '../services/notification-service.js';

// DOM Elements
const dashTotalBytes = document.getElementById('dash-total-bytes');
const dashTotalCaption = document.getElementById('dash-total-caption');
const btnDashCleanNow = document.getElementById('btn-dash-clean-now');

const pctTemp = document.getElementById('pct-temp');
const pctOneTime = document.getElementById('pct-onetime');
const pctPerm = document.getElementById('pct-perm');

const barFillTemp = document.getElementById('bar-fill-temp');
const barFillOneTime = document.getElementById('bar-fill-onetime');
const barFillPerm = document.getElementById('bar-fill-perm');

const dashTempCount = document.getElementById('dash-temp-count');
const dashTempBytes = document.getElementById('dash-temp-bytes');

const dashOneTimeCount = document.getElementById('dash-onetime-count');
const dashOneTimeBytes = document.getElementById('dash-onetime-bytes');

const dashPermCount = document.getElementById('dash-perm-count');
const dashPermBytes = document.getElementById('dash-perm-bytes');

const badgeScheduledCount = document.getElementById('badge-scheduled-count');
const dashQueuedCount = document.getElementById('dash-queued-count');
const dashExpiredCount = document.getElementById('dash-expired-count');
const dashLastCleanupTime = document.getElementById('dash-last-cleanup-time');

const historyTableBody = document.getElementById('history-table-body');
const btnNavLibrary = document.getElementById('btn-nav-library');
const btnNavSettings = document.getElementById('btn-nav-settings');

document.addEventListener('DOMContentLoaded', async () => {
  await initTheme();
  setupEventListeners();
  await refreshDashboard();
});

function setupEventListeners() {
  btnNavLibrary.addEventListener('click', () => {
    window.location.href = '../library/library.html';
  });

  btnNavSettings.addEventListener('click', () => {
    window.location.href = '../settings/settings.html';
  });

  btnDashCleanNow.addEventListener('click', async () => {
    try {
      btnDashCleanNow.disabled = true;
      btnDashCleanNow.textContent = 'Cleaning...';

      const res = await runCleanup({ isManual: true });
      if (res.deletedCount > 0) {
        showToast(`Cleaned up ${res.deletedCount} expired screenshot${res.deletedCount > 1 ? 's' : ''} (${formatBytes(res.bytesFreed)} freed).`, 'success');
      } else {
        showToast('No expired screenshots to clean.', 'info');
      }

      await refreshDashboard();
    } catch (err) {
      showToast('Cleanup failed: ' + err.message, 'error');
    } finally {
      btnDashCleanNow.disabled = false;
      btnDashCleanNow.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        Clean Expired Now
      `;
    }
  });
}

async function refreshDashboard() {
  try {
    const stats = await getStorageStats();
    const settings = await getSettings();
    const history = await getCleanupHistory();

    // 1. Hero Metric
    dashTotalBytes.textContent = formatBytes(stats.totalBytes);
    dashTotalCaption.textContent = `Across ${stats.totalCount} total screenshots`;

    // Bar breakdown
    if (stats.totalBytes > 0) {
      const pTemp = Math.round((stats.temporaryBytes / stats.totalBytes) * 100);
      const pOneTime = Math.round((stats.oneTimeBytes / stats.totalBytes) * 100);
      const pPerm = Math.max(0, 100 - pTemp - pOneTime);

      pctTemp.textContent = `${pTemp}%`;
      pctOneTime.textContent = `${pOneTime}%`;
      pctPerm.textContent = `${pPerm}%`;

      barFillTemp.style.width = `${pTemp}%`;
      barFillOneTime.style.width = `${pOneTime}%`;
      barFillPerm.style.width = `${pPerm}%`;
    } else {
      pctTemp.textContent = '0%';
      pctOneTime.textContent = '0%';
      pctPerm.textContent = '0%';

      barFillTemp.style.width = '0%';
      barFillOneTime.style.width = '0%';
      barFillPerm.style.width = '0%';
    }

    // 2. Metrics Cards
    dashTempCount.textContent = stats.temporaryCount;
    dashTempBytes.textContent = formatBytes(stats.temporaryBytes);

    dashOneTimeCount.textContent = stats.oneTimeCount;
    dashOneTimeBytes.textContent = formatBytes(stats.oneTimeBytes);

    dashPermCount.textContent = stats.permanentCount;
    dashPermBytes.textContent = formatBytes(stats.permanentBytes);

    // 3. Scheduled Box
    badgeScheduledCount.textContent = `${stats.scheduledForDeletionCount} items`;
    dashQueuedCount.textContent = stats.scheduledForDeletionCount;
    dashExpiredCount.textContent = stats.expiredCount;

    if (settings.lastCleanupTimestamp) {
      dashLastCleanupTime.textContent = formatRelativeTime(settings.lastCleanupTimestamp);
      dashLastCleanupTime.title = formatDate(settings.lastCleanupTimestamp);
    } else {
      dashLastCleanupTime.textContent = 'Never';
    }

    // 4. Audit Trail Table
    renderHistoryTable(history);
  } catch (err) {
    console.error('Failed refreshing dashboard:', err);
    showToast('Failed to load storage dashboard: ' + err.message, 'error');
  }
}

function renderHistoryTable(history) {
  if (!history || history.length === 0) {
    historyTableBody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center" style="padding: 24px; color: var(--sk-text-muted); text-align: center;">
          No automatic or manual cleanup events recorded yet.
        </td>
      </tr>
    `;
    return;
  }

  historyTableBody.innerHTML = '';
  history.forEach((event) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDate(event.timestamp)} <span style="color: var(--sk-text-secondary); font-size: 11px;">(${formatRelativeTime(event.timestamp)})</span></td>
      <td><strong>${event.count}</strong> screenshot${event.count !== 1 ? 's' : ''}</td>
      <td><span style="color: var(--sk-success); font-weight: 600;">+${formatBytes(event.bytesFreed)} freed</span></td>
      <td><span class="badge badge-permanent">Completed</span></td>
    `;
    historyTableBody.appendChild(tr);
  });
}
