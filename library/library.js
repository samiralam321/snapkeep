/**
 * SnapKeep Screenshot Library Controller
 */

import { initTheme } from '../utils/theme.js';
import { STORAGE_TYPES } from '../utils/constants.js';
import { formatBytes, formatDate, formatCountdown } from '../utils/formatters.js';
import { blobToDataUrl, dataUrlToBlob } from '../utils/helpers.js';
import {
  getAllScreenshots,
  getScreenshot,
  updateScreenshot,
  deleteScreenshot,
  deleteScreenshots,
  getStorageStats
} from '../services/database.js';
import { runCleanup } from '../services/cleanup-service.js';
import { showToast } from '../services/notification-service.js';

// State
let currentTab = 'all';
let currentSearch = '';
let currentSort = 'newest';
let selectedIds = new Set();
let displayedScreenshots = [];
let activePreviewItem = null;
let tickingTimer = null;

// DOM Elements
const tabButtons = document.querySelectorAll('.tab-btn');
const tabCountAll = document.getElementById('tab-count-all');
const tabCountTemp = document.getElementById('tab-count-temporary');
const tabCountOneTime = document.getElementById('tab-count-one-time');
const tabCountPerm = document.getElementById('tab-count-permanent');

const inputSearch = document.getElementById('input-search');
const btnClearSearch = document.getElementById('btn-clear-search');
const selectSort = document.getElementById('select-sort');

const btnCleanExpired = document.getElementById('btn-clean-expired');
const btnNavDashboard = document.getElementById('btn-nav-dashboard');
const btnNavSettings = document.getElementById('btn-nav-settings');

const batchBar = document.getElementById('batch-selection-bar');
const batchCheckbox = document.getElementById('checkbox-select-all');
const batchCountText = document.getElementById('batch-count-text');
const btnBatchMovePerm = document.getElementById('btn-batch-move-perm');
const btnBatchMoveTemp = document.getElementById('btn-batch-move-temp');
const btnBatchDelete = document.getElementById('btn-batch-delete');

const grid = document.getElementById('screenshots-grid');
const emptyState = document.getElementById('empty-state');
const emptyTitle = document.getElementById('empty-title');
const emptyDesc = document.getElementById('empty-desc');

// Lightbox Modal Elements
const previewModal = document.getElementById('preview-modal');
const modalScreenshotName = document.getElementById('modal-screenshot-name');
const modalStorageBadge = document.getElementById('modal-storage-badge');
const modalFullImage = document.getElementById('modal-full-image');
const modalMetaDimensions = document.getElementById('modal-meta-dimensions');
const modalMetaSize = document.getElementById('modal-meta-size');
const modalMetaDate = document.getElementById('modal-meta-date');
const modalMetaCountdown = document.getElementById('modal-meta-countdown');
const btnModalRename = document.getElementById('btn-modal-rename');
const btnModalCopy = document.getElementById('btn-modal-copy');
const btnModalDownload = document.getElementById('btn-modal-download');
const btnModalDelete = document.getElementById('btn-modal-delete');
const btnModalClose = document.getElementById('btn-modal-close');

// Rename Modal Elements
const renameModal = document.getElementById('rename-modal');
const inputRenameName = document.getElementById('input-rename-name');
const btnCancelRename = document.getElementById('btn-cancel-rename');
const btnSaveRename = document.getElementById('btn-save-rename');
let itemToRename = null;

// Confirm Modal Elements
const confirmModal = document.getElementById('confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
const btnConfirmProceed = document.getElementById('btn-confirm-proceed');
let pendingConfirmAction = null;

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
  await initTheme();
  setupEventListeners();

  // Check URL params for direct item open
  const urlParams = new URLSearchParams(window.location.search);
  const targetId = urlParams.get('id');

  await refreshLibrary();

  if (targetId) {
    const item = await getScreenshot(targetId);
    if (item) openPreviewModal(item);
  }

  // Live countdown ticker every 1 second
  tickingTimer = setInterval(updateCountdownsOnCards, 1000);
});

window.addEventListener('beforeunload', () => {
  if (tickingTimer) clearInterval(tickingTimer);
});

