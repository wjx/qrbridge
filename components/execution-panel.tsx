"use client";

import { useEffect, useRef, useState } from 'react';
import { execution, type ExecutionConfig, type ExecutionSnapshot } from '@/lib/execution';
import { useScreenQRScanner, type ScanRegion } from '@/hooks/use-screen-qr-scanner';
import { ScreenScanPreview } from '@/components/screen-scan-preview';
import { MaskedQRCode } from '@/components/masked-qr-code';
import { AdaptiveTransfer } from '@/lib/adaptive-transfer';
import { QRMaskRetry } from '@/lib/qr-mask-retry';
import { advancePlayback } from '@/lib/clipboard-feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

function ResultPlayer({ transfer }: { transfer: NonNullable<ExecutionSnapshot['transfer']> }) {
  const latest = useRef(transfer); latest.current = transfer;
  const [display, setDisplay] = useState({ index: 0, variant: 0, interval: 500 });
  const [size, setSize] = useState(512);
  const player = useRef<HTMLDivElement>(null);
  const [fullscreenError, setFullscreenError] = useState('');
  useEffect(() => {
    const controller = new AdaptiveTransfer(transfer.chunks.map(c => new TextEncoder().encode(c).length));
    const masks = new QRMaskRetry();
    controller.setAdaptive(true, performance.now()); controller.setRunning(true, performance.now());
    let index = 0, queue = transfer.chunks.map((_, i) => i), timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const now = performance.now();
      if (latest.current.missing) controller.acknowledge(latest.current.missing, now);
      const stats = controller.tick(now);
      if (stats.complete) return;
      controller.markShown(index, now);
      const variant = masks.start(index, now, stats.interval, latest.current.missing);
      setDisplay({ index, variant, interval: stats.interval });
      timer = setTimeout(() => {
        const next = advancePlayback(index, queue, latest.current.missing);
        index = next.index; queue = next.queue;
        if (!next.complete) tick();
      }, stats.interval);
    };
    tick();
    return () => clearTimeout(timer);
  }, [transfer.id]); // Each transfer owns its playback controller.
  return <div ref={player} className="space-y-3 overflow-auto rounded-xl border bg-background p-4 text-center text-foreground">
    <Button variant="outline" size="sm" onClick={() => {
      const action = document.fullscreenElement ? document.exitFullscreen() : player.current?.requestFullscreen();
      void action?.catch(() => setFullscreenError('无法进入全屏，请滚动页面以显示完整二维码。'));
    }}>切换全屏</Button>
    {fullscreenError && <p role="alert">{fullscreenError}</p>}
    <p>结果二维码 {display.index + 1} / {transfer.chunks.length} · {display.interval}ms / 张</p>
    <label className="flex justify-center gap-3">尺寸<input aria-label="执行结果二维码尺寸" type="range" min={256} max={768} step={32} value={size} onChange={e => setSize(Number(e.target.value))} /></label>
    <div className="flex justify-center overflow-auto"><MaskedQRCode value={transfer.chunks[display.index]} size={size} variant={display.variant} label="执行状态或结果二维码" /></div>
    <p className="text-sm text-muted-foreground">自动播放、缺片补播及调速已开启。接收端确认后自动展示下一份结果。</p>
  </div>;
}

