/**
 * SnapKeep Post-Capture Storage Decision Controller
 */

import { initTheme } from '../utils/theme.js';
import { STORAGE_TYPES, STORAGE_TYPE_CONFIG } from '../utils/constants.js';
import { formatBytes, getDomainFromUrl } from '../utils/formatters.js';
import { generateId, generateScreenshotName, dataUrlToBlob, cropImage, createThumbnail, stitchVerticalImages } from '../utils/helpers.js';
import { saveScreenshot } from '../services/database.js';
import { getSettings } from '../services/storage-service.js';
import { showToast } from '../services/notification-service.js';

let currentCapture = {
  blob: null,
  dataUrl: '',
  width: 0,
  height: 0,
  format: 'png',
  sourceUrl: '',
  sourceTitle: '',
  thumbnailDataUrl: ''
};

let userSettings = null;

// DOM Elements
const processingView = document.getElementById('processing-view');
const processingText = document.getElementById('processing-text');
const mainContent = document.getElementById('main-content');
const successView = document.getElementById('success-view');

const previewImg = document.getElementById('preview-image');
const previewDimensions = document.getElementById('preview-dimensions');
const previewSize = document.getElementById('preview-size');
const previewSource = document.getElementById('preview-source');

const inputFilename = document.getElementById('input-filename');
const filenameExt = document.getElementById('filename-ext');

const optTemporary = document.getElementById('opt-temporary');
const optOneTime = document.getElementById('opt-one-time');
const optPermanent = document.getElementById('opt-permanent');
const optionCards = document.querySelectorAll('.storage-option-card');

const btnCopy = document.getElementById('btn-copy-clipboard');
const btnDownload = document.getElementById('btn-download-file');
const btnDiscard = document.getElementById('btn-discard');
const btnSave = document.getElementById('btn-save');
const btnClose = document.getElementById('btn-close-window');

const successTitle = document.getElementById('success-title');
const successMessage = document.getElementById('success-message');
const btnViewLibrary = document.getElementById('btn-view-library');
const btnDone = document.getElementById('btn-done');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await initTheme();
  userSettings = await getSettings();

  setupOptionSelection();
  setupEventListeners();

  await loadPendingCapture();
});

function setupOptionSelection() {
  optionCards.forEach((card) => {
    card.addEventListener('click', () => {
      const radio = card.querySelector('input[type="radio"]');
      radio.checked = true;
      updateSelectedCard();
    });
  });

  // Select default based on user preferences
  const defaultType = userSettings.defaultStorageType || STORAGE_TYPES.TEMPORARY;
  if (defaultType === STORAGE_TYPES.ONE_TIME) optOneTime.checked = true;
  else if (defaultType === STORAGE_TYPES.PERMANENT) optPermanent.checked = true;
  else optTemporary.checked = true;

  updateSelectedCard();
}

function updateSelectedCard() {
  optionCards.forEach((card) => {
    const radio = card.querySelector('input[type="radio"]');
    if (radio.checked) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });
}

function getSelectedStorageType() {
  if (optOneTime.checked) return STORAGE_TYPES.ONE_TIME;
  if (optPermanent.checked) return STORAGE_TYPES.PERMANENT;
  return STORAGE_TYPES.TEMPORARY;
}

