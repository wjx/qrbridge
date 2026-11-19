"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { parseTransferChunk, assertCompatible, restoreFile } from "@/lib/file-transfer";
import { createFeedback, writeClipboard } from "@/lib/clipboard-feedback";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  useSession,
} from "@/components/session-provider";
import { TransferStats } from "@/components/transfer-stats";
import { ScreenScanPreview } from "@/components/screen-scan-preview";
import { useScreenQRScanner, type ScanRegion } from "@/hooks/use-screen-qr-scanner";
import { Download, Camera, StopCircle, Trash2, Copy, Check, RefreshCw, Share2, Loader2, Monitor, MonitorX } from "lucide-react";

export function QRScanner({ desktop = false }: { desktop?: boolean }) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanRegion, setScanRegion] = useState<ScanRegion | null>(null);
  const [selectingRegion, setSelectingRegion] = useState(true);
  const [error, setError] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    activeCode,
    saveToSession,
    scannedChunks,
    setScannedChunks,
    totalChunks,
    setTotalChunks,
    setLastScanned,
    clearScannedData,
  } = useSession();

  const chunksRef = useRef(scannedChunks);
  chunksRef.current = scannedChunks;
  const [receivedFile, setReceivedFile] = useState<{ name: string; blob: Blob } | null>(null);
  const [fileError, setFileError] = useState("");
  const [feedbackEnabled, setFeedbackEnabled] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const feedbackText = createFeedback(scannedChunks);
  const feedbackTextRef = useRef(feedbackText);
  feedbackTextRef.current = feedbackText;

  useEffect(() => {
    if (!feedbackEnabled) return;
    let cancelled = false;
    let pending = false;
    let lastWritten: string | null = null;
    const publish = async () => {
      const value = feedbackTextRef.current;
      if (!value || value === lastWritten || pending) return;
      pending = true;
      try {
        await writeClipboard(value);
        lastWritten = value;
        if (!cancelled) setFeedbackStatus("Scan progress sent through clipboard.");
      } catch {
        if (!cancelled) setFeedbackStatus("Clipboard unavailable. Copy the feedback below manually.");
      } finally { pending = false; }
    };
    void publish();
    const timer = window.setInterval(publish, 300);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [feedbackEnabled]);

  const isFile = Boolean(scannedChunks.values().next().value?.transferId);

  const handleScanSuccess = useCallback((decodedText: string) => {
    try {
      const parsed = parseTransferChunk(decodedText);
      const current = chunksRef.current;
      assertCompatible(current.values().next().value, parsed);
      const previous = current.get(parsed.index);
      if (previous) {
        if (previous.raw !== parsed.raw) throw new Error("Conflicting QR chunk. Clear Results before scanning another transfer.");
        return;
      }
      const next = new Map(current);
      next.set(parsed.index, parsed);
      chunksRef.current = next;
      setScannedChunks(next);
      setTotalChunks(parsed.total);
      setLastScanned(decodedText);
      setSaveState("idle");
      setError("");
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(80);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to parse QR code content");
    }
  }, [setScannedChunks, setTotalChunks, setLastScanned]);

  const {
    isSupported: isScreenCaptureSupported,
    isScreenScanning,
    isScreenStarting,
    screenError,
    videoRef,
    startScreenScanning,
    stopScreenScanning,
  } = useScreenQRScanner({ onDecode: handleScanSuccess, desktop, region: scanRegion, paused: selectingRegion });

  const startScanning = async () => {
    setError("");

    // Screen capture and camera scanning are mutually exclusive
    if (isScreenScanning) {
      stopScreenScanning();
    }

    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode("qr-reader");
      }

      await scannerRef.current.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        handleScanSuccess,
        () => {} // Ignore errors during scanning
      );
      
      setIsScanning(true);
    } catch (err) {
      console.error("Scanner error:", err);
      setError("Unable to access camera. Please ensure camera permissions are granted and no other app is using the camera.");
    }
  };

  const stopScanning = async () => {
    if (scannerRef.current && isScanning) {
      try {
        await scannerRef.current.stop();
      } catch (err) {
        console.error("Stop error:", err);
      }
    }
    setIsScanning(false);
  };

  const handleStartScreenScanning = async () => {
    setError("");
    // Screen capture and camera scanning are mutually exclusive
    if (isScanning) {
      await stopScanning();
    }
    setScanRegion(null);
    setSelectingRegion(true);
    await startScreenScanning();
  };

  const handleClearScannedData = () => {
    chunksRef.current = new Map();
    clearScannedData();
    setReceivedFile(null);
    setFileError("");
    setError("");
    setSaveState("idle");
  };

  const getFullText = (): string => {
    if (scannedChunks.size === 0) return "";
    
    const sortedChunks = Array.from(scannedChunks.values())
      .sort((a, b) => a.index - b.index);
    
    return sortedChunks.map((chunk) => chunk.content).join("");
  };

  const copyToClipboard = async () => {
    const text = getFullText();
    if (text) {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSaveToSession = async () => {
    const text = getFullText();
    if (!text) return;
    setSaveState("saving");
    setError("");
    const result = await saveToSession(text);
    if (result.ok) {
      setSaveState("saved");
    } else {
      setSaveState("idle");
      setError(result.error ?? "Failed to save to session.");
    }
  };

  const isComplete = totalChunks !== null && scannedChunks.size === totalChunks;

  useEffect(() => {
    let cancelled = false;
    setReceivedFile(null);
    setFileError("");
    if (isFile && isComplete) {
      restoreFile(Array.from(scannedChunks.values())).then(file => {
        if (!cancelled) setReceivedFile(file);
      }).catch(err => {
        if (!cancelled) setFileError(err instanceof Error ? err.message : "Unable to restore file.");
      });
    }
    return () => { cancelled = true; };
  }, [scannedChunks, isFile, isComplete]);

  const downloadFile = () => {
    if (!receivedFile) return;
    const url = URL.createObjectURL(receivedFile.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = receivedFile.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  // Auto-stop screen capture once every chunk has been collected
  useEffect(() => {
    if (isComplete && isScreenScanning) {
      stopScreenScanning();
    }
  }, [isComplete, isScreenScanning, stopScreenScanning]);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const getMissingChunks = (): number[] => {
    if (totalChunks === null) return [];
    const missing: number[] = [];
    for (let i = 1; i <= totalChunks; i++) {
      if (!scannedChunks.has(i)) {
        missing.push(i);
      }
    }
    return missing;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Scan QR Codes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={feedbackEnabled} onChange={e => setFeedbackEnabled(e.target.checked)} />
              Send scan progress through clipboard (overwrites clipboard)
            </label>
            {feedbackEnabled && <>
              <p className="text-sm text-muted-foreground" role="status">{feedbackStatus || "Waiting for a QR Bridge transfer."}</p>
              {feedbackText && <>
                <Button size="sm" variant="outline" onClick={async () => {
                  try { await writeClipboard(feedbackText); setFeedbackStatus("Feedback copied."); }
                  catch { setFeedbackStatus("Select and copy the feedback below manually."); }
                }}>Copy Feedback</Button>
                <textarea aria-label="Scan feedback" className="w-full rounded border p-2 text-xs" readOnly value={feedbackText} />
              </>}
            </>}
          </div>
          <div
            id="qr-reader"
            ref={containerRef}
            className={`w-full max-w-md mx-auto overflow-hidden rounded-lg ${
              isScanning ? "min-h-[300px]" : "min-h-0"
            }`}
          />

          <div className={`w-full mx-auto ${isScreenScanning ? "" : "hidden"}`}>
            <ScreenScanPreview
              videoRef={videoRef}
              selecting={selectingRegion}
              region={scanRegion}
              onSelect={(region) => { setScanRegion(region); setSelectingRegion(false); }}
              onReselect={() => setSelectingRegion(true)}
            />
          </div>

          {(error || screenError) && (
            <Alert variant="destructive">
              <AlertDescription>{error || screenError}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2 justify-center">
            {!isScanning ? (
              <Button onClick={startScanning} disabled={isScreenStarting}>
                <Camera className="w-4 h-4 mr-2" />
                Start Scanning
              </Button>
            ) : (
              <Button variant="destructive" onClick={stopScanning}>
                <StopCircle className="w-4 h-4 mr-2" />
                Stop Scanning
              </Button>
            )}
            {isScreenCaptureSupported &&
              (!isScreenScanning ? (
                <Button
                  variant="secondary"
                  onClick={handleStartScreenScanning}
                  disabled={isScreenStarting}
                  aria-busy={isScreenStarting}
                >
                  {isScreenStarting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Monitor className="w-4 h-4 mr-2" />
                  )}
                  {isScreenStarting ? "Starting Capture..." : "Capture Screen"}
                </Button>
              ) : (
                <Button variant="destructive" onClick={stopScreenScanning}>
                  <MonitorX className="w-4 h-4 mr-2" />
                  Stop Capture
                </Button>
              ))}
            <Button
              variant="outline"
              onClick={handleClearScannedData}
              disabled={scannedChunks.size === 0}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear Results
            </Button>
          </div>

          {totalChunks !== null && (
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary">
                <span className="text-sm font-medium">
                  Progress: {scannedChunks.size} / {totalChunks}
                </span>
                {isComplete && (
                  <Check className="w-4 h-4 text-green-600" />
                )}
              </div>
              {totalChunks > 1 && scannedChunks.size > 0 && (
                <TransferStats
                  received={scannedChunks.size}
                  total={totalChunks}
                  active={isScanning || (isScreenScanning && !selectingRegion)}
                />
              )}
              {!isComplete && getMissingChunks().length > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  Missing: #{getMissingChunks().join(", #")}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {scannedChunks.size > 0 && (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg">
              Scan Results
              {isComplete && (
                <span className="ml-2 text-sm font-normal text-green-600">
                  (Complete)
                </span>
              )}
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              {isFile ? <Button size="sm" onClick={downloadFile} disabled={!receivedFile}>
                <Download className="w-4 h-4 mr-2" />Download File
              </Button> : <Button
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-none"
                onClick={copyToClipboard}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Text
                  </>
                )}
              </Button>}
              {!desktop && !isFile && <Button
                size="sm"
                className="flex-1 sm:flex-none"
                onClick={handleSaveToSession}
                disabled={saveState !== "idle" || !getFullText() || !activeCode}
                title={activeCode ? `Save to session ${activeCode}` : "Create or join a session first"}
              >
                {saveState === "saving" ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving
                  </>
                ) : saveState === "saved" ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Saved
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4 mr-2" />
                    Save to session
                  </>
                )}
              </Button>}
            </div>
            {!desktop && !isFile && !activeCode && getFullText() && (
              <p className="w-full text-sm text-muted-foreground sm:text-right">
                Create or join a session first to save your scan.
              </p>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: totalChunks || scannedChunks.size }).map(
                  (_, i) => {
                    const chunkNum = i + 1;
                    const hasChunk = scannedChunks.has(chunkNum);
                    return (
                      <div
                        key={chunkNum}
                        className={`w-8 h-8 rounded flex items-center justify-center text-sm font-medium ${
                          hasChunk
                            ? "bg-green-100 text-green-700 border border-green-300"
                            : "bg-gray-100 text-gray-400 border border-gray-200"
                        }`}
                      >
                        {chunkNum}
                      </div>
                    );
                  }
                )}
              </div>

              {isFile ? <div className="p-4 bg-muted rounded-lg space-y-2" aria-live="polite">
                {fileError ? <p role="alert" className="text-destructive">{fileError}</p> : receivedFile ? <>
                  <p className="font-medium break-all">{receivedFile.name}</p>
                  <p className="text-sm">{receivedFile.blob.size.toLocaleString()} bytes · File verified. Ready to download.</p>
                </> : <p>{isComplete ? "Verifying file..." : "Receiving file. Scan all QR codes to enable download."}</p>}
              </div> : <><div className="p-4 bg-muted rounded-lg">
                <pre className="whitespace-pre-wrap break-all text-sm font-mono">
                  {getFullText() || "Waiting for scan..."}
                </pre>
              </div>

              <p className="text-sm text-muted-foreground">
                Scanned text length: {getFullText().length} characters
              </p></>}
            </div>
          </CardContent>
        </Card>
      )}

      {scannedChunks.size === 0 && !isScanning && !isScreenScanning && (
        <Card className="border-dashed">
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              <RefreshCw className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>
                Click &quot;Start Scanning&quot; to use your camera
                {isScreenCaptureSupported && <>, or &quot;Capture Screen&quot; to read QR codes on your screen</>}
              </p>
              <p className="text-sm mt-2">Supports scanning multiple QR codes and auto-merging content</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