function setupEventListeners() {
  // Category tabs
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      currentTab = btn.getAttribute('data-tab');
      selectedIds.clear();
      updateBatchBar();
      refreshLibrary();
    });
  });

  // Search input
  inputSearch.addEventListener('input', (e) => {
    currentSearch = e.target.value;
    btnClearSearch.style.display = currentSearch ? 'block' : 'none';
    refreshLibrary();
  });

  btnClearSearch.addEventListener('click', () => {
    inputSearch.value = '';
    currentSearch = '';
    btnClearSearch.style.display = 'none';
    refreshLibrary();
  });

  // Sort dropdown
  selectSort.addEventListener('change', (e) => {
    currentSort = e.target.value;
    refreshLibrary();
  });

  // Clean Expired
  btnCleanExpired.addEventListener('click', async () => {
    try {
      btnCleanExpired.disabled = true;
      const res = await runCleanup({ isManual: true });
      if (res.deletedCount > 0) {
        showToast(`Cleaned up ${res.deletedCount} expired screenshot${res.deletedCount > 1 ? 's' : ''} (${formatBytes(res.bytesFreed)} freed).`, 'success');
      } else {
        showToast('No expired screenshots found.', 'info');
      }
      await refreshLibrary();
    } catch (err) {
      showToast('Cleanup failed: ' + err.message, 'error');
    } finally {
      btnCleanExpired.disabled = false;
    }
  });

  // Navigation
  btnNavDashboard.addEventListener('click', () => {
    window.location.href = '../dashboard/dashboard.html';
  });

  btnNavSettings.addEventListener('click', () => {
    window.location.href = '../settings/settings.html';
  });

  // Batch actions
  batchCheckbox.addEventListener('change', () => {
    if (batchCheckbox.checked) {
      displayedScreenshots.forEach(s => selectedIds.add(s.id));
    } else {
      selectedIds.clear();
    }
    updateBatchBar();
    renderCardsSelection();
  });

  btnBatchMovePerm.addEventListener('click', async () => {
    for (const id of selectedIds) {
      await updateScreenshot(id, { storageType: STORAGE_TYPES.PERMANENT, expiresAt: null });
    }
    showToast(`Moved ${selectedIds.size} screenshots to Permanent storage.`, 'success');
    selectedIds.clear();
    updateBatchBar();
    await refreshLibrary();
  });

  btnBatchMoveTemp.addEventListener('click', async () => {
    const newExpiresAt = Date.now() + (24 * 3600 * 1000);
    for (const id of selectedIds) {
      await updateScreenshot(id, { storageType: STORAGE_TYPES.TEMPORARY, expiresAt: newExpiresAt });
    }
    showToast(`Moved ${selectedIds.size} screenshots to Temporary storage (24h).`, 'success');
    selectedIds.clear();
    updateBatchBar();
    await refreshLibrary();
  });

  btnBatchDelete.addEventListener('click', () => {
    const count = selectedIds.size;
    showConfirmDialog(
      `Delete ${count} Screenshots?`,
      `This will permanently remove the selected screenshots from local storage. This action cannot be undone.`,
      async () => {
        const deleted = await deleteScreenshots(Array.from(selectedIds));
        showToast(`Deleted ${deleted} screenshot${deleted > 1 ? 's' : ''}.`, 'success');
        selectedIds.clear();
        updateBatchBar();
        await refreshLibrary();
        chrome.runtime.sendMessage({ action: 'REFRESH_BADGE' });
      }
    );
  });

  // Modal actions
  btnModalClose.addEventListener('click', closePreviewModal);
  previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) closePreviewModal();
  });

  btnModalCopy.addEventListener('click', async () => {
    if (activePreviewItem) await copyScreenshotToClipboard(activePreviewItem);
  });

  btnModalDownload.addEventListener('click', () => {
    if (activePreviewItem) exportScreenshotFile(activePreviewItem);
  });

  btnModalDelete.addEventListener('click', () => {
    if (!activePreviewItem) return;
    const item = activePreviewItem;
    closePreviewModal();
    promptDeleteSingle(item);
  });

  btnModalRename.addEventListener('click', () => {
    if (!activePreviewItem) return;
    openRenameDialog(activePreviewItem);
  });

  // Rename Dialog
  btnCancelRename.addEventListener('click', closeRenameDialog);
  btnSaveRename.addEventListener('click', async () => {
    if (!itemToRename) return;
    const newName = inputRenameName.value.trim();
    if (!newName) {
      showToast('Screenshot name cannot be empty.', 'warning');
      return;
    }
    await updateScreenshot(itemToRename.id, { name: newName });
    showToast('Screenshot renamed successfully.', 'success');
    closeRenameDialog();
    if (activePreviewItem && activePreviewItem.id === itemToRename.id) {
      activePreviewItem.name = newName;
      modalScreenshotName.textContent = newName;
    }
    await refreshLibrary();
  });

  // Confirm Dialog
  btnConfirmCancel.addEventListener('click', closeConfirmDialog);
  btnConfirmProceed.addEventListener('click', async () => {
    if (pendingConfirmAction) {
      await pendingConfirmAction();
      closeConfirmDialog();
    }
  });

  // ESC key for modals
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (previewModal.style.display !== 'none') closePreviewModal();
      if (renameModal.style.display !== 'none') closeRenameDialog();
      if (confirmModal.style.display !== 'none') closeConfirmDialog();
    }
  });
}

