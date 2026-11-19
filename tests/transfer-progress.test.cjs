const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
new Function('exports', 'module', ts.transpileModule(
  fs.readFileSync(require.resolve('../lib/transfer-progress.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText)(mod.exports, mod);
const { TransferProgress, formatRemainingTime } = mod.exports;

test('waits for a timed sample, counts unique arrivals and updates ETA during stalls', () => {
  const progress = new TransferProgress();
  assert.deepEqual(progress.update(1, 10, true, 0), { speed: null, remainingSeconds: null });
  assert.deepEqual(progress.update(3, 10, true, 1000), { speed: 2, remainingSeconds: 4 });
  // Duplicate scans leave the received count unchanged; waiting reduces average throughput.
  assert.deepEqual(progress.update(3, 10, true, 2000), { speed: 1, remainingSeconds: 7 });
});

test('excludes paused time and freezes the final speed after completion', () => {
  const progress = new TransferProgress();
  progress.update(1, 5, true, 0);
  progress.update(2, 5, false, 1000);
  progress.update(2, 5, false, 5000);
  progress.update(2, 5, true, 10000);
  assert.deepEqual(progress.update(3, 5, true, 11000), { speed: 1, remainingSeconds: 2 });
  assert.deepEqual(progress.update(5, 5, true, 12000), { speed: 4 / 3, remainingSeconds: 0 });
  assert.deepEqual(progress.update(5, 5, false, 20000), { speed: 4 / 3, remainingSeconds: 0 });
});

test('clear starts fresh and existing chunks on remount are not counted as new arrivals', () => {
  const progress = new TransferProgress();
  progress.update(5, 10, true, 1000);
  assert.deepEqual(progress.update(6, 10, true, 2000), { speed: 1, remainingSeconds: 4 });
  progress.update(0, 10, true, 3000);
  assert.equal(progress.update(1, 10, true, 5000).speed, null);
  assert.equal(progress.update(2, 10, true, 6000).speed, 1);
});

test('instant completion avoids invalid rates and remaining times use readable units', () => {
  const progress = new TransferProgress();
  assert.deepEqual(progress.update(1, 1, false, 0), { speed: null, remainingSeconds: 0 });
  assert.equal(formatRemainingTime(0), '0s');
  assert.equal(formatRemainingTime(59.1), '1m 0s');
  assert.equal(formatRemainingTime(125), '2m 5s');
  assert.equal(formatRemainingTime(3661), '1h 1m');
});

test('completion duration includes pauses, freezes, and resets for the next transfer', () => {
  const progress = new TransferProgress();
  assert.equal(progress.durationSeconds, null);
  progress.update(1, 4, true, 1000);
  progress.update(2, 4, false, 2000);
  progress.update(2, 4, true, 6000);
  progress.update(4, 4, true, 7000);
  assert.equal(progress.durationSeconds, 6);
  assert.equal(progress.update(4, 4, false, 12000).speed, 1.5);
  assert.equal(progress.durationSeconds, 6);
  progress.update(0, 0, false, 13000);
  assert.equal(progress.durationSeconds, null);
  progress.update(1, 2, true, 14000);
  progress.update(2, 2, true, 14250);
  assert.equal(progress.durationSeconds, 0.25);
});

test('preserved tracker excludes time away from Scan from effective speed', () => {
  const progress = new TransferProgress();
  progress.update(1, 3, true, 0);
  progress.update(2, 3, true, 500);
  progress.pause(1000);
  progress.update(2, 3, true, 5000);
  assert.equal(progress.update(3, 3, true, 5500).speed, 2 / 1.5);
  assert.equal(progress.durationSeconds, 5.5);
});


test('unmount cleanup after clear does not restore old transfer statistics', () => {
  const progress = new TransferProgress();
  progress.update(1, 3, true, 0);
  progress.update(0, 0, false, 1000);
  progress.pause(1001);
  assert.equal(progress.durationSeconds, null);
  assert.equal(progress.update(1, 3, true, 2000).speed, null);
  assert.equal(progress.durationSeconds, 0);
});

test('live bytes count UTF-8 payload once and expire after three seconds', () => {
  const progress = new TransferProgress();
  progress.setDataActive(true, 0);
  progress.recordPayload(2, '中文', 500); // 6 UTF-8 bytes, out of order
  progress.recordPayload(1, 'abc', 1000);
  progress.recordPayload(2, '中文', 1500); // duplicate must not refresh the sample
  assert.deepEqual(progress.dataRates(1500), { receivedBytes: 9, realtime: 3, average: 6 });
  assert.equal(progress.dataRates(3500).realtime, 1);
  assert.equal(progress.dataRates(4000).realtime, 0);
});

test('byte averages exclude pauses and completion freezes the final average', () => {
  const progress = new TransferProgress();
  progress.setDataActive(true, 0);
  progress.recordPayload(1, 'a'.repeat(1000), 1000);
  progress.setDataActive(false, 2000);
  assert.deepEqual(progress.dataRates(9000), { receivedBytes: 1000, realtime: 0, average: 500 });
  progress.setDataActive(true, 10000);
  assert.equal(progress.dataRates(10000).realtime, 0);
  progress.recordPayload(2, 'b'.repeat(2000), 11000);
  progress.setDataActive(false, 11000);
  assert.deepEqual(progress.dataRates(50000), { receivedBytes: 3000, realtime: 0, average: 1000 });
});

test('clear resets samples and byte counts; a single instant chunk avoids infinity', () => {
  const progress = new TransferProgress();
  progress.setDataActive(true, 0);
  progress.recordPayload(1, 'abc', 1000);
  progress.update(0, 0, false, 2000);
  assert.deepEqual(progress.dataRates(3000), { receivedBytes: 0, realtime: 0, average: null });
  progress.recordPayload(1, 'new', 3000);
  progress.setDataActive(false, 3000);
  assert.deepEqual(progress.dataRates(4000), { receivedBytes: 3, realtime: 0, average: null });
});

test('data rates switch between bytes and binary kilobytes', () => {
  assert.equal(mod.exports.formatDataRate(0), '0 B/s');
  assert.equal(mod.exports.formatDataRate(600), '600 B/s');
  assert.equal(mod.exports.formatDataRate(1024), '1.00 KiB/s');
  assert.equal(mod.exports.formatDataRate(2560), '2.50 KiB/s');
});
