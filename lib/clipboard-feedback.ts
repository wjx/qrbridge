import type { TransferChunk } from "./file-transfer";

const PREFIX = "QRBR-ACK1:";
export interface Feedback {
  id: string;
  total: number;
  revision: number;
  missing: number[];
}

export function createFeedback(chunks: Map<number, TransferChunk>): string | null {
  const first = chunks.values().next().value;
  if (!first?.feedbackId) return null;
  const missing = Array.from({ length: first.total }, (_, i) => i + 1).filter(i => !chunks.has(i));
  return PREFIX + JSON.stringify({
    id: first.feedbackId, total: first.total, revision: chunks.size, missing,
  });
}

export function parseFeedback(text: string, id: string, total: number): Feedback | null {
  if (!text.startsWith(PREFIX) || text.length > 100000) return null;
  try {
    const value = JSON.parse(text.slice(PREFIX.length));
    if (value.id !== id || value.total !== total || !Array.isArray(value.missing) ||
      !Number.isInteger(value.revision) || value.revision < 1 || value.revision > total ||
      value.missing.length !== total - value.revision ||
      value.missing.some((n: unknown) => !Number.isInteger(n) || Number(n) < 1 || Number(n) > total) ||
      new Set(value.missing).size !== value.missing.length) return null;
    return { ...value, missing: [...value.missing].sort((a: number, b: number) => a - b) };
  } catch { return null; }
}

/** Keep this round intact; apply the latest feedback only at the boundary. */
export function advancePlayback(index: number, queue: number[], missing: number[] | null) {
  const position = queue.indexOf(index);
  if (position >= 0 && position < queue.length - 1) return { index: queue[position + 1], queue, complete: false };
  const next = missing === null ? queue : missing.map(n => n - 1);
  return { index: next[0] ?? index, queue: next, complete: next.length === 0 };
}

export async function readClipboard(): Promise<string> {
  return window.qrDesktop ? window.qrDesktop.readClipboard() : navigator.clipboard.readText();
}
export async function writeClipboard(text: string): Promise<void> {
  if (window.qrDesktop) await window.qrDesktop.writeClipboard(text);
  else await navigator.clipboard.writeText(text);
}
