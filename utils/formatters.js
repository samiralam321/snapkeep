/**
 * SnapKeep UI and Data Formatters
 */

/**
 * Format bytes into human readable string (e.g. 1.2 MB, 450 KB)
 * @param {number} bytes 
 * @param {number} decimals 
 * @returns {string}
 */
export function formatBytes(bytes, decimals = 1) {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const safeI = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, safeI)).toFixed(dm))} ${sizes[safeI]}`;
}

/**
 * Format timestamp to localized readable string (e.g. "Nov 1, 2026, 2:30 PM")
 * @param {number|Date} timestamp 
 * @returns {string}
 */
export function formatDate(timestamp) {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

/**
 * Format relative time (e.g. "5 minutes ago", "just now")
 * @param {number} timestamp 
 * @returns {string}
 */
export function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Never';
  const now = Date.now();
  const diffMs = now - timestamp;
  if (diffMs < 5000) return 'Just now';
  
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Format countdown to expiration
 * @param {number|null} expiresAt 
 * @returns {{ text: string, isExpired: boolean, isUrgent: boolean, percentLeft?: number, totalDurationMs?: number }}
 */
export function formatCountdown(expiresAt, capturedAt = null) {
  if (!expiresAt) {
    return { text: 'Permanent — Never expires', isExpired: false, isUrgent: false };
  }
  
  const now = Date.now();
  const remainingMs = expiresAt - now;
  
  if (remainingMs <= 0) {
    return { text: 'Expired — Scheduled for deletion', isExpired: true, isUrgent: true, percentLeft: 0 };
  }
  
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  let text = '';
  if (hours > 0) {
    text = `Expires in ${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    text = `Expires in ${minutes}m ${seconds}s`;
  } else {
    text = `Expires in ${seconds}s`;
  }
  
  // Urgent if under 5 minutes remaining
  const isUrgent = remainingMs < 5 * 60 * 1000;
  
  let percentLeft = 100;
  if (capturedAt && expiresAt > capturedAt) {
    const total = expiresAt - capturedAt;
    percentLeft = Math.max(0, Math.min(100, Math.round((remainingMs / total) * 100)));
  }
  
  return {
    text,
    isExpired: false,
    isUrgent,
    percentLeft
  };
}

/**
 * Extract clean hostname/domain from URL
 * @param {string} url 
 * @returns {string}
 */
export function getDomainFromUrl(url) {
  if (!url) return 'Unknown site';
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
