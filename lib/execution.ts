export interface ExecutionConfig {
  role: 'sender' | 'receiver'; key: string; targets: string[]; port: number; token: string;
}
export interface ExecutionJob {
  jobId: string; target: string; command: string; state: string; timeoutMs: number;
  stdout?: string; stderr?: string; exitCode?: number | null; error?: string; truncated?: boolean; delivered?: boolean;
}
export interface ExecutionSnapshot {
  active: boolean; busy: boolean; config: ExecutionConfig; error: string; targets: string[]; jobs: ExecutionJob[];
  peerVerified: boolean; pairingScanned: boolean; pairingCode: string | null;
  transfer: { id: string; chunks: string[]; missing: number[] | null } | null;
  receiving: { received: number; total: number } | null;
}
export async function execution(action: string, value?: unknown): Promise<ExecutionSnapshot> {
  if (!window.qrDesktop) throw new Error('Execution requires the desktop application');
  return window.qrDesktop.execution(action, value) as Promise<ExecutionSnapshot>;
}
