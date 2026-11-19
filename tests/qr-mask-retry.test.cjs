const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const jsQR = require('jsqr');
function load(path) {
  const mod = { exports: {} };
  new Function('exports', 'module', 'require', ts.transpileModule(fs.readFileSync(require.resolve(path), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText)(mod.exports, mod, require);
  return mod.exports;
}
const { QRMaskRetry } = load('../lib/qr-mask-retry.ts');
const { createQRBase, createQRVariant, qrSVGGeometry } = load('../lib/qr-symbol.ts');

function decode(symbol) {
  const scale = 5;
  const { size, data } = symbol.modules;
  const width = (size + 8) * scale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!data[y * size + x]) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const offset = (((y + 4) * scale + dy) * width + (x + 4) * scale + dx) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
    }
  }
  return jsQR(pixels, width, width)?.data;
}

for (const payload of [
  '[QRBR1:12345678-1234-1234-1234-123456789abc][2/4]' + 'ASCII test\n'.repeat(40),
  '[QRBR1:12345678-1234-1234-1234-123456789abc][1/3]' + '中文🙂\n'.repeat(35),
  '[QRBF1:' + 'a'.repeat(64) + ':2/3]' + Buffer.from('binary payload\0'.repeat(25)).toString('base64'),
]) test('all eight masks decode to identical payload with fixed grid and margin: ' + payload.slice(-18), () => {
  const base = createQRBase(payload);
  const patterns = new Set();
  const masks = new Set();
  for (let variant = 0; variant < 8; variant++) {
    const symbol = createQRVariant(payload, base, variant);
    assert.equal(symbol.version, base.version);
    assert.equal(symbol.modules.size, base.modules.size);
    assert.equal(symbol.errorCorrectionLevel.bit, base.errorCorrectionLevel.bit);
    assert.equal(qrSVGGeometry(symbol).size, base.modules.size + 8);
    assert.equal(decode(symbol), payload);
    patterns.add(qrSVGGeometry(symbol).path);
    masks.add(symbol.maskPattern);
  }
  assert.equal(patterns.size, 8);
  assert.equal(masks.size, 8);
});

test('unshown, acknowledged, and no-feedback chunks never rotate', () => {
  const retry = new QRMaskRetry();
  assert.equal(retry.start(0, 0, 500, [1, 2, 3]), 0);
  assert.equal(retry.start(1, 500, 500, [1, 2, 3]), 0);
  assert.equal(retry.start(2, 1000, 500, [1, 2, 3]), 0);
  for (let t = 1500; t <= 6000; t += 500) assert.equal(retry.start(2, t, 500, null), 0);
  assert.equal(retry.start(2, 6500, 500, [1, 2]), 0);
});

test('one remaining chunk rotates without requiring an index change, with a cooldown', () => {
  const retry = new QRMaskRetry();
  for (let t = 0; t < 2000; t += 250) assert.equal(retry.start(0, t, 250, [1]), 0);
  assert.equal(retry.start(0, 2000, 250, [1]), 1);
  for (let t = 2250; t < 4000; t += 250) assert.equal(retry.start(0, t, 250, [1]), 1);
  assert.equal(retry.start(0, 4000, 250, [1]), 2);
});

test('pause and speed changes do not count interrupted exposure as failure', () => {
  const retry = new QRMaskRetry();
  for (let i = 0; i < 10; i++) {
    retry.start(0, i * 3000, 2000, [1]);
    retry.pause();
  }
  assert.equal(retry.start(0, 30000, 500, [1]), 0);
});

test('two full slow displays suffice; cycling returns to initial pattern and new transfer resets', () => {
  const retry = new QRMaskRetry();
  assert.equal(retry.start(0, 0, 2000, [1]), 0);
  assert.equal(retry.start(0, 2000, 2000, [1]), 0);
  assert.equal(retry.start(0, 4000, 2000, [1]), 1);
  for (let t = 6000; t <= 32000; t += 2000) retry.start(0, t, 2000, [1]);
  assert.equal(retry.variant(0), 0);
  assert.equal(new QRMaskRetry().variant(0), 0);
});
