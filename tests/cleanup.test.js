/**
 * Unit Tests for SnapKeep Cleanup Engine & Expiration Rules
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupMockIndexedDB } from './mock-indexeddb.js';

describe('SnapKeep Cleanup Engine Tests', () => {
  let dbService;
  const now = Date.now();

  before(async () => {
    setupMockIndexedDB();
    dbService = await import('../services/database.js');
    await dbService.clearAllScreenshots();
  });

  test('Prepare records with mixed expiration states', async () => {
    // 1. Expired Temporary screenshot (expired 2 hours ago)
    await dbService.saveScreenshot({
      id: 'expired-temp-1',
      name: 'Old_Temp.png',
      capturedAt: now - (26 * 3600 * 1000),
      expiresAt: now - (2 * 3600 * 1000),
      storageType: 'temporary',
      fileSize: 100000
    });

    // 2. Expired One-Time screenshot (expired 10 mins ago)
    await dbService.saveScreenshot({
      id: 'expired-onetime-1',
      name: 'Old_OneTime.png',
      capturedAt: now - (25 * 60 * 1000),
      expiresAt: now - (10 * 60 * 1000),
      storageType: 'one-time',
      fileSize: 50000
    });

    // 3. Active Temporary screenshot (still has 20 hours remaining)
    await dbService.saveScreenshot({
      id: 'active-temp-1',
      name: 'Active_Temp.png',
      capturedAt: now,
      expiresAt: now + (20 * 3600 * 1000),
      storageType: 'temporary',
      fileSize: 150000
    });

    // 4. Permanent screenshot (keep forever)
    await dbService.saveScreenshot({
      id: 'permanent-1',
      name: 'Receipt_Permanent.png',
      capturedAt: now - (100 * 3600 * 1000),
      expiresAt: null,
      storageType: 'permanent',
      fileSize: 300000
    });

    // 5. Permanent screenshot that had an old timestamp before conversion
    await dbService.saveScreenshot({
      id: 'permanent-2',
      name: 'Doc_Permanent.png',
      capturedAt: now - (100 * 3600 * 1000),
      expiresAt: now - (50 * 3600 * 1000), // Past timestamp, BUT storageType is permanent!
      storageType: 'permanent',
      fileSize: 400000
    });

    const stats = await dbService.getStorageStats();
    assert.equal(stats.totalCount, 5);
  });

  test('getExpiredScreenshots strictly identifies only expired temporary and one-time captures', async () => {
    const expiredList = await dbService.getExpiredScreenshots(now);
    assert.equal(expiredList.length, 2);

    const expiredIds = expiredList.map(item => item.id);
    assert.ok(expiredIds.includes('expired-temp-1'));
    assert.ok(expiredIds.includes('expired-onetime-1'));

    // Permanent screenshots must NEVER be flagged as expired
    assert.ok(!expiredIds.includes('permanent-1'));
    assert.ok(!expiredIds.includes('permanent-2'));
    assert.ok(!expiredIds.includes('active-temp-1'));
  });

  test('deleteExpiredScreenshots prunes expired records and frees exact bytes', async () => {
    const result = await dbService.deleteExpiredScreenshots(now);

    assert.equal(result.deletedCount, 2);
    assert.equal(result.bytesFreed, 100000 + 50000);
    assert.deepEqual(result.deletedIds.sort(), ['expired-onetime-1', 'expired-temp-1'].sort());

    // Verify expired records are gone from database
    const check1 = await dbService.getScreenshot('expired-temp-1');
    const check2 = await dbService.getScreenshot('expired-onetime-1');
    assert.equal(check1, null);
    assert.equal(check2, null);

    // Verify permanent and active temporary screenshots remain untouched
    const activeTemp = await dbService.getScreenshot('active-temp-1');
    const perm1 = await dbService.getScreenshot('permanent-1');
    const perm2 = await dbService.getScreenshot('permanent-2');

    assert.ok(activeTemp);
    assert.ok(perm1);
    assert.ok(perm2);
    assert.equal(perm2.storageType, 'permanent');
  });

  test('Post-cleanup storage stats reflect accurate counts and sizes', async () => {
    const stats = await dbService.getStorageStats();
    assert.equal(stats.totalCount, 3);
    assert.equal(stats.temporaryCount, 1);
    assert.equal(stats.oneTimeCount, 0);
    assert.equal(stats.permanentCount, 2);
    assert.equal(stats.totalBytes, 150000 + 300000 + 400000);
    assert.equal(stats.expiredCount, 0);
  });
});
