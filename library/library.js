/**
 * SnapKeep Screenshot Library Controller
 */

import { initTheme } from '../utils/theme.js';
import { STORAGE_TYPES } from '../utils/constants.js';
import { formatBytes, formatDate, formatCountdown, formatShortCountdown, getDomainFromUrl } from '../utils/formatters.js';
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
let activeObjectUrls = [];

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
    if (activePreviewItem) await copyScreenshotToClipboard(activePreviewItem, btnModalCopy);
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
 * Render screenshot cards — CleanShot X / Linear Human-Crafted Design
 */
function renderGrid() {
  // Revoke previous object URLs to prevent memory leaks
  activeObjectUrls.forEach(url => URL.revokeObjectURL(url));
  activeObjectUrls = [];

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

    let pillClass = 'pill-perm';
    let dotClass = 'dot-perm';
    if (isTemp) { pillClass = 'pill-temp'; dotClass = 'dot-temp'; }
    if (isOneTime) { pillClass = 'pill-onetime'; dotClass = 'dot-onetime'; }

    const countdown = formatShortCountdown(item.expiresAt);
    if (countdown.isUrgent) pillClass += ' pill-urgent';

    // ALWAYS use full-resolution Blob object URL if available for 100% crispness!
    let imageSrc = '';
    if (item.blob) {
      imageSrc = URL.createObjectURL(item.blob);
      activeObjectUrls.push(imageSrc);
    } else if (item.thumbnailDataUrl) {
      imageSrc = item.thumbnailDataUrl;
    } else {
      imageSrc = '../icons/icon48.png';
    }

    const domain = getDomainFromUrl(item.sourceUrl);

    card.innerHTML = `
      <label class="card-select-label" title="Select screenshot">
        <input type="checkbox" class="card-select-checkbox" ${selectedIds.has(item.id) ? 'checked' : ''}>
      </label>

      <!-- Hero Preview Container -->
      <div class="card-preview-viewport" title="Click to view full resolution">
        <div class="card-image-stage">
          <img class="card-image" src="${imageSrc}" alt="${escapeHtml(item.name)}" loading="lazy">
        </div>
        
        <!-- Floating Glass Retention Pill -->
        <div class="card-pill-wrap">
          <div class="retention-pill ${pillClass}">
            <span class="status-dot ${dotClass}"></span>
            <span class="countdown-label">${countdown.text}</span>
          </div>
        </div>

        <!-- Hover Quick Look Overlay -->
        <div class="quick-view-overlay">
          <span class="quick-view-pill">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
            Quick View
          </span>
        </div>
      </div>

      <!-- Card Body & Metadata -->
      <div class="card-content-area">
        <div class="card-header-line">
          <span class="card-title-text" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
          <button class="btn-rename-trigger" title="Rename file">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          </button>
        </div>

        <div class="card-meta-line">
          <span class="meta-domain" title="${escapeHtml(item.sourceUrl || item.sourceTitle)}">${escapeHtml(domain)}</span>
          <span class="meta-separator">&bull;</span>
          <span class="meta-size">${formatBytes(item.fileSize)}</span>
          <span class="meta-separator">&bull;</span>
          <span class="meta-dims">${item.width || 0}×${item.height || 0}</span>
          <span class="meta-separator">&bull;</span>
          <span>${formatDate(item.capturedAt)}</span>
        </div>
      </div>

      <!-- Action Bar -->
      <div class="card-action-bar">
        <button class="btn-copy-hero" title="Copy screenshot to clipboard">
          <svg class="copy-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          <span class="copy-label">Copy</span>
        </button>
        
        <div class="action-btn-group">
          <button class="action-icon-btn btn-tier-toggle" title="${isPerm ? 'Move to Temporary (24h auto-delete)' : 'Pin permanently (Keep forever)'}">
            ${isPerm
              ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'
              : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>'
            }
          </button>
          <button class="action-icon-btn btn-download-file" title="Export file to laptop">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          </button>
          <button class="action-icon-btn action-icon-btn-danger btn-delete-single" title="Delete screenshot">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
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

    const viewport = card.querySelector('.card-preview-viewport');
    viewport.addEventListener('click', () => openPreviewModal(item));

    const btnRename = card.querySelector('.btn-rename-trigger');
    btnRename.addEventListener('click', (e) => {
      e.stopPropagation();
      openRenameDialog(item);
    });

    const btnCopy = card.querySelector('.btn-copy-hero');
    btnCopy.addEventListener('click', async (e) => {
      e.stopPropagation();
      await copyScreenshotToClipboard(item, btnCopy);
    });

    const btnDownload = card.querySelector('.btn-download-file');
    btnDownload.addEventListener('click', (e) => {
      e.stopPropagation();
      exportScreenshotFile(item);
    });

    const btnToggleTier = card.querySelector('.btn-tier-toggle');
    btnToggleTier.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (item.storageType === STORAGE_TYPES.PERMANENT) {
        const expiresAt = Date.now() + (24 * 3600 * 1000);
        await updateScreenshot(item.id, { storageType: STORAGE_TYPES.TEMPORARY, expiresAt });
        showToast('Moved to Temporary storage (24h).', 'info');
      } else {
        await updateScreenshot(item.id, { storageType: STORAGE_TYPES.PERMANENT, expiresAt: null });
        showToast('Pinned to Permanent storage.', 'success');
      }
      await refreshLibrary();
    });

    const btnDelete = card.querySelector('.btn-delete-single');
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
    if (!expiresAtStr) return;

    const expiresAt = parseInt(expiresAtStr, 10);
    const countdown = formatShortCountdown(expiresAt);

    const labelEl = card.querySelector('.countdown-label');
    const pillEl = card.querySelector('.retention-pill');
    if (labelEl) {
      labelEl.textContent = countdown.text;
    }
    if (pillEl) {
      pillEl.classList.toggle('pill-urgent', countdown.isUrgent);
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

  // Load high-resolution image blob directly
  try {
    let src = '';
    if (item.blob) {
      src = URL.createObjectURL(item.blob);
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
 * Copy screenshot to system clipboard with tactile feedback
 * @param {Object} item 
 * @param {HTMLElement} [triggerBtn] 
 */
async function copyScreenshotToClipboard(item, triggerBtn = null) {
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

    // Tactile button feedback (morph to "Copied!" for 1.8 seconds)
    if (triggerBtn) {
      triggerBtn.classList.add('copied');
      const originalHtml = triggerBtn.innerHTML;
      triggerBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>Copied!</span>
      `;
      setTimeout(() => {
        triggerBtn.classList.remove('copied');
        triggerBtn.innerHTML = originalHtml;
      }, 1800);
    } else {
      showToast('Screenshot copied to clipboard!', 'success');
    }
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