/**
 * Load and render library items
 */
async function refreshLibrary() {
  try {
    // 1. Update tab counts
    const stats = await getStorageStats();
    tabCountAll.textContent = stats.totalCount;
    tabCountTemp.textContent = stats.temporaryCount;
    tabCountOneTime.textContent = stats.oneTimeCount;
    tabCountPerm.textContent = stats.permanentCount;

    // 2. Query items
    displayedScreenshots = await getAllScreenshots({
      storageType: currentTab,
      searchQuery: currentSearch,
      sortBy: currentSort,
      includeBlobs: true
    });

    renderGrid();
  } catch (err) {
    console.error('Failed refreshing library:', err);
    showToast('Failed to load screenshots: ' + err.message, 'error');
  }
}

/**
 * Render screenshot cards
 */
function renderGrid() {
  grid.innerHTML = '';

  if (displayedScreenshots.length === 0) {
    emptyState.style.display = 'block';
    if (currentSearch) {
      emptyTitle.textContent = 'No matching screenshots';
      emptyDesc.textContent = `No results found for "${escapeHtml(currentSearch)}".`;
    } else {
      emptyTitle.textContent = currentTab === 'all'
        ? 'No screenshots yet'
        : `No ${currentTab} screenshots`;
      emptyDesc.textContent = 'Capture screenshots with SnapKeep to organize them automatically.';
    }
    return;
  }

  emptyState.style.display = 'none';

  displayedScreenshots.forEach((item) => {
    const card = document.createElement('div');
    card.className = `screenshot-card ${selectedIds.has(item.id) ? 'selected' : ''}`;
    card.dataset.id = item.id;
    card.dataset.expiresAt = item.expiresAt || '';
    card.dataset.capturedAt = item.capturedAt || '';

    const isTemp = item.storageType === STORAGE_TYPES.TEMPORARY;
    const isOneTime = item.storageType === STORAGE_TYPES.ONE_TIME;
    const isPerm = item.storageType === STORAGE_TYPES.PERMANENT;

    let badgeClass = 'badge-permanent';
    if (isTemp) badgeClass = 'badge-temporary';
    if (isOneTime) badgeClass = 'badge-one-time';

    const countdown = formatCountdown(item.expiresAt, item.capturedAt);
    const countdownClass = countdown.isUrgent ? 'countdown-urgent' : '';

    const thumbSrc = item.thumbnailDataUrl || '../icons/icon48.png';

    card.innerHTML = `
      <input type="checkbox" class="card-select-checkbox" ${selectedIds.has(item.id) ? 'checked' : ''} title="Select">
      
      <div class="card-media-box">
        <img class="card-thumbnail" src="${thumbSrc}" alt="Screenshot preview" loading="lazy">
        <div class="card-overlay-badge">
          <span class="badge ${badgeClass}">${item.storageType}</span>
        </div>
      </div>

      <div class="card-body">
        <div class="card-title-row">
          <span class="card-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
          <button class="btn-card-rename" title="Rename">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
        </div>

        <div class="card-countdown-row">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          <span class="countdown-text ${countdownClass}">${countdown.text}</span>
        </div>

        <div class="card-meta-row">
          <span>${formatBytes(item.fileSize)}</span>
          <span>&bull;</span>
          <span>${formatDate(item.capturedAt)}</span>
        </div>
      </div>

      <div class="card-actions-row">
        <div class="card-actions-left">
          <button class="btn-icon-card btn-action-copy" title="Copy to clipboard">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
          <button class="btn-icon-card btn-action-download" title="Export to downloads">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          </button>
          <button class="btn-icon-card btn-action-toggle-tier" title="${isPerm ? 'Move to Temporary' : 'Move to Permanent'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              ${isPerm 
                ? '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>' 
                : '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>'
              }
            </svg>
          </button>
        </div>
        <div class="card-actions-right">
          <button class="btn-icon-card btn-icon-card-danger btn-action-delete" title="Delete">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
    `;

    // Click handlers
    const checkbox = card.querySelector('.card-select-checkbox');
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      if (checkbox.checked) selectedIds.add(item.id);
      else selectedIds.delete(item.id);
      updateBatchBar();
      card.classList.toggle('selected', checkbox.checked);
    });

    const mediaBox = card.querySelector('.card-media-box');
    mediaBox.addEventListener('click', () => openPreviewModal(item));

    const btnRename = card.querySelector('.btn-card-rename');
    btnRename.addEventListener('click', (e) => {
      e.stopPropagation();
      openRenameDialog(item);
    });

    const btnCopy = card.querySelector('.btn-action-copy');
    btnCopy.addEventListener('click', (e) => {
      e.stopPropagation();
      copyScreenshotToClipboard(item);
    });

    const btnDownload = card.querySelector('.btn-action-download');
    btnDownload.addEventListener('click', (e) => {
      e.stopPropagation();
      exportScreenshotFile(item);
    });

    const btnToggleTier = card.querySelector('.btn-action-toggle-tier');
    btnToggleTier.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (item.storageType === STORAGE_TYPES.PERMANENT) {
        const expiresAt = Date.now() + (24 * 3600 * 1000);
        await updateScreenshot(item.id, { storageType: STORAGE_TYPES.TEMPORARY, expiresAt });
        showToast('Moved to Temporary storage (24h).', 'info');
      } else {
        await updateScreenshot(item.id, { storageType: STORAGE_TYPES.PERMANENT, expiresAt: null });
        showToast('Moved to Permanent storage.', 'success');
      }
      await refreshLibrary();
    });

    const btnDelete = card.querySelector('.btn-action-delete');
    btnDelete.addEventListener('click', (e) => {
      e.stopPropagation();
      promptDeleteSingle(item);
    });

    grid.appendChild(card);
  });
}

