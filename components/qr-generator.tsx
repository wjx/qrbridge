"use client";

import { useState, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Copy, Trash2 } from "lucide-react";

interface QRGeneratorProps {
  onGeneratedData?: (chunks: string[]) => void;
}

export function QRGenerator({ onGeneratedData }: QRGeneratorProps) {
  const [text, setText] = useState("");
  const [chunkSize, setChunkSize] = useState(500);
  const [qrCodes, setQrCodes] = useState<string[]>([]);
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
    onGeneratedData?.(chunks);
  };

  const clearAll = () => {
    setText("");
    setQrCodes([]);
  };

  const downloadQR = (index: number) => {
    const svg = qrRefs.current[index];
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    
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
          <CardTitle className="text-lg">输入文本</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="text-input">粘贴或输入文本内容</Label>
            <Textarea
              id="text-input"
              placeholder="在此输入或粘贴要转换的文本..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-[150px] font-mono text-sm"
            />
            <p className="text-sm text-muted-foreground">
              当前文本长度: {text.length} 字符
              {text.length > chunkSize && (
                <span className="ml-2 text-primary">
                  (将生成 {Math.ceil(text.length / chunkSize)} 个二维码)
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            <div className="space-y-2 w-full sm:w-auto">
              <Label htmlFor="chunk-size">每段字符数</Label>
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
              建议: 50-500字符 (较小的值生成更易扫描的二维码)
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={generateQRCodes} disabled={!text.trim()}>
              生成二维码
            </Button>
            <Button variant="outline" onClick={copyToClipboard} disabled={!text.trim()}>
              <Copy className="w-4 h-4 mr-2" />
              复制文本
            </Button>
            <Button variant="outline" onClick={clearAll} disabled={!text.trim() && qrCodes.length === 0}>
              <Trash2 className="w-4 h-4 mr-2" />
              清空
            </Button>
          </div>
        </CardContent>
      </Card>

      {qrCodes.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">
              生成的二维码 ({qrCodes.length} 个)
            </CardTitle>
            {qrCodes.length > 1 && (
              <Button variant="outline" size="sm" onClick={downloadAllQRs}>
                <Download className="w-4 h-4 mr-2" />
                下载全部
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              请按顺序扫描以下二维码以获取完整文本
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {qrCodes.map((chunk, index) => (
                <div
                  key={index}
                  className="flex flex-col items-center p-4 border rounded-lg bg-white"
                >
                  <div className="mb-2 text-sm font-medium text-gray-700">
                    第 {index + 1} / {qrCodes.length} 个
                  </div>
                  <QRCodeSVG
                    ref={(el) => { qrRefs.current[index] = el; }}
                    value={chunk}
                    size={180}
                    level="M"
                    includeMargin
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => downloadQR(index)}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    下载
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
