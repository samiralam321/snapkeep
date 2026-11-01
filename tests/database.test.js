/**
 * Unit Tests for SnapKeep Database Service
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupMockIndexedDB } from './mock-indexeddb.js';

describe('IndexedDB Database Service Tests', () => {
  let dbService;
  const now = Date.now();

  before(async () => {
    setupMockIndexedDB();
    dbService = await import('../services/database.js');
  });

  test('Save Temporary screenshot with 24h expiration', async () => {
    const record = {
      id: 'snap-temp-1',
      name: 'Temp_Shot.png',
      capturedAt: now,
      expiresAt: now + (24 * 3600 * 1000),
      storageType: 'temporary',
      sourceUrl: 'https://example.com/page1',
      sourceTitle: 'Example Page 1',
      fileSize: 204800, // 200 KB
      width: 1920,
      height: 1080,
      format: 'png',
      status: 'active'
    };

    const saved = await dbService.saveScreenshot(record);
    assert.equal(saved.id, 'snap-temp-1');
    assert.equal(saved.storageType, 'temporary');
    assert.equal(saved.expiresAt, now + (24 * 3600 * 1000));
  });

  test('Save One-Time screenshot with 15m expiration', async () => {
    const record = {
      id: 'snap-onetime-1',
      name: 'OneTime_Shot.png',
      capturedAt: now,
      expiresAt: now + (15 * 60 * 1000),
      storageType: 'one-time',
      sourceUrl: 'https://example.com/page2',
      sourceTitle: 'Example Page 2',
      fileSize: 102400, // 100 KB
      width: 800,
      height: 600,
      format: 'png',
      status: 'active'
    };

    const saved = await dbService.saveScreenshot(record);
    assert.equal(saved.id, 'snap-onetime-1');
    assert.equal(saved.storageType, 'one-time');
    assert.equal(saved.expiresAt, now + (15 * 60 * 1000));
  });

  test('Save Permanent screenshot with null expiration', async () => {
    const record = {
      id: 'snap-perm-1',
      name: 'Permanent_Keep.png',
      capturedAt: now,
      expiresAt: null,
      storageType: 'permanent',
      sourceUrl: 'https://example.com/receipt',
      sourceTitle: 'Order Receipt',
      fileSize: 512000, // 500 KB
      width: 1440,
      height: 900,
      format: 'png',
      status: 'active'
    };

    const saved = await dbService.saveScreenshot(record);
    assert.equal(saved.id, 'snap-perm-1');
    assert.equal(saved.storageType, 'permanent');
    assert.equal(saved.expiresAt, null);
  });

  test('Retrieve screenshot by ID', async () => {
    const item = await dbService.getScreenshot('snap-temp-1');
    assert.ok(item);
    assert.equal(item.name, 'Temp_Shot.png');
    assert.equal(item.width, 1920);
  });

  test('Update screenshot metadata (rename & tier change)', async () => {
    const updated = await dbService.updateScreenshot('snap-temp-1', {
      name: 'Renamed_Temp_Shot.png',
      storageType: 'permanent',
      expiresAt: null
    });

    assert.equal(updated.name, 'Renamed_Temp_Shot.png');
    assert.equal(updated.storageType, 'permanent');
    assert.equal(updated.expiresAt, null);

    const reloaded = await dbService.getScreenshot('snap-temp-1');
    assert.equal(reloaded.name, 'Renamed_Temp_Shot.png');
    assert.equal(reloaded.storageType, 'permanent');
  });

  test('Query Storage Statistics accurately', async () => {
    const stats = await dbService.getStorageStats();
    assert.equal(stats.totalCount, 3);
    assert.equal(stats.permanentCount, 2); // 'snap-perm-1' + 'snap-temp-1' (which was moved to perm)
    assert.equal(stats.oneTimeCount, 1);
    assert.equal(stats.temporaryCount, 0);
    assert.equal(stats.totalBytes, 204800 + 102400 + 512000);
  });

  test('Delete screenshot removes record from store', async () => {
    const delResult = await dbService.deleteScreenshot('snap-onetime-1');
    assert.equal(delResult, true);

    const check = await dbService.getScreenshot('snap-onetime-1');
    assert.equal(check, null);
  });
});