function updateBatchBar() {
  const count = selectedIds.size;
  if (count > 0) {
    batchBar.style.display = 'flex';
    batchCountText.textContent = `${count} selected`;
    batchCheckbox.checked = count === displayedScreenshots.length && displayedScreenshots.length > 0;
  } else {
    batchBar.style.display = 'none';
    batchCheckbox.checked = false;
  }
}

function renderCardsSelection() {
  const cards = grid.querySelectorAll('.screenshot-card');
  cards.forEach(card => {
    const id = card.dataset.id;
    const isSelected = selectedIds.has(id);
    card.classList.toggle('selected', isSelected);
    const cb = card.querySelector('.card-select-checkbox');
    if (cb) cb.checked = isSelected;
  });
}

/**
 * Update live countdown tickers on cards
 */
function updateCountdownsOnCards() {
  const cards = grid.querySelectorAll('.screenshot-card');
  cards.forEach((card) => {
    const expiresAtStr = card.dataset.expiresAt;
    const capturedAtStr = card.dataset.capturedAt;
    if (!expiresAtStr) return;

    const expiresAt = parseInt(expiresAtStr, 10);
    const capturedAt = capturedAtStr ? parseInt(capturedAtStr, 10) : null;
    const countdown = formatCountdown(expiresAt, capturedAt);

    const textEl = card.querySelector('.countdown-text');
    if (textEl) {
      textEl.textContent = countdown.text;
      textEl.classList.toggle('countdown-urgent', countdown.isUrgent);
    }
  });

  // Also update modal countdown if open
  if (activePreviewItem && activePreviewItem.expiresAt) {
    const modalCd = formatCountdown(activePreviewItem.expiresAt, activePreviewItem.capturedAt);
    modalMetaCountdown.innerHTML = `<span class="badge ${modalCd.isUrgent ? 'badge-one-time' : 'badge-temporary'}">${modalCd.text}</span>`;
  }
}

