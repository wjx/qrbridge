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
