import React from 'react'
import { createRoot } from 'react-dom/client'
import { QRScanner } from '@/components/qr-scanner'
import { SessionProvider } from '@/components/session-provider'
import '@/app/globals.css'

createRoot(document.getElementById('root')!).render(
  <SessionProvider>
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <header className="text-center">
          <h1 className="text-3xl font-bold">QR Bridge</h1>
          <p className="mt-2 text-muted-foreground">Capture a screen or window to scan QR codes. Results stay on this device.</p>
        </header>
        <QRScanner desktop />
      </div>
    </main>
  </SessionProvider>,
)
