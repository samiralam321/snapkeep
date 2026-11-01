/**
 * SnapKeep Notification Service
 * Handles in-page toasts for extension pages and optional background desktop notifications.
 */

import { formatBytes } from '../utils/formatters.js';
import { getSettings } from './storage-service.js';

/**
 * Show a sleek in-page toast message
 * @param {string} message 
 * @param {'info' | 'success' | 'warning' | 'error'} type 
 * @param {number} duration 
 */
export function showToast(message, type = 'info', duration = 3200) {
  if (typeof document === 'undefined') return;

  let container = document.getElementById('snapkeep-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'snapkeep-toast-container';
    container.className = 'snapkeep-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `snapkeep-toast snapkeep-toast-${type}`;

  const iconMap = {
    info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
    success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
    warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
    error: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`
  };

  toast.innerHTML = `
    <span class="toast-icon">${iconMap[type] || iconMap.info}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close" aria-label="Close">&times;</button>
  `;

  container.appendChild(toast);

  const closeBtn = toast.querySelector('.toast-close');
  const dismiss = () => {
    toast.classList.add('toast-fade-out');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 250);
  };

  closeBtn.addEventListener('click', dismiss);
  setTimeout(dismiss, duration);
}

/**
 * Send Chrome desktop notification for background cleanup event (if permitted and enabled)
 * @param {number} count 
 * @param {number} bytesFreed 
 */
export async function sendCleanupDesktopNotification(count, bytesFreed) {
  if (count <= 0) return;

  const settings = await getSettings();
  if (!settings.cleanupNotificationsEnabled) return;

  if (typeof chrome !== 'undefined' && chrome.notifications) {
    const formattedSize = formatBytes(bytesFreed);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon48.png'),
      title: 'SnapKeep Cleanup Complete',
      message: `${count} expired screenshot${count > 1 ? 's were' : ' was'} automatically deleted, freeing ${formattedSize}.`,
      priority: 1
    });
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
