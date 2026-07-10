"use client";

import { useState } from "react";
import { QRGenerator } from "@/components/qr-generator";
import { QRScanner } from "@/components/qr-scanner";
import { SessionPanel } from "@/components/session-panel";
import { SessionProvider } from "@/components/session-provider";
import { QrCode, ScanLine, Share2 } from "lucide-react";

type Mode = "generate" | "scan" | "session";

export default function Home() {
  const [mode, setMode] = useState<Mode>("generate");

  return (
    <SessionProvider>
    <main className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            QR Bridge
          </h1>
          <p className="text-muted-foreground">
            Generate and scan QR codes with automatic text chunking
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
              Generate
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
              Scan
            </button>
            <button
              onClick={() => setMode("session")}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                mode === "session"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Share2 className="w-4 h-4" />
              Session
            </button>
          </div>
        </div>

        {/* Content */}
        {mode === "generate" && <QRGenerator />}
        {mode === "scan" && <QRScanner />}
        {mode === "session" && <SessionPanel />}

        {/* Footer */}
        <footer className="mt-12 text-center text-sm text-muted-foreground">
          <p>
            Tip: Create a Session to collect scanned content and reopen it on another device with the same code. Sessions expire after 30 minutes.
          </p>
        </footer>
      </div>
    </main>
    </SessionProvider>
  );
}
