const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(path) {
  const mod = { exports: {} };
  new Function('exports', 'module', ts.transpileModule(fs.readFileSync(require.resolve(path), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(mod.exports, mod);
  return mod.exports;
}
const { createFeedback, parseFeedback, advancePlayback } = load('../lib/clipboard-feedback.ts');
const { parseTransferChunk, assertCompatible, restoreFile, createFileChunks } = load('../lib/file-transfer.ts');
const id = '12345678-1234-1234-1234-123456789abc';
const wrap = raw => `[QRBR1:${id}]${raw}`;

test('out-of-order reception reports missing indices and completion', () => {
  const chunks = new Map();
  for (const raw of ['[3/3]c', '[1/3]a']) {
    const chunk = parseTransferChunk(wrap(raw));
    chunks.set(chunk.index, chunk);
  }
  const raw = createFeedback(chunks);
  assert.deepEqual(parseFeedback(raw, id, 3), { id, total: 3, revision: 2, missing: [2] });
  assert.equal(parseFeedback(raw, 'another-transfer', 3), null);
  assert.equal(parseFeedback(raw, id, 4), null);
  chunks.set(2, parseTransferChunk(wrap('[2/3]b')));
  assert.deepEqual(parseFeedback(createFeedback(chunks), id, 3).missing, []);
  assert.equal(createFeedback(new Map()), null);
  assert.equal(createFeedback(new Map([[1, parseTransferChunk('[1/2]legacy')]])), null);
});

test('malformed clipboard content is ignored', () => {
  for (const value of ['ordinary clipboard text', 'QRBR-ACK1:{', ...[
    { revision: 1, missing: [2, 2] },
    { revision: 1, missing: [0, 3] },
    { revision: 1, missing: [2, 4] },
    { revision: 1, missing: ['2', 3] },
    { revision: 0, missing: [1, 2, 3] },
    { revision: 2, missing: [] },
  ].map(data => 'QRBR-ACK1:' + JSON.stringify({ id, total: 3, ...data }))]) {
    assert.equal(parseFeedback(value, id, 3), null);
  }
});

test('first round finishes before replaying only missing chunks, including one remaining', () => {
  assert.deepEqual(advancePlayback(0, [0, 1, 2], [3]), { index: 1, queue: [0, 1, 2], complete: false });
  assert.deepEqual(advancePlayback(2, [0, 1, 2], [3]), { index: 2, queue: [2], complete: false });
  assert.deepEqual(advancePlayback(2, [2], [3]), { index: 2, queue: [2], complete: false });
  assert.deepEqual(advancePlayback(2, [2], []), { index: 2, queue: [], complete: true });
  assert.deepEqual(advancePlayback(2, [0, 1, 2], null), { index: 0, queue: [0, 1, 2], complete: false });
});

test('envelopes preserve text and reject mixed transfers or invalid nesting', () => {
  const first = parseTransferChunk(wrap('[1/2]hello\n'));
  assert.equal(first.content, 'hello\n');
  assert.equal(first.transferId, undefined);
  assert.equal(first.feedbackId, id);
  assert.throws(() => assertCompatible(first, parseTransferChunk('[2/2]legacy')), /another transfer/);
  assert.throws(() => parseTransferChunk(wrap(wrap('[1/1]nested'))), /Invalid/);
});

test('feedback envelope preserves binary file verification', async () => {
  const blob = new Blob(['file contents']);
  const chunks = await createFileChunks({ name: 'test.txt', type: '', size: blob.size, arrayBuffer: () => blob.arrayBuffer() }, 50);
  const restored = await restoreFile(chunks.map(raw => parseTransferChunk(wrap(raw))));
  assert.equal(await restored.blob.text(), 'file contents');
});