async function loadPendingCapture() {
  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'GET_PENDING_CAPTURE' }, resolve);
    });

    const pending = response?.pending;

    if (!pending) {
      processingText.textContent = 'No pending screenshot capture found.';
      showToast('No active screenshot to preview.', 'warning');
      return;
    }

    currentCapture.sourceUrl = pending.sourceUrl || '';
    currentCapture.sourceTitle = pending.sourceTitle || 'Webpage';
    currentCapture.format = pending.format || userSettings.defaultFormat || 'png';

    // Handle different capture modes
    if (pending.mode === 'crop') {
      processingText.textContent = 'Cropping selected area...';
      const cropped = await cropImage(
        pending.fullDataUrl,
        pending.cropRect,
        pending.devicePixelRatio,
        currentCapture.format === 'jpeg' ? 'image/jpeg' : 'image/png',
        pending.viewportWidth || 0,
        pending.viewportHeight || 0
      );
      currentCapture.blob = cropped.blob;
      currentCapture.dataUrl = cropped.dataUrl;
      currentCapture.width = cropped.width;
      currentCapture.height = cropped.height;
    } else if (pending.mode === 'full') {
      processingText.textContent = 'Stitching full-page capture...';
      const stitched = await stitchVerticalImages(
        pending.slices,
        pending.totalWidth,
        pending.totalHeight,
        currentCapture.format === 'jpeg' ? 'image/jpeg' : 'image/png'
      );
      currentCapture.blob = stitched.blob;
      currentCapture.dataUrl = stitched.dataUrl;
      currentCapture.width = stitched.width;
      currentCapture.height = stitched.height;
    } else {
      // Visible tab
      processingText.textContent = 'Preparing preview...';
      currentCapture.dataUrl = pending.dataUrl;
      currentCapture.blob = dataUrlToBlob(pending.dataUrl);

      // Read dimensions
      await new Promise((res) => {
        const img = new Image();
        img.onload = () => {
          currentCapture.width = img.width;
          currentCapture.height = img.height;
          res();
        };
        img.src = pending.dataUrl;
      });
    }

    // Generate high-resolution thumbnail preserving sharp details
    currentCapture.thumbnailDataUrl = await createThumbnail(currentCapture.blob, 800, 500);

    // Populate UI
    renderPreview();
  } catch (err) {
    console.error('Failed loading pending capture:', err);
    processingText.textContent = `Error: ${err.message}`;
    showToast(err.message, 'error');
  }
}

function renderPreview() {
  previewImg.src = currentCapture.dataUrl;
  previewDimensions.textContent = `${currentCapture.width} × ${currentCapture.height} px`;
  previewSize.textContent = formatBytes(currentCapture.blob.size);

  const domain = getDomainFromUrl(currentCapture.sourceUrl);
  previewSource.textContent = domain;
  previewSource.title = currentCapture.sourceUrl || currentCapture.sourceTitle;

  // Generate initial filename
  const ext = currentCapture.format === 'jpeg' ? '.jpg' : '.png';
  filenameExt.textContent = ext;

  const rawDefaultName = generateScreenshotName(userSettings.namingPattern, currentCapture.format);
  const baseName = rawDefaultName.replace(/\.(png|jpg|jpeg)$/i, '');
  inputFilename.value = baseName;

  // Switch to main content
  processingView.style.display = 'none';
  mainContent.style.display = 'block';
}

