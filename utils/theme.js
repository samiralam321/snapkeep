/**
 * SnapKeep Theme Manager
 * Supports Light, Dark, and System Theme preferences.
 */

import { getSettings } from '../services/storage-service.js';

export async function initTheme() {
  try {
    const settings = await getSettings();
    applyTheme(settings.theme || 'system');

    // Listen for OS system theme changes if set to system
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
        const currentSettings = await getSettings();
        if (currentSettings.theme === 'system') {
          applyTheme('system');
        }
      });
    }
  } catch (err) {
    console.warn('Failed initializing theme:', err);
  }
}

export function applyTheme(theme) {
  const root = document.documentElement;

  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
  } else {
    // System
    const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }
}
