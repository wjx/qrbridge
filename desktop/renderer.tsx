import React from 'react'
import { createRoot } from 'react-dom/client'
import { QRScanner } from '@/components/qr-scanner'
import { QRGenerator } from '@/components/qr-generator'
import { SessionProvider } from '@/components/session-provider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { QrCode, ScanLine } from 'lucide-react'
import '@/app/globals.css'

createRoot(document.getElementById('root')!).render(
  <SessionProvider>
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <header className="text-center">
          <h1 className="text-3xl font-bold">QR Bridge</h1>
          <p className="mt-2 text-muted-foreground">Generate and scan QR codes offline with automatic text and file chunking. Content stays on this device.</p>
        </header>
        <Tabs defaultValue="scan" className="gap-6">
          <TabsList className="mx-auto" aria-label="QR code mode">
            <TabsTrigger value="generate" className="px-4">
              <QrCode aria-hidden="true" />
              Generate
            </TabsTrigger>
            <TabsTrigger value="scan" className="px-4">
              <ScanLine aria-hidden="true" />
              Scan
            </TabsTrigger>
          </TabsList>
          <TabsContent value="generate">
            <QRGenerator />
          </TabsContent>
          <TabsContent value="scan">
            <QRScanner desktop />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  </SessionProvider>,
)