function setupEventListeners() {
  // Close / Discard
  btnClose.addEventListener('click', closeWindow);
  btnDiscard.addEventListener('click', closeWindow);

  // Copy to clipboard
  btnCopy.addEventListener('click', async () => {
    try {
      if (!currentCapture.blob) return;

      // Chrome ClipboardItem requires image/png
      let pngBlob = currentCapture.blob;
      if (currentCapture.blob.type !== 'image/png') {
        pngBlob = dataUrlToBlob(currentCapture.dataUrl);
      }

      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngBlob })
      ]);
      
      btnCopy.classList.add('copied');
      btnCopy.setAttribute('data-tooltip', 'Copied!');
      btnCopy.setAttribute('title', 'Copied!');
      const origHtml = btnCopy.innerHTML;
      btnCopy.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00C875" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
      `;
      setTimeout(() => {
        btnCopy.classList.remove('copied');
        btnCopy.setAttribute('data-tooltip', 'Copy Image');
        btnCopy.setAttribute('title', 'Copy Image');
        btnCopy.innerHTML = origHtml;
      }, 1800);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
      showToast('Could not copy to clipboard: ' + err.message, 'error');
    }
  });

  // Export to disk via Downloads API
  btnDownload.addEventListener('click', () => {
    if (!currentCapture.dataUrl) return;

    const baseName = inputFilename.value.trim() || 'Screenshot';
    const ext = filenameExt.textContent;
    const fullName = baseName.endsWith(ext) ? baseName : baseName + ext;
    const storageType = getSelectedStorageType();

    chrome.runtime.sendMessage({
      action: 'EXPORT_SCREENSHOT_FILE',
      dataUrl: currentCapture.dataUrl,
      filename: fullName,
      storageType
    }, (res) => {
      if (res && res.success) {
        showToast(`Exported to ${res.path}`, 'success');
      } else {
        showToast(`Export failed: ${res?.error || 'Unknown error'}`, 'error');
      }
    });
  });

  // Save screenshot with selected storage tier
  btnSave.addEventListener('click', async () => {
    const origSaveHtml = btnSave.innerHTML;
    try {
      btnSave.disabled = true;
      btnSave.setAttribute('data-tooltip', 'Saving...');
      btnSave.setAttribute('title', 'Saving...');
      btnSave.innerHTML = `
        <svg class="spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg>
      `;

      const storageType = getSelectedStorageType();
      const capturedAt = Date.now();
      let expiresAt = null;

      if (storageType === STORAGE_TYPES.TEMPORARY) {
        const hours = userSettings.temporaryDurationHours || 24;
        expiresAt = capturedAt + (hours * 3600 * 1000);
      } else if (storageType === STORAGE_TYPES.ONE_TIME) {
        const minutes = userSettings.oneTimeDurationMinutes || 15;
        expiresAt = capturedAt + (minutes * 60 * 1000);
      }

      const baseName = inputFilename.value.trim() || 'Screenshot';
      const ext = filenameExt.textContent;
      const fullName = baseName.endsWith(ext) ? baseName : baseName + ext;

      const record = {
        id: generateId(),
        name: fullName,
        blob: currentCapture.blob,
        thumbnailDataUrl: currentCapture.thumbnailDataUrl,
        capturedAt,
        expiresAt,
        storageType,
        sourceUrl: currentCapture.sourceUrl,
        sourceTitle: currentCapture.sourceTitle,
        fileSize: currentCapture.blob.size,
        width: currentCapture.width,
        height: currentCapture.height,
        format: currentCapture.format,
        status: 'active'
      };

      await saveScreenshot(record);

      // Clear pending cache
      chrome.runtime.sendMessage({ action: 'CLEAR_PENDING_CAPTURE' });
      chrome.runtime.sendMessage({ action: 'REFRESH_BADGE' });

      // Show confirmation
      mainContent.style.display = 'none';
      successView.style.display = 'flex';

      if (storageType === STORAGE_TYPES.TEMPORARY) {
        successTitle.textContent = 'Saved Temporarily';
        successMessage.textContent = 'This screenshot will be automatically deleted in 24 hours to keep your laptop storage clean.';
      } else if (storageType === STORAGE_TYPES.ONE_TIME) {
        successTitle.textContent = 'Saved for One-Time Use';
        successMessage.textContent = 'Ready for immediate use. Will be automatically deleted in 15 minutes as a safety fallback.';
      } else {
        successTitle.textContent = 'Saved Permanently';
        successMessage.textContent = 'Saved indefinitely in your library. SnapKeep will never delete this screenshot automatically.';
      }
    } catch (err) {
      console.error('Failed saving screenshot:', err);
      showToast('Failed to save screenshot: ' + err.message, 'error');
      btnSave.disabled = false;
      btnSave.setAttribute('data-tooltip', 'Save Screenshot');
      btnSave.setAttribute('title', 'Save Screenshot');
      btnSave.innerHTML = origSaveHtml;
    }
  });

  // Success view buttons
  btnViewLibrary.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('library/library.html') });
    closeWindow();
  });

  btnDone.addEventListener('click', closeWindow);
}

function closeWindow() {
  chrome.runtime.sendMessage({ action: 'CLEAR_PENDING_CAPTURE' });
  window.close();
}
