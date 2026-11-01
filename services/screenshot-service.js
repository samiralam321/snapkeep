/**
 * SnapKeep Screenshot Capture Service
 * Coordinates visible tab captures, interactive area snipping, and multi-slice full-page captures.
 */

import { sleep } from '../utils/helpers.js';

const RESTRICTED_SCHEMES = ['chrome://', 'chrome-extension://', 'devtools://', 'edge://', 'about:', 'view-source:'];
const RESTRICTED_HOSTS = ['chromewebstore.google.com', 'chrome.google.com'];

/**
 * Check if a URL is restricted from extension script injection or screenshot capture
 * @param {string} url 
 * @returns {boolean}
 */
export function isRestrictedUrl(url) {
  if (!url) return true;
  for (const scheme of RESTRICTED_SCHEMES) {
    if (url.startsWith(scheme)) return true;
  }
  try {
    const parsed = new URL(url);
    if (RESTRICTED_HOSTS.some(h => parsed.hostname.includes(h))) {
      return true;
    }
  } catch {
    return true;
  }
  return false;
}

/**
 * Get current active tab with robust fallbacks
 * @param {number} [targetTabId] - Optional explicit tab ID
 * @returns {Promise<chrome.tabs.Tab>}
 */
export async function getActiveTab(targetTabId = null) {
  if (targetTabId) {
    try {
      const tab = await chrome.tabs.get(targetTabId);
      if (tab) return tab;
    } catch {
      // Fall through to query
    }
  }

  // 1. Try active tab in last focused window (the browser window the user was interacting with)
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs && tabs.length > 0 && tabs[0]) {
      return tabs[0];
    }
  } catch {}

  // 2. Try active tab in current window
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0 && tabs[0]) {
      return tabs[0];
    }
  } catch {}

  // 3. Fallback to any active tab
  try {
    const tabs = await chrome.tabs.query({ active: true });
    if (tabs && tabs.length > 0 && tabs[0]) {
      return tabs[0];
    }
  } catch {}

  throw new Error('No active browser tab found. Please make sure a webpage is open.');
}

/**
 * Capture visible tab directly
 * @param {string} format - 'png' | 'jpeg'
 * @param {number} [targetTabId]
 * @returns {Promise<{ dataUrl: string, sourceUrl: string, sourceTitle: string, format: string }>}
 */
export async function captureVisibleArea(format = 'png', targetTabId = null) {
  const tab = await getActiveTab(targetTabId);

  if (isRestrictedUrl(tab.url)) {
    throw new Error('Chrome does not allow extensions to capture internal chrome:// or Web Store pages. Please switch to a regular website and try again.');
  }

  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: format === 'jpeg' ? 'jpeg' : 'png',
    quality: 100
  });

  return {
    dataUrl,
    sourceUrl: tab.url || '',
    sourceTitle: tab.title || 'Untitled Webpage',
    format: format === 'jpeg' ? 'jpeg' : 'png'
  };
}

/**
 * Inject snipper overlay into the active tab
 * @param {number} [targetTabId]
 * @returns {Promise<boolean>}
 */
export async function startAreaSelection(targetTabId = null) {
  const tab = await getActiveTab(targetTabId);

  if (isRestrictedUrl(tab.url)) {
    throw new Error('Area selection is not permitted on internal chrome:// or Web Store pages. Please switch to a standard webpage and try again.');
  }

  // Inject CSS
  await chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ['content/snipper.css']
  });

  // Inject JS
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/snipper.js']
  });

  return true;
}

/**
 * Capture full webpage by scrolling through vertical slices
 * @param {string} format 
 * @param {(progress: number) => void} [onProgress]
 * @param {number} [targetTabId]
 * @returns {Promise<{ slices: Array<{ dataUrl: string, y: number, height: number }>, totalWidth: number, totalHeight: number, sourceUrl: string, sourceTitle: string, format: string }>}
 */
export async function captureFullPage(format = 'png', onProgress = null, targetTabId = null) {
  const tab = await getActiveTab(targetTabId);

  if (isRestrictedUrl(tab.url)) {
    throw new Error('Full-page capture is not available on internal chrome:// or Web Store pages.');
  }

  // Inject scroller script
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/scroller.js']
  });

  // Request document metrics
  const metrics = await chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_METRICS' });
  if (!metrics || !metrics.scrollHeight) {
    throw new Error('Could not read page dimensions for full-page capture.');
  }

  const { scrollHeight, viewportWidth, viewportHeight, devicePixelRatio, pageTitle, pageUrl } = metrics;
  const dpr = devicePixelRatio || 1;

  // If page fits inside current viewport, single visible capture is sufficient
  if (scrollHeight <= viewportHeight + 10) {
    const { dataUrl } = await captureVisibleArea(format);
    return {
      slices: [{ dataUrl, y: 0, height: Math.round(scrollHeight * dpr) }],
      totalWidth: Math.round(viewportWidth * dpr),
      totalHeight: Math.round(scrollHeight * dpr),
      sourceUrl: pageUrl,
      sourceTitle: pageTitle,
      format
    };
  }

  // Cap max height to 20,000 CSS px to prevent massive memory crashes on infinite-scrolling pages
  const MAX_HEIGHT = 16000;
  const targetHeight = Math.min(scrollHeight, MAX_HEIGHT);
  const slices = [];

  try {
    let currentY = 0;
    while (currentY < targetHeight) {
      // Scroll tab to currentY
      await chrome.tabs.sendMessage(tab.id, { action: 'SCROLL_TO', y: currentY });
      await sleep(120);

      const chunkDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: 'png'
      });

      const sliceHeightCss = Math.min(viewportHeight, targetHeight - currentY);
      slices.push({
        dataUrl: chunkDataUrl,
        y: Math.round(currentY * dpr),
        height: Math.round(sliceHeightCss * dpr)
      });

      currentY += sliceHeightCss;

      if (onProgress) {
        onProgress(Math.min(100, Math.round((currentY / targetHeight) * 100)));
      }
    }
  } finally {
    // Always restore scroll position
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'RESTORE_SCROLL' });
    } catch {
      // Tab may have closed or navigated
    }
  }

  return {
    slices,
    totalWidth: Math.round(viewportWidth * dpr),
    totalHeight: Math.round(targetHeight * dpr),
    sourceUrl: pageUrl,
    sourceTitle: pageTitle,
    format
  };
}
