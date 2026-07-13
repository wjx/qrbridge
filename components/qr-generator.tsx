"use client";

import { useState, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Copy, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

interface QRGeneratorProps {
  onGeneratedData?: (chunks: string[]) => void;
}

export function QRGenerator({ onGeneratedData }: QRGeneratorProps) {
  const [text, setText] = useState("");
  const [chunkSize, setChunkSize] = useState(500);
  const [qrCodes, setQrCodes] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const qrRefs = useRef<(SVGSVGElement | null)[]>([]);

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

  const generateQRCodes = () => {
    if (!text.trim()) return;
    const chunks = splitText(text, chunkSize);
    setQrCodes(chunks);
    setCurrentIndex(0);
    onGeneratedData?.(chunks);
  };

  const clearAll = () => {
    setText("");
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
          <CardTitle className="text-lg">Input Text</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
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
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            <div className="space-y-2 w-full sm:w-auto">
              <Label htmlFor="chunk-size">Characters per chunk</Label>
              <Input
                id="chunk-size"
                type="number"
                min={50}
                max={2000}
                value={chunkSize}
                onChange={(e) => setChunkSize(Math.max(50, parseInt(e.target.value) || 500))}
                className="w-full sm:w-32"
              />
            </div>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Recommended: 50-500 characters (smaller values produce easier-to-scan QR codes)
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={generateQRCodes} disabled={!text.trim()}>
              Generate QR Codes
            </Button>
            <Button variant="outline" onClick={copyToClipboard} disabled={!text.trim()}>
              <Copy className="w-4 h-4 mr-2" />
              Copy Text
            </Button>
            <Button variant="outline" onClick={clearAll} disabled={!text.trim() && qrCodes.length === 0}>
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
                Scan each code in order to retrieve the full text.
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

            <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-xl border bg-qr-surface p-3 shadow-sm sm:p-6">
              <QRCodeSVG
                ref={(el) => { qrRefs.current[currentIndex] = el; }}
                value={qrCodes[currentIndex]}
                size={420}
                level="Q"
                includeMargin
                className="size-full max-w-md"
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
