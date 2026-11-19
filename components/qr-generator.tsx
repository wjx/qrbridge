"use client";

import { useEffect, useState, useRef } from "react";
import { AdaptiveTransfer } from "@/lib/adaptive-transfer";
import { createFileChunks, parseTransferChunk } from "@/lib/file-transfer";
import { advancePlayback, parseFeedback, readClipboard, type Feedback } from "@/lib/clipboard-feedback";
import { MaskedQRCode } from "@/components/masked-qr-code";
import { QRMaskRetry } from "@/lib/qr-mask-retry";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Maximize,
  Minimize,
  Download,
  Copy,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from "lucide-react";

interface QRGeneratorProps {
  onGeneratedData?: (chunks: string[]) => void;
}

export function QRGenerator({ onGeneratedData }: QRGeneratorProps) {
  const [inputMode, setInputMode] = useState<"text" | "file">("text");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [chunkSize, setChunkSize] = useState(500);
  const [qrCodes, setQrCodes] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(2000);
  const [qrSize, setQrSize] = useState(640);
  const [fullscreenSize, setFullscreenSize] = useState(1536);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const playerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [availableSize, setAvailableSize] = useState(640);
  const requestedSize = isFullscreen ? fullscreenSize : qrSize;
  const displaySize = Math.max(1, Math.min(requestedSize, availableSize));
  const hasCodes = qrCodes.length > 0;

  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement === playerRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      setAvailableSize(Math.floor(isFullscreen
        ? Math.min(entry.contentRect.width, entry.contentRect.height)
        : entry.contentRect.width));
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [hasCodes, isFullscreen]);

  const toggleFullscreen = async () => {
    setFullscreenError("");
    try {
      if (document.fullscreenElement === playerRef.current) await document.exitFullscreen();
      else if (playerRef.current?.requestFullscreen) await playerRef.current.requestFullscreen();
      else setFullscreenError("Fullscreen is unavailable in this browser.");
    } catch {
      setFullscreenError("Unable to enter fullscreen. Try enlarging the app window instead.");
    }
  };

  const maskRetryRef = useRef(new QRMaskRetry());
  const [, setMaskRevision] = useState(0);
  const qrRefs = useRef<(SVGSVGElement | null)[]>([]);

  const [adaptiveEnabled, setAdaptiveEnabled] = useState(false);
  const controllerRef = useRef(new AdaptiveTransfer([]));
  const [adaptiveStats, setAdaptiveStats] = useState(() => controllerRef.current.tick(0));
  const [feedbackEnabled, setFeedbackEnabled] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [feedbackInput, setFeedbackInput] = useState("");
  const transferId = useRef("");
  const feedbackRef = useRef<Feedback | null>(null);
  const queueRef = useRef<number[]>([]);
  const indexRef = useRef(currentIndex);
  indexRef.current = currentIndex;

  const applyFeedback = (raw: string) => {
    const feedback = parseFeedback(raw, transferId.current, qrCodes.length);
    if (!feedback || feedback.revision < (feedbackRef.current?.revision ?? 0)) return false;
    const previous = feedbackRef.current;
    // A cumulative ACK must never retract already received chunks.
    if (previous && feedback.missing.some(index => !previous.missing.includes(index))) return false;
    feedbackRef.current = feedback;
    controllerRef.current.acknowledge(feedback.missing, performance.now());
    setAdaptiveStats(controllerRef.current.tick(performance.now()));
    setFeedbackStatus(feedback.missing.length
      ? `Receiver needs ${feedback.missing.length} codes. Applied next round.`
      : "Receiver has collected every code.");
    if (!feedback.missing.length) setIsAutoPlaying(false);
    return true;
  };

  useEffect(() => {
    if (!feedbackEnabled || !qrCodes.length) return;
    let cancelled = false;
    let pending = false;
    const poll = async () => {
      if (pending) return;
      pending = true;
      try {
        const raw = await readClipboard();
        if (!cancelled) applyFeedback(raw);
      } catch {
        if (!cancelled) setFeedbackStatus("Clipboard unavailable. Allow clipboard access or paste the feedback below.");
      } finally { pending = false; }
    };
    void poll();
    const timer = window.setInterval(poll, 500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [feedbackEnabled, qrCodes]);

  useEffect(() => {
    controllerRef.current.setRunning(isAutoPlaying, performance.now());
    setAdaptiveStats(controllerRef.current.tick(performance.now()));
    return () => controllerRef.current.setRunning(false, performance.now());
  }, [isAutoPlaying, qrCodes]);

  useEffect(() => {
    if (isAutoPlaying) controllerRef.current.markShown(currentIndex, performance.now());
  }, [isAutoPlaying, currentIndex, qrCodes]);

  useEffect(() => {
    if (!isAutoPlaying) return;
    const timer = window.setInterval(() => {
      // Also observes a stationary final missing code on repeated playback.
      controllerRef.current.markShown(indexRef.current, performance.now());
      setAdaptiveStats(controllerRef.current.tick(performance.now()));
    }, 250);
    return () => window.clearInterval(timer);
  }, [isAutoPlaying]);

  const effectivePlaybackSpeed = adaptiveEnabled ? adaptiveStats.interval : playbackSpeed;

  useEffect(() => {
    if (!isAutoPlaying || !qrCodes.length) return;
    const display = (index: number) => {
      maskRetryRef.current.start(index, performance.now(), effectivePlaybackSpeed,
        feedbackEnabled ? feedbackRef.current?.missing ?? null : null);
      setMaskRevision(revision => revision + 1);
    };
    display(indexRef.current);
    const intervalId = window.setInterval(() => {
      const next = advancePlayback(indexRef.current, queueRef.current,
        feedbackEnabled ? feedbackRef.current?.missing ?? null : null);
      if (!next.complete) display(next.index);
      queueRef.current = next.queue;
      indexRef.current = next.index;
      setCurrentIndex(next.index);
      if (next.complete) setIsAutoPlaying(false);
    }, effectivePlaybackSpeed);
    return () => { window.clearInterval(intervalId); maskRetryRef.current.pause(); };
  }, [isAutoPlaying, effectivePlaybackSpeed, qrCodes, feedbackEnabled]);

  const splitText = (text: string, size: number): string[] => {
    const chunks: string[] = [];
    const totalChunks = Math.ceil(text.length / size);
    
    for (let i = 0; i < text.length; i += size) {
      const chunkIndex = Math.floor(i / size) + 1;
      const chunkData = text.slice(i, i + size);
      // Format: [chunk_index/total_chunks]content
      chunks.push(`[${chunkIndex}/${totalChunks}]${chunkData}`);
    }
    return chunks;
  };

  const generateQRCodes = async () => {
    setBusy(true);
    setError("");
    try {
      const sourceChunks = inputMode === "file"
        ? file ? await createFileChunks(file, Math.min(chunkSize, 1000)) : []
        : text.trim() ? splitText(text, chunkSize) : [];
      transferId.current = crypto.randomUUID();
      const chunks = sourceChunks.map(chunk => `[QRBR1:${transferId.current}]${chunk}`);
      controllerRef.current = new AdaptiveTransfer(sourceChunks.map(chunk => new TextEncoder().encode(parseTransferChunk(chunk).content).length));
      controllerRef.current.setAdaptive(adaptiveEnabled, performance.now());
      setAdaptiveStats(controllerRef.current.tick(performance.now()));
      maskRetryRef.current = new QRMaskRetry();
      feedbackRef.current = null;
      queueRef.current = chunks.map((_, i) => i);
      setFeedbackStatus("");
      setFeedbackInput("");
      setIsAutoPlaying(false);
      setQrCodes(chunks);
      setCurrentIndex(0);
      onGeneratedData?.(chunks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to read file.");
    } finally {
      setBusy(false);
    }
  };

  const clearAll = () => {
    maskRetryRef.current = new QRMaskRetry();
    controllerRef.current = new AdaptiveTransfer([]);
    setAdaptiveStats(controllerRef.current.tick(performance.now()));
    feedbackRef.current = null;
    setFeedbackStatus("");
    setIsAutoPlaying(false);
    setText("");
    setFile(null);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setQrCodes([]);
    setCurrentIndex(0);
  };

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev < qrCodes.length - 1 ? prev + 1 : prev));
  };

  const downloadQR = (index: number) => {
    const svg = qrRefs.current[index];
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = `qrcode-${index + 1}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const downloadAllQRs = () => {
    qrCodes.forEach((_, index) => {
      setTimeout(() => downloadQR(index), index * 200);
    });
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Input Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2" aria-label="Input type">
            <Button variant={inputMode === "text" ? "default" : "outline"} disabled={busy} onClick={() => { clearAll(); setInputMode("text"); }}>Text</Button>
            <Button variant={inputMode === "file" ? "default" : "outline"} disabled={busy} onClick={() => { clearAll(); setChunkSize(size => Math.min(size, 1000)); setInputMode("file"); }}>File</Button>
          </div>
          {inputMode === "file" ? <div className="space-y-2">
            <Label htmlFor="file-input">Choose a file</Label>
            <Input id="file-input" ref={fileInputRef} type="file" disabled={busy} onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              setQrCodes([]);
              setCurrentIndex(0);
              setIsAutoPlaying(false);
              setError("");
              setFile(selected);
            }} />
            <p className="text-sm text-muted-foreground">Any file type, with no fixed file size limit. Files stay on this device. Larger files require many QR codes; scan every code in QR Bridge to download the file.</p>
            {file && <p className="text-sm">{file.name} · {file.size.toLocaleString()} bytes</p>}
          </div> : <div className="space-y-2">
            <Label htmlFor="text-input">Paste or enter your text content</Label>
            <Textarea
              id="text-input"
              placeholder="Enter or paste the text to convert..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-[150px] font-mono text-sm"
            />
            <p className="text-sm text-muted-foreground">
              Current length: {text.length} characters
              {text.length > chunkSize && (
                <span className="ml-2 text-primary">
                  (Will generate {Math.ceil(text.length / chunkSize)} QR codes)
                </span>
              )}
            </p>
          </div>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            <div className="space-y-2 w-full sm:w-auto">
              <Label htmlFor="chunk-size">Characters per chunk</Label>
              <Input
                id="chunk-size"
                type="number"
                min={50}
                max={inputMode === "file" ? 1000 : 2000}
                value={chunkSize}
                onChange={(e) => setChunkSize(Math.min(inputMode === "file" ? 1000 : 2000, Math.max(50, parseInt(e.target.value) || 500)))}
                className="w-full sm:w-32"
              />
            </div>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Recommended: 50-500 characters (smaller values produce easier-to-scan QR codes)
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={generateQRCodes} disabled={busy || (inputMode === "file" ? !file : !text.trim())}>
              {busy ? "Reading file..." : "Generate QR Codes"}
            </Button>
            {inputMode === "text" && <Button variant="outline" onClick={copyToClipboard} disabled={!text.trim()}>
              <Copy className="w-4 h-4 mr-2" />
              Copy Text
            </Button>}
            <Button variant="outline" onClick={clearAll} disabled={busy || (!file && !text.trim() && qrCodes.length === 0)}>
              <Trash2 className="w-4 h-4 mr-2" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {qrCodes.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-start justify-between gap-4 border-b bg-muted/30">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-lg">Generated QR Codes</CardTitle>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Scan every code in QR Bridge to retrieve the full {inputMode === "file" ? "file" : "text"}.
              </p>
            </div>
            {qrCodes.length > 1 && (
              <Button variant="outline" size="sm" onClick={downloadAllQRs}>
                <Download data-icon="inline-start" />
                Download All
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-5 p-4 sm:p-6 lg:p-8">
            <div className="w-full space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={feedbackEnabled} onChange={e => {
                  setFeedbackEnabled(e.target.checked);
                  if (!e.target.checked) {
                    setAdaptiveEnabled(false);
                    controllerRef.current.setAdaptive(false, performance.now());
                    setAdaptiveStats(controllerRef.current.tick(performance.now()));
                  }
                  queueRef.current = qrCodes.map((_, i) => i);
                  setFeedbackStatus("");
                }} />
                Use clipboard feedback to replay missing codes
              </label>
              {feedbackEnabled && <>
                <p className="text-sm text-muted-foreground" role="status">{feedbackStatus || "Waiting for scanner feedback."}</p>
                <Input aria-label="Receiver feedback" placeholder="Paste receiver feedback if clipboard access is blocked" value={feedbackInput} onChange={e => setFeedbackInput(e.target.value)} />
                <Button variant="outline" size="sm" onClick={() => {
                  if (!applyFeedback(feedbackInput)) setFeedbackStatus("Invalid feedback or feedback belongs to another transfer.");
                }}>Apply Feedback</Button>
              </>}
            </div>
            <div ref={playerRef} className={isFullscreen
              ? "flex h-dvh w-screen flex-col items-center gap-3 overflow-auto bg-background p-4 text-foreground"
              : "flex w-full flex-col items-center gap-5"}>
            <div className="flex w-full shrink-0 flex-wrap items-center justify-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                QR size
                <input type="range" min={256} max={1536} step={32} value={requestedSize}
                  onChange={event => (isFullscreen ? setFullscreenSize : setQrSize)(Number(event.target.value))}
                  className="w-32 sm:w-48" />
                <span className="w-16 tabular-nums">{displaySize}px</span>
              </label>
              <Button variant="outline" size="sm" onClick={toggleFullscreen}>
                {isFullscreen ? <Minimize /> : <Maximize />}
                {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </Button>
            </div>
            <div className="w-full shrink-0 space-y-1 text-center text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={adaptiveEnabled} onChange={event => {
                  const enabled = event.target.checked;
                  setAdaptiveEnabled(enabled);
                  if (enabled) setFeedbackEnabled(true);
                  controllerRef.current.setAdaptive(enabled, performance.now());
                  setAdaptiveStats(controllerRef.current.tick(performance.now()));
                }} />
                Adaptive speed (requires receiver clipboard feedback)
              </label>
              {feedbackEnabled && <p className="tabular-nums">
                Acknowledged payload: {adaptiveStats.acknowledgedBytes.toLocaleString()} B · Effective throughput: {adaptiveStats.bytesPerSecond === null ? "—" : `${adaptiveStats.bytesPerSecond.toFixed(0)} B/s`}
              </p>}
              {adaptiveEnabled && <p role="status">{adaptiveStats.interval}ms/code · {adaptiveStats.reason}</p>}
              {feedbackEnabled && <p className="text-xs text-muted-foreground">Unique payload bytes; excludes QR headers and retries. File payload includes encoding overhead. Average excludes playback pauses.</p>}
            </div>
            {fullscreenError && <p role="alert" className="text-sm text-destructive">{fullscreenError}</p>}
            <div className="flex w-full max-w-xl shrink-0 items-center justify-between gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={goToPrevious}
                disabled={currentIndex === 0}
                aria-label="Show previous QR code"
              >
                <ChevronLeft />
              </Button>
              <p className="text-sm font-medium tabular-nums text-muted-foreground">
                Code <span className="text-foreground">{currentIndex + 1}</span> of {qrCodes.length}
              </p>
              <Button
                variant="outline"
                size="icon"
                onClick={goToNext}
                disabled={currentIndex === qrCodes.length - 1}
                aria-label="Show next QR code"
              >
                <ChevronRight />
              </Button>
            </div>

            {qrCodes.length > 1 && (
              <div className="flex w-full max-w-xl shrink-0 flex-wrap items-center justify-center gap-3">
                <Button
                  variant={isAutoPlaying ? "secondary" : "outline"}
                  size="sm"
                  disabled={feedbackEnabled && feedbackRef.current?.missing.length === 0}
                  onClick={() => setIsAutoPlaying((playing) => !playing)}
                  aria-pressed={isAutoPlaying}
                >
                  {isAutoPlaying ? (
                    <Pause data-icon="inline-start" />
                  ) : (
                    <Play data-icon="inline-start" />
                  )}
                  {isAutoPlaying ? "Pause" : "Auto Play"}
                </Button>
                <div className="flex items-center gap-2">
                  <Label htmlFor="playback-speed" className="text-sm text-muted-foreground">
                    Speed
                  </Label>
                  <select id="playback-speed" aria-label="Playback speed"
                    disabled={adaptiveEnabled} value={effectivePlaybackSpeed} onChange={event => setPlaybackSpeed(Number(event.target.value))}
                    className="h-9 rounded-md border bg-background px-3 text-sm text-foreground">
                    {adaptiveEnabled && ![250, 500, 1000, 2000, 3000, 5000].includes(effectivePlaybackSpeed) && <option value={effectivePlaybackSpeed}>{effectivePlaybackSpeed / 1000} seconds</option>}
                    <option value={250}>0.25 seconds</option>
                    <option value={500}>0.5 seconds</option>
                    <option value={1000}>1 second</option>
                    <option value={2000}>2 seconds</option>
                    <option value={3000}>3 seconds</option>
                    <option value={5000}>5 seconds</option>
                  </select>
                </div>
              </div>
            )}

            <div ref={stageRef} className={isFullscreen
              ? "flex min-h-0 w-full flex-1 items-center justify-center"
              : "flex w-full items-center justify-center"}>
              <MaskedQRCode
                ref={(el) => { qrRefs.current[currentIndex] = el; }}
                value={qrCodes[currentIndex]}
                size={displaySize}
                variant={maskRetryRef.current.variant(currentIndex)}
                label={`QR code ${currentIndex + 1} of ${qrCodes.length}`}
              />
            </div>
            {!isFullscreen && <p className="text-center text-xs text-muted-foreground">Size fits the available space. Use fullscreen for larger codes; keep the entire white border visible.</p>}
            </div>
            <Button variant="outline" size="sm" onClick={() => downloadQR(currentIndex)}>
              <Download data-icon="inline-start" />Download QR
            </Button>

            {qrCodes.length > 1 && (
              <div className="flex max-w-full flex-wrap justify-center gap-2" aria-label="Choose a QR code">
                {qrCodes.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentIndex(index)}
                    className={`size-2.5 rounded-full transition-colors ${
                      index === currentIndex
                        ? "bg-primary"
                        : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                    }`}
                    aria-label={`Go to QR code ${index + 1}`}
                    aria-current={index === currentIndex ? "step" : undefined}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
