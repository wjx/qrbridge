import React, { useEffect, useState } from 'react'
import { execution } from '@/lib/execution'
import { ExecutionPanel } from '@/components/execution-panel'
import { Button } from '@/components/ui/button'
import { createRoot } from 'react-dom/client'
import { QRScanner } from '@/components/qr-scanner'
import { QRGenerator } from '@/components/qr-generator'
import { SessionProvider } from '@/components/session-provider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { QrCode, ScanLine } from 'lucide-react'
import '@/app/globals.css'

function DesktopApp() {
  const [mode, setMode] = useState<'file' | 'execution'>('file')
  const [executionActive, setExecutionActive] = useState(false)
  useEffect(() => {
    void execution('snapshot').then(state => {
      if (state.active) { setMode('execution'); setExecutionActive(true) }
    }).catch(() => { /* Execution settings errors are shown in the execution panel. */ })
  }, [])
  return (
  <SessionProvider>
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <header className="text-center">
          <h1 className="text-3xl font-bold">QR Bridge</h1>
          <p className="mt-2 text-muted-foreground">文件传输与远端执行 · 剪贴板下发，二维码回传</p>
        </header>
        <div className="flex justify-center gap-2" aria-label="工作模式">
          <Button variant={mode === 'file' ? 'default' : 'outline'} disabled={executionActive} onClick={() => setMode('file')}>文件传输模式</Button>
          <Button variant={mode === 'execution' ? 'default' : 'outline'} onClick={() => setMode('execution')}>执行模式</Button>
        </div>
        {mode === 'execution' ? <ExecutionPanel onActiveChange={setExecutionActive} /> : <Tabs defaultValue="scan" className="gap-6">
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
        </Tabs>}
      </div>
    </main>
  </SessionProvider>
  )
}

createRoot(document.getElementById('root')!).render(<DesktopApp />)
