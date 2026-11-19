const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const mod = { exports: {} };
const source = fs.readFileSync(require.resolve('../lib/file-transfer.ts'), 'utf8');
new Function('exports', 'module', ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(mod.exports, mod);
const { createFileChunks, parseTransferChunk, restoreFile, assertCompatible, MAX_FILE_BYTES } = mod.exports;

function file(bytes, name = '测试文件.bin', type = 'application/octet-stream') {
  const blob = new Blob([bytes], { type });
  return { name, type, size: blob.size, arrayBuffer: () => blob.arrayBuffer() };
}

test('binary file with every byte value and Unicode filename survives out-of-order scans', async () => {
  const bytes = Uint8Array.from({ length: 1024 }, (_, i) => i % 256);
  const raw = await createFileChunks(file(bytes), 100);
  assert.ok(raw.length > 1);
  const restored = await restoreFile(raw.map(parseTransferChunk).reverse());
  assert.equal(restored.name, '测试文件.bin');
  assert.equal(restored.blob.type, 'application/octet-stream');
  assert.deepEqual(new Uint8Array(await restored.blob.arrayBuffer()), bytes);
});

test('empty file is a valid downloadable file', async () => {
  const restored = await restoreFile((await createFileChunks(file(''), 500)).map(parseTransferChunk));
  assert.equal(restored.blob.size, 0);
});

test('partial, duplicated, corrupted and mixed transfers cannot be restored', async () => {
  const first = (await createFileChunks(file('A'.repeat(500)), 100)).map(parseTransferChunk);
  const other = (await createFileChunks(file('B'.repeat(500)), 100)).map(parseTransferChunk);
  await assert.rejects(restoreFile(first.slice(1)), /every QR/);
  await assert.rejects(restoreFile([first[0], ...first.slice(0, -1)]), /Missing/);
  await assert.rejects(restoreFile([{ ...first[0], content: 'X' + first[0].content.slice(1) }, ...first.slice(1)]), /verification/);
  assert.throws(() => assertCompatible(first[0], other[0]), /another transfer/);
  assert.throws(() => assertCompatible(first[0], parseTransferChunk('[1/2]text')), /another transfer/);
  await assert.rejects(restoreFile([other[0], ...first.slice(1)]), /another transfer/);
});

test('legacy chunked and plain text QR codes remain supported', () => {
  assert.equal(parseTransferChunk('[2/3]你好\nworld').content, '你好\nworld');
  assert.equal(parseTransferChunk('https://example.com').total, 1);
  for (const raw of ['[0/1]bad', '[2/1]bad', '[1/99999999]bad', '[QRBF1:invalid]bad']) {
    assert.throws(() => parseTransferChunk(raw));
  }
});

test('file size and chunk bounds are enforced, maximum file round-trips', async () => {
  await assert.rejects(createFileChunks(file(new Uint8Array(MAX_FILE_BYTES + 1)), 500), /too large/);
  await assert.rejects(createFileChunks(file('a'), 2000), /chunk size/);
  const raw = await createFileChunks(file(new Uint8Array(MAX_FILE_BYTES)), 50);
  assert.ok(raw.length <= 4096);
  const restored = await restoreFile(raw.map(parseTransferChunk));
  assert.equal(restored.blob.size, MAX_FILE_BYTES);
});

test('download filename cannot include directory separators', async () => {
  const restored = await restoreFile((await createFileChunks(file('a', '../a\\b.txt'), 500)).map(parseTransferChunk));
  assert.equal(restored.name, '.._a_b.txt');
});
