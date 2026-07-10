"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSession } from "@/components/session-provider";
import { Camera, StopCircle, Trash2, Copy, Check, RefreshCw, Share2, Loader2 } from "lucide-react";

interface ScannedChunk {
  index: number;
  total: number;
  content: string;
  raw: string;
}

export function QRScanner() {
  const [isScanning, setIsScanning] = useState(false);
  const [scannedChunks, setScannedChunks] = useState<Map<number, ScannedChunk>>(new Map());
  const [totalChunks, setTotalChunks] = useState<number | null>(null);
  const [lastScanned, setLastScanned] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { activeCode, saveToSession } = useSession();

  const parseQRData = (data: string): ScannedChunk | null => {
    // Parse format: [chunk_index/total_chunks]content
    const match = data.match(/^\[(\d+)\/(\d+)\](.*)$/s);
    if (match) {
      return {
        index: parseInt(match[1]),
        total: parseInt(match[2]),
        content: match[3],
        raw: data,
      };
    }
    // If no format detected, treat as single chunk
    return {
      index: 1,
      total: 1,
      content: data,
      raw: data,
    };
  };

  const handleScanSuccess = useCallback((decodedText: string) => {
    // Prevent duplicate scans of the same content
    if (decodedText === lastScanned) return;
    setLastScanned(decodedText);

    const parsed = parseQRData(decodedText);
    if (!parsed) {
      setError("Unable to parse QR code content");
      return;
    }

    setScannedChunks((prev) => {
      const newMap = new Map(prev);
      if (!newMap.has(parsed.index)) {
        newMap.set(parsed.index, parsed);
      }
      return newMap;
    });

    if (totalChunks === null) {
      setTotalChunks(parsed.total);
    }

    setError("");
  }, [lastScanned, totalChunks]);

  const startScanning = async () => {
    setError("");
    
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

  const clearScannedData = () => {
    setScannedChunks(new Map());
    setTotalChunks(null);
    setLastScanned("");
    setError("");
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
      setTimeout(() => setSaveState("idle"), 2000);
    } else {
      setSaveState("idle");
      setError(result.error ?? "Failed to save to session.");
    }
  };

  const isComplete = totalChunks !== null && scannedChunks.size === totalChunks;

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
          <div
            id="qr-reader"
            ref={containerRef}
            className={`w-full max-w-md mx-auto overflow-hidden rounded-lg ${
              isScanning ? "min-h-[300px]" : "min-h-0"
            }`}
          />

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2 justify-center">
            {!isScanning ? (
              <Button onClick={startScanning}>
                <Camera className="w-4 h-4 mr-2" />
                Start Scanning
              </Button>
            ) : (
              <Button variant="destructive" onClick={stopScanning}>
                <StopCircle className="w-4 h-4 mr-2" />
                Stop Scanning
              </Button>
            )}
            <Button
              variant="outline"
              onClick={clearScannedData}
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
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">
              Scan Results
              {isComplete && (
                <span className="ml-2 text-sm font-normal text-green-600">
                  (Complete)
                </span>
              )}
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
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
              </Button>
              <Button
                size="sm"
                onClick={handleSaveToSession}
                disabled={saveState !== "idle" || !getFullText()}
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
              </Button>
            </div>
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

              <div className="p-4 bg-muted rounded-lg">
                <pre className="whitespace-pre-wrap break-all text-sm font-mono">
                  {getFullText() || "Waiting for scan..."}
                </pre>
              </div>

              <p className="text-sm text-muted-foreground">
                Scanned text length: {getFullText().length} characters
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {scannedChunks.size === 0 && !isScanning && (
        <Card className="border-dashed">
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              <RefreshCw className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Click &quot;Start Scanning&quot; to use your camera</p>
              <p className="text-sm mt-2">Supports scanning multiple QR codes and auto-merging content</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