/**
 * Lightbox Preview Modal
 */
async function openPreviewModal(item) {
  activePreviewItem = item;
  modalScreenshotName.textContent = item.name;

  let badgeClass = 'badge-permanent';
  if (item.storageType === STORAGE_TYPES.TEMPORARY) badgeClass = 'badge-temporary';
  if (item.storageType === STORAGE_TYPES.ONE_TIME) badgeClass = 'badge-one-time';
  modalStorageBadge.className = `badge ${badgeClass}`;
  modalStorageBadge.textContent = item.storageType;

  modalMetaDimensions.textContent = `${item.width || 0} × ${item.height || 0} px`;
  modalMetaSize.textContent = formatBytes(item.fileSize);
  modalMetaDate.textContent = formatDate(item.capturedAt);

  if (item.expiresAt) {
    const countdown = formatCountdown(item.expiresAt, item.capturedAt);
    modalMetaCountdown.innerHTML = `<span class="badge ${countdown.isUrgent ? 'badge-one-time' : 'badge-temporary'}">${countdown.text}</span>`;
  } else {
    modalMetaCountdown.innerHTML = `<span class="badge badge-permanent">Permanent</span>`;
  }

  // Load high-resolution image blob
  try {
    let src = '';
    if (item.blob) {
      src = await blobToDataUrl(item.blob);
    } else if (item.thumbnailDataUrl) {
      src = item.thumbnailDataUrl;
    }
    modalFullImage.src = src;
  } catch (err) {
    console.error('Failed reading blob for preview:', err);
  }

  previewModal.style.display = 'flex';
}

function closePreviewModal() {
  previewModal.style.display = 'none';
  modalFullImage.src = '';
  activePreviewItem = null;
}

/**
 * Copy screenshot to system clipboard
 */
async function copyScreenshotToClipboard(item) {
  try {
    let pngBlob = item.blob;
    if (!pngBlob) {
      const full = await getScreenshot(item.id);
      pngBlob = full.blob;
    }

    if (pngBlob.type !== 'image/png') {
      const dataUrl = await blobToDataUrl(pngBlob);
      pngBlob = dataUrlToBlob(dataUrl);
    }

    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': pngBlob })
    ]);
    showToast('Screenshot copied to clipboard!', 'success');
  } catch (err) {
    showToast('Failed to copy to clipboard: ' + err.message, 'error');
  }
}

/**
 * Export screenshot to Downloads folder
 */
async function exportScreenshotFile(item) {
  try {
    let dataUrl = '';
    if (item.blob) {
      dataUrl = await blobToDataUrl(item.blob);
    } else {
      const full = await getScreenshot(item.id);
      dataUrl = await blobToDataUrl(full.blob);
    }

    chrome.runtime.sendMessage({
      action: 'EXPORT_SCREENSHOT_FILE',
      dataUrl,
      filename: item.name,
      storageType: item.storageType
    }, (res) => {
      if (res && res.success) {
        showToast(`Exported to ${res.path}`, 'success');
      } else {
        showToast(`Export failed: ${res?.error || 'Unknown error'}`, 'error');
      }
    });
  } catch (err) {
    showToast('Export failed: ' + err.message, 'error');
  }
}

/**
 * Single Delete prompt
 */
function promptDeleteSingle(item) {
  showConfirmDialog(
    'Delete Screenshot?',
    `Are you sure you want to permanently delete "${escapeHtml(item.name)}"? This action cannot be undone.`,
    async () => {
      await deleteScreenshot(item.id);
      showToast('Screenshot deleted successfully.', 'success');
      selectedIds.delete(item.id);
      updateBatchBar();
      await refreshLibrary();
      chrome.runtime.sendMessage({ action: 'REFRESH_BADGE' });
    }
  );
}

/**
 * Rename Dialog
 */
function openRenameDialog(item) {
  itemToRename = item;
  inputRenameName.value = item.name;
  renameModal.style.display = 'flex';
  setTimeout(() => inputRenameName.focus(), 50);
}

function closeRenameDialog() {
  renameModal.style.display = 'none';
  itemToRename = null;
}

/**
 * Confirm Dialog
 */
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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
