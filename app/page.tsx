"use client";

import { useState } from "react";
import { QRGenerator } from "@/components/qr-generator";
import { QRScanner } from "@/components/qr-scanner";
import { QrCode, ScanLine } from "lucide-react";

type Mode = "generate" | "scan";

export default function Home() {
  const [mode, setMode] = useState<Mode>("generate");

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            QR 码工具
          </h1>
          <p className="text-muted-foreground">
            生成和扫描二维码，支持长文本自动分段
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex rounded-lg border p-1 bg-muted/50">
            <button
              onClick={() => setMode("generate")}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                mode === "generate"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <QrCode className="w-4 h-4" />
              生成二维码
            </button>
            <button
              onClick={() => setMode("scan")}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                mode === "scan"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ScanLine className="w-4 h-4" />
              扫描模式
            </button>
          </div>
        </div>

        {/* Content */}
        {mode === "generate" ? <QRGenerator /> : <QRScanner />}

        {/* Footer */}
        <footer className="mt-12 text-center text-sm text-muted-foreground">
          <p>
            💡 提示: 长文本会自动分割成多个二维码，扫描时按顺序扫描即可自动合并
          </p>
        </footer>
      </div>
    </main>
  );
}
