/**
 * SnapKeep Constants & Configuration Defaults
 */

export const STORAGE_TYPES = {
  TEMPORARY: 'temporary',
  ONE_TIME: 'one-time',
  PERMANENT: 'permanent'
};

export const STORAGE_TYPE_CONFIG = {
  [STORAGE_TYPES.TEMPORARY]: {
    id: STORAGE_TYPES.TEMPORARY,
    label: 'Temporary — 24 Hours',
    shortLabel: 'Temporary',
    description: 'Keep this screenshot temporarily. It will be automatically deleted after 24 hours.',
    defaultDurationMs: 24 * 60 * 60 * 1000, // 24 hours
    folder: 'SnapKeep/Temporary',
    badgeClass: 'badge-temporary'
  },
  [STORAGE_TYPES.ONE_TIME]: {
    id: STORAGE_TYPES.ONE_TIME,
    label: 'One-Time Use',
    shortLabel: 'One-Time',
    description: 'Use this screenshot now. Delete it when done, with a 15-minute safety fallback.',
    defaultDurationMs: 15 * 60 * 1000, // 15 minutes
    folder: 'SnapKeep/One-Time',
    badgeClass: 'badge-one-time'
  },
  [STORAGE_TYPES.PERMANENT]: {
    id: STORAGE_TYPES.PERMANENT,
    label: 'Permanent — Keep Forever',
    shortLabel: 'Permanent',
    description: 'Keep this screenshot until you explicitly decide to delete it.',
    defaultDurationMs: null, // Never expires
    folder: 'SnapKeep/Permanent',
    badgeClass: 'badge-permanent'
  }
};

export const DB_CONFIG = {
  NAME: 'SnapKeepDB',
  VERSION: 1,
  STORE_SCREENSHOTS: 'screenshots'
};

export const ALARMS = {
  CLEANUP_ALARM_NAME: 'snapkeep-auto-cleanup',
  CLEANUP_PERIOD_MINUTES: 5 // Run automatic cleanup check every 5 minutes
};

export const DEFAULT_SETTINGS = {
  defaultStorageType: STORAGE_TYPES.TEMPORARY,
  temporaryDurationHours: 24,
  oneTimeDurationMinutes: 15,
  defaultFormat: 'png', // 'png' | 'jpeg'
  namingPattern: 'Screenshot_{YYYY}-{MM}-{DD}_{HH}-{mm}-{ss}',
  autoCleanupEnabled: true,
  cleanupNotificationsEnabled: true,
  theme: 'system', // 'light' | 'dark' | 'system'
  lastCleanupTimestamp: 0,
  lastCleanupCount: 0,
  lastCleanupBytesFreed: 0
};

export const MESSAGE_TYPES = {
  CAPTURE_VISIBLE: 'CAPTURE_VISIBLE',
  START_SNIPPER: 'START_SNIPPER',
  SNIP_COMPLETED: 'SNIP_COMPLETED',
  CAPTURE_FULL_PAGE: 'CAPTURE_FULL_PAGE',
  CLEAN_EXPIRED_NOW: 'CLEAN_EXPIRED_NOW',
  GET_STORAGE_STATS: 'GET_STORAGE_STATS',
  OPEN_DECISION_UI: 'OPEN_DECISION_UI'
};
