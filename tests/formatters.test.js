/**
 * Unit Tests for SnapKeep Formatters and Helpers
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { formatBytes, formatDate, formatRelativeTime, formatCountdown, getDomainFromUrl } from '../utils/formatters.js';
import { generateId, generateScreenshotName } from '../utils/helpers.js';

describe('Formatters Tests', () => {
  test('formatBytes handles zero, negative, and null values', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(null), '0 B');
    assert.equal(formatBytes(-10), '0 B');
    assert.equal(formatBytes(undefined), '0 B');
  });

  test('formatBytes formats KB, MB, and GB accurately', () => {
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(1024), '1 KB');
    assert.equal(formatBytes(1536), '1.5 KB');
    assert.equal(formatBytes(1048576), '1 MB');
    assert.equal(formatBytes(2500000), '2.4 MB');
    assert.equal(formatBytes(1073741824), '1 GB');
  });

  test('formatCountdown handles permanent (null) expiration', () => {
    const result = formatCountdown(null);
    assert.equal(result.isExpired, false);
    assert.equal(result.isUrgent, false);
    assert.match(result.text, /Permanent/);
  });

  test('formatCountdown handles active future expiration', () => {
    const now = Date.now();
    const future24h = now + (24 * 3600 * 1000);
    const result = formatCountdown(future24h, now);
    assert.equal(result.isExpired, false);
    assert.equal(result.isUrgent, false);
    assert.match(result.text, /Expires in 2[34]h/);
    assert.ok(result.percentLeft > 95);
  });

  test('formatCountdown marks urgent under 5 minutes', () => {
    const now = Date.now();
    const future3m = now + (3 * 60 * 1000);
    const result = formatCountdown(future3m, now);
    assert.equal(result.isExpired, false);
    assert.equal(result.isUrgent, true);
    assert.match(result.text, /Expires in [23]m/);
  });

  test('formatCountdown marks expired in past', () => {
    const now = Date.now();
    const past = now - 5000;
    const result = formatCountdown(past, now - 100000);
    assert.equal(result.isExpired, true);
    assert.equal(result.isUrgent, true);
    assert.match(result.text, /Expired/);
  });

  test('getDomainFromUrl extracts clean hostname', () => {
    assert.equal(getDomainFromUrl('https://www.google.com/search?q=test'), 'google.com');
    assert.equal(getDomainFromUrl('https://github.com/microsoft/vscode'), 'github.com');
    assert.equal(getDomainFromUrl('http://sub.domain.org/path'), 'sub.domain.org');
    assert.equal(getDomainFromUrl(''), 'Unknown site');
  });

  test('generateScreenshotName replaces tokens properly', () => {
    const fixedDate = new Date(2026, 10, 1, 14, 30, 22); // Nov 1, 2026, 14:30:22
    const pattern = 'Screenshot_{YYYY}-{MM}-{DD}_{HH}-{mm}-{ss}';
    const namePng = generateScreenshotName(pattern, 'png', fixedDate);
    assert.equal(namePng, 'Screenshot_2026-11-01_14-30-22.png');

    const nameJpeg = generateScreenshotName(pattern, 'jpeg', fixedDate);
    assert.equal(nameJpeg, 'Screenshot_2026-11-01_14-30-22.jpg');
  });

  test('generateId produces unique non-empty identifiers', () => {
    const id1 = generateId();
    const id2 = generateId();
    assert.ok(id1);
    assert.ok(id2);
    assert.notEqual(id1, id2);
  });
});
