const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
new Function('exports', 'module', ts.transpileModule(
  fs.readFileSync(require.resolve('../lib/adaptive-transfer.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText)(mod.exports, mod);
const { AdaptiveTransfer } = mod.exports;
const missingAfter = (received, total = 100) => Array.from({length: total - received}, (_, i) => received + i + 1);
function setup(sizes = Array(100).fill(500)) {
  const controller = new AdaptiveTransfer(sizes);
  controller.setAdaptive(true, 0);
  controller.setRunning(true, 0);
  return controller;
}
function healthyWindow(c, offset, start, count = 8) {
  for (let i = 0; i < count; i++) {
    c.markShown(start + i, offset + i * 400);
    c.acknowledge(missingAfter(start + i + 1), offset + i * 400 + 300);
  }
  return c.tick(offset + 5000);
}

test('two healthy windows accelerate, one is not enough', () => {
  const c = setup();
  assert.equal(healthyWindow(c, 0, 0).interval, 500);
  assert.equal(healthyWindow(c, 5000, 8).interval, 400);
  assert.equal(healthyWindow(c, 10000, 16).interval, 400);
  assert.equal(healthyWindow(c, 15000, 24).interval, 300);
});

test('duplicates and retries never increase bytes or refresh progress timeout', () => {
  const c = setup([3, 5, 7, 9]);
  c.markShown(0, 0);
  c.acknowledge([2, 3, 4], 1000);
  c.acknowledge([2, 3, 4], 4500);
  c.markShown(0, 4900);
  assert.equal(c.tick(5000).acknowledgedBytes, 3);
  c.acknowledge([2, 3, 4], 9900);
  const result = c.tick(10000);
  assert.equal(result.acknowledgedBytes, 3);
  assert.match(result.reason, /No new acknowledgements/);
  assert.equal(result.interval, 1000);
});

test('feedback silence progressively backs off, bounded at 2000ms', () => {
  const c = setup();
  assert.equal(c.tick(5000).interval, 1000);
  assert.equal(c.tick(10000).interval, 2000);
  assert.equal(c.tick(15000).interval, 2000);
});

test('unshown codes and immature displays do not count as failures', () => {
  const c = setup();
  for (let i = 0; i < 4; i++) c.markShown(i, i * 500);
  c.acknowledge(missingAfter(4), 3000);
  for (let i = 4; i < 15; i++) c.markShown(i, 4500);
  assert.equal(c.tick(5000).interval, 500);
  assert.match(c.tick(5000).reason, /healthy/);
});

test('poor reception slows playback despite some fresh feedback', () => {
  const c = setup();
  for (let i = 0; i < 8; i++) c.markShown(i, i * 400);
  c.acknowledge(missingAfter(2), 3000);
  assert.equal(c.tick(5000).interval, 750);
});

test('falling useful throughput rolls back even when acknowledged displays look healthy', () => {
  const c = setup();
  healthyWindow(c, 0, 0);
  healthyWindow(c, 5000, 8);
  assert.equal(healthyWindow(c, 10000, 16, 4).interval, 500);
});

test('pause excludes idle time and resume gives feedback a fresh grace period', () => {
  const c = setup();
  c.acknowledge(missingAfter(2), 1000);
  c.setRunning(false, 2000);
  const before = c.tick(2000);
  assert.equal(c.tick(60000).bytesPerSecond, before.bytesPerSecond);
  assert.equal(c.tick(60000).interval, 500);
  c.setRunning(true, 60000);
  assert.equal(c.tick(61000).interval, 500);
});

test('completion freezes throughput and a new controller resets counters', () => {
  const c = setup([3, 6]);
  c.acknowledge([2], 500);
  c.acknowledge([], 1000);
  assert.deepEqual(c.tick(10000), {
    interval: 500, reason: 'All payload bytes acknowledged.', acknowledgedBytes: 9,
    bytesPerSecond: 9, complete: true,
  });
  assert.equal(setup().tick(0).acknowledgedBytes, 0);
});

test('manual mode reports throughput without changing speed', () => {
  const c = setup();
  c.setAdaptive(false, 0);
  c.acknowledge(missingAfter(1), 1000);
  assert.equal(c.tick(20000).interval, 500);
  assert.equal(c.tick(20000).bytesPerSecond, 25);
});

test('acceleration has a 200ms floor and tail replay stays at least 500ms', () => {
  const c = setup();
  for (let w = 0; w < 10; w++) healthyWindow(c, w * 5000, w * 8);
  assert.equal(c.tick(50000).interval, 200);
  c.acknowledge(missingAfter(98), 52000);
  assert.equal(c.tick(55000).interval, 500);
});

test('slow fallback can recover by accumulating enough samples across windows', () => {
  const c = setup();
  c.tick(5000);
  c.tick(10000);
  assert.equal(c.interval, 2000);
  for (let w = 0; w < 10; w++) {
    const start = 10000 + w * 5000;
    for (let i = 0; i < 2; i++) {
      const index = w * 2 + i;
      c.markShown(index, start + i * 2000);
      c.acknowledge(missingAfter(index + 1), start + i * 2000 + 500);
    }
    c.tick(start + 5000);
  }
  assert.ok(c.interval < 2000, 'must not stay permanently at slowest fallback');
});
