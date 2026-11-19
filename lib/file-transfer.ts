export const MAX_FILE_BYTES = 100 * 1024;
const MAX_CHUNKS = 4096;
export interface TransferChunk {
  index: number;
  total: number;
  content: string;
  raw: string;
  transferId?: string;
}

function encode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function decode(value: string): Uint8Array {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}
async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}

export async function createFileChunks(file: File, size: number): Promise<string[]> {
  if (file.size > MAX_FILE_BYTES) throw new Error("File is too large. Maximum size is 100 KiB.");
  if (!Number.isInteger(size) || size < 50 || size > 1000) throw new Error("Choose a chunk size between 50 and 1000.");
  const payload = encode(new TextEncoder().encode(JSON.stringify({
    name: file.name, type: file.type, size: file.size,
    data: encode(new Uint8Array(await file.arrayBuffer())),
  })));
  const id = await digest(payload);
  const total = Math.ceil(payload.length / size);
  if (total > MAX_CHUNKS) throw new Error("Too many QR codes. Increase the chunk size.");
  return Array.from({ length: total }, (_, i) => `[QRBF1:${id}:${i + 1}/${total}]${payload.slice(i * size, (i + 1) * size)}`);
}

export function parseTransferChunk(raw: string): TransferChunk {
  const file = raw.match(/^\[QRBF1:([a-f0-9]{64}):(\d+)\/(\d+)\]([A-Za-z0-9+/=]+)$/);
  if (raw.startsWith("[QRBF1:") && !file) throw new Error("Invalid file QR code.");
  const text = !file && raw.match(/^\[(\d+)\/(\d+)\]([\s\S]*)$/);
  const index = Number(file ? file[2] : text ? text[1] : 1);
  const total = Number(file ? file[3] : text ? text[2] : 1);
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(total) || index < 1 || index > total || total > MAX_CHUNKS) {
    throw new Error("Invalid QR chunk number or count.");
  }
  const content = file ? file[4] : text ? text[3] : raw;
  if (file && content.length > 1000) throw new Error("File QR chunk is too large.");
  return { index, total, content, raw, ...(file ? { transferId: file[1] } : {}) };
}

export function assertCompatible(existing: TransferChunk | undefined, incoming: TransferChunk): void {
  if (existing && (existing.transferId !== incoming.transferId || existing.total !== incoming.total)) {
    throw new Error("This QR code belongs to another transfer. Clear Results before scanning it.");
  }
}

export async function restoreFile(chunks: TransferChunk[]): Promise<{ name: string; blob: Blob }> {
  const sorted = [...chunks].sort((a, b) => a.index - b.index);
  const first = sorted[0];
  if (!first?.transferId || sorted.length !== first.total) throw new Error("Scan every QR code before downloading.");
  sorted.forEach((chunk, i) => {
    assertCompatible(first, chunk);
    if (chunk.index !== i + 1) throw new Error("Missing file chunk.");
  });
  const payload = sorted.map(c => c.content).join("");
  if (await digest(payload) !== first.transferId) throw new Error("File verification failed. Clear Results and scan again.");
  const file = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decode(payload)));
  if (typeof file.name !== "string" || !file.name || file.name.length > 1024 || typeof file.type !== "string" || typeof file.data !== "string" || !Number.isInteger(file.size) || file.size < 0 || file.size > MAX_FILE_BYTES) {
    throw new Error("Invalid file metadata.");
  }
  const bytes = decode(file.data);
  if (bytes.length !== file.size) throw new Error("File size verification failed.");
  return { name: file.name.replace(/[\\/\x00-\x1f]/g, "_"), blob: new Blob([bytes as BlobPart], { type: file.type || "application/octet-stream" }) };
}