export function ExecutionPanel({ onActiveChange }: { onActiveChange: (active: boolean) => void }) {
  const [snapshot, setSnapshot] = useState<ExecutionSnapshot | null>(null);
  const [config, setConfig] = useState<ExecutionConfig | null>(null);
  const [targetsText, setTargetsText] = useState('');
  const [error, setError] = useState('');
  const [changing, setChanging] = useState(false);
  const [command, setCommand] = useState('hostname');
  const [target, setTarget] = useState('');
  const [region, setRegion] = useState<ScanRegion | null>(null);
  const [selecting, setSelecting] = useState(false);
  const initialized = useRef(false);
  const scanPending = useRef(false);
  const lastScan = useRef('');
  const scanner = useScreenQRScanner({ desktop: true, region, paused: selecting, onDecode: raw => {
    if (!raw.startsWith('[QREX1:') || scanPending.current || lastScan.current === raw) return;
    scanPending.current = true;
    void execution('scan', raw).then(() => { lastScan.current = raw; }).catch(e => setError(e.message)).finally(() => { scanPending.current = false; });
  } });
  useEffect(() => {
    let cancelled = false, pending = false;
    const poll = async () => {
      if (pending) return;
      pending = true;
      try {
        const value = await execution('snapshot');
        if (!cancelled) {
          setSnapshot(value); onActiveChange(value.active);
          if (!initialized.current) {
            initialized.current = true; setConfig(value.config); setTargetsText(value.config.targets.join('\n'));
          }
        }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); }
      finally { pending = false; }
    };
    void poll(); const timer = setInterval(poll, 500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [onActiveChange]);
  const active = snapshot?.active ?? false;
  const receiver = config?.role === 'receiver';
  const changeMode = async () => {
    if (!config) return;
    setChanging(true); setError(''); onActiveChange(true);
    try {
      if (active) {
        const result = await execution('stop');
        scanner.stopScreenScanning(); lastScan.current = ''; setSnapshot(result); onActiveChange(false);
      } else {
        await execution('configure', { ...config, targets: targetsText.split(/[\s,]+/).filter(Boolean) });
        const result = await execution('start'); setSnapshot(result); onActiveChange(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      const result = await execution('snapshot'); setSnapshot(result); onActiveChange(result.active);
    } finally { setChanging(false); }
  };
  if (!config || !snapshot) return <p role="status">{error || '正在读取执行配置…'}</p>;
  return <section className="space-y-5">
    <div className="space-y-4 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">执行模式 · SSH</h2>
      <p className="text-sm text-muted-foreground">接收端通过剪贴板下发命令，发送端通过二维码回传结果。一次执行一个非交互命令。</p>
      <details open={!active}><summary className="cursor-pointer font-medium">连接设置</summary>
      <fieldset disabled={active || changing} className="space-y-3 disabled:opacity-70">
        <label className="block space-y-1"><span>本机角色</span><select className="block w-full rounded border bg-background p-2" value={config.role} onChange={e => setConfig({ ...config, role: e.target.value as ExecutionConfig['role'] })}><option value="receiver">接收端：MCP 网关与扫码</option><option value="sender">发送端：SSH 执行与结果展示</option></select></label>
        <label className="block space-y-1"><span>配对密钥（两端填写同一份 64 位十六进制值）</span><Input aria-label="配对密钥" type="password" value={config.key} onChange={e => setConfig({ ...config, key: e.target.value.trim() })} /></label>
        <details><summary className="cursor-pointer text-sm">显示本机配对密钥</summary><code className="block break-all py-2 select-all">{config.key}</code></details>
        {receiver ? <label className="block space-y-1"><span>本机 MCP 端口</span><Input aria-label="MCP 端口" type="number" min={1024} max={65535} value={config.port} onChange={e => setConfig({ ...config, port: Number(e.target.value) })} /></label> : <label className="block space-y-1"><span>允许执行的 SSH Host 别名（每行一个）</span><Textarea aria-label="SSH 目标" placeholder="dev-server" value={targetsText} onChange={e => setTargetsText(e.target.value)} /><span className="text-sm text-muted-foreground">使用发送端 ~/.ssh/config；需预先配置密钥登录及 known_hosts。别名只使用字母、数字、下划线和连字符。</span></label>}
      </fieldset>
      </details>
      <Button disabled={changing} onClick={() => void changeMode()}>{changing ? '正在切换…' : active ? '退出执行模式' : '启用执行模式'}</Button>
      <p role="status" className="text-sm">{active ? receiver ? 'MCP 已启动，等待扫码接收发送端信息。' : '已启用 SSH 执行，正在监听剪贴板。' : '尚未启用，命令不会执行。'}</p>
      {(error || snapshot.error) && <p role="alert" className="whitespace-pre-wrap text-destructive">{error || snapshot.error}</p>}
    </div>
    {active && receiver && <>
      <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">MCP 客户端连接配置</summary><p className="mt-3 text-sm">使用 Streamable HTTP，地址和认证头如下。令牌仅供本机客户端使用。</p><pre className="mt-3 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify({ url: `http://127.0.0.1:${config.port}/mcp`, headers: { Authorization: `Bearer ${config.token}` } }, null, 2)}</pre></details>
      <div className="space-y-3 rounded-xl border p-4">
        <h3 className="font-medium">持续扫描发送端二维码</h3>
        <Button disabled={scanner.isScreenStarting} onClick={() => {
          if (scanner.isScreenScanning) scanner.stopScreenScanning();
          else { setRegion(null); setSelecting(true); lastScan.current = ''; void scanner.startScreenScanning(); }
        }}>{scanner.isScreenScanning ? '停止扫描' : '选择屏幕 / 窗口'}</Button>
        {scanner.screenError && <p role="alert" className="text-destructive">{scanner.screenError}</p>}
        <div className={scanner.isScreenScanning ? '' : 'hidden'}><ScreenScanPreview videoRef={scanner.videoRef} selecting={selecting} region={region} onSelect={r => { setRegion(r); setSelecting(false); }} onReselect={() => setSelecting(true)} /></div>
        <p className="text-sm">{snapshot.receiving ? `当前消息：${snapshot.receiving.received} / ${snapshot.receiving.total} 片` : '请先扫描发送端握手二维码，获取可用目标。'}</p>
      </div>
      <form className="space-y-3 rounded-xl border p-4" onSubmit={e => {
        e.preventDefault(); setError('');
        void execution('submit', { target: target || snapshot.targets[0], command }).catch(e => setError(e.message));
      }}>
        <h3 className="font-medium">手动执行（也可通过 MCP 提交）</h3>
        <select aria-label="执行目标" className="w-full rounded border bg-background p-2" value={target || snapshot.targets[0] || ''} onChange={e => setTarget(e.target.value)}>{!snapshot.targets.length && <option value="">等待发送端握手</option>}{snapshot.targets.map(t => <option key={t}>{t}</option>)}</select>
        <Textarea aria-label="远端命令" value={command} onChange={e => setCommand(e.target.value)} />
        <Button disabled={snapshot.busy || !snapshot.targets.length || !command.trim()}>提交命令</Button>
      </form>
    </>}
    {active && !receiver && (snapshot.transfer ? <ResultPlayer key={snapshot.transfer.id} transfer={snapshot.transfer} /> : <p className="rounded-xl border p-5">等待下一条命令。收到任务后将自动展示状态和结果二维码。</p>)}
    {snapshot.jobs.length > 0 && <div className="space-y-3"><h3 className="font-medium">任务记录</h3>{snapshot.jobs.map(job => <article key={job.jobId} className="space-y-2 rounded-xl border p-4">
      <p className="font-medium">{job.target} · {job.state}{job.exitCode !== undefined && ` · exit ${job.exitCode ?? '未知'}`}</p>
      <p className="break-all text-xs text-muted-foreground">{job.jobId}{job.delivered === false && ' · 等待结果确认'}</p>
      <pre className="overflow-auto whitespace-pre-wrap text-sm">{job.command}</pre>
      {job.error && <p className="text-destructive">{job.error}</p>}
      {job.stdout && <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-sm">{job.stdout}</pre>}
      {job.stderr && <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-sm">stderr: {job.stderr}</pre>}
      {job.truncated && <p className="text-sm">输出已截断：stdout 与 stderr 合计最多保留 32 KiB。</p>}
    </article>)}</div>}
  </section>;
}
