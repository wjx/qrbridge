"use client";

import { useEffect, useState, useRef } from "react";
import { createFileChunks, MAX_FILE_BYTES } from "@/lib/file-transfer";
import { advancePlayback, parseFeedback, readClipboard, type Feedback } from "@/lib/clipboard-feedback";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
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
  const qrRefs = useRef<(SVGSVGElement | null)[]>([]);

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
    feedbackRef.current = feedback;
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
    if (!isAutoPlaying || !qrCodes.length) return;
    const intervalId = window.setInterval(() => {
      const next = advancePlayback(indexRef.current, queueRef.current,
        feedbackEnabled ? feedbackRef.current?.missing ?? null : null);
      queueRef.current = next.queue;
      indexRef.current = next.index;
      setCurrentIndex(next.index);
      if (next.complete) setIsAutoPlaying(false);
    }, playbackSpeed);
    return () => window.clearInterval(intervalId);
  }, [isAutoPlaying, playbackSpeed, qrCodes, feedbackEnabled]);

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
              setError(selected && selected.size > MAX_FILE_BYTES ? "File is too large. Maximum size is 100 KiB." : "");
              setFile(selected && selected.size <= MAX_FILE_BYTES ? selected : null);
            }} />
            <p className="text-sm text-muted-foreground">Any file type, up to 100 KiB. Files stay on this device. Larger files require many QR codes; scan every code in QR Bridge to download the file.</p>
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
                  feedbackRef.current = null;
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
            <div className="flex w-full max-w-xl items-center justify-between gap-3">
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
              <div className="flex w-full max-w-xl flex-wrap items-center justify-center gap-3">
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
                  <Select
                    value={String(playbackSpeed)}
                    onValueChange={(value) => setPlaybackSpeed(Number(value))}
                  >
                    <SelectTrigger id="playback-speed" className="w-32" aria-label="Playback speed">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="500">0.5 seconds</SelectItem>
                        <SelectItem value="1000">1 second</SelectItem>
                        <SelectItem value="2000">2 seconds</SelectItem>
                        <SelectItem value="3000">3 seconds</SelectItem>
                        <SelectItem value="5000">5 seconds</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-xl border bg-qr-surface p-3 shadow-sm sm:p-6 md:max-w-xl lg:max-w-2xl">
              <QRCodeSVG
                ref={(el) => { qrRefs.current[currentIndex] = el; }}
                value={qrCodes[currentIndex]}
                size={640}
                level="Q"
                includeMargin
                className="size-full max-w-md md:max-w-xl lg:max-w-2xl"
                aria-label={`QR code ${currentIndex + 1} of ${qrCodes.length}`}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadQR(currentIndex)}
              >
                <Download data-icon="inline-start" />
                Download QR
              </Button>
            </div>

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
