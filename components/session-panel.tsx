"use client"

import { useState, useMemo } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useSession } from "@/components/session-provider"
import {
  Plus,
  LogIn,
  LogOut,
  Copy,
  Check,
  Clock,
  Inbox,
  Loader2,
} from "lucide-react"

interface SessionItem {
  id: string
  content: string
  createdAt: number
}

interface SessionData {
  code: string
  items: SessionItem[]
  expiresIn: number
}

const fetcher = async (url: string): Promise<SessionData> => {
  const res = await fetch(url)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const err = new Error(data.error ?? "Failed to load session") as Error & {
      status?: number
    }
    err.status = res.status
    throw err
  }
  return res.json()
}

function formatTime(seconds: number): string {
  if (seconds <= 0) return "expired"
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function SessionPanel() {
  const { activeCode, setActiveCode } = useSession()
  const [joinCode, setJoinCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { data, isLoading, error: swrError } = useSWR<SessionData>(
    activeCode ? `/api/sessions/${activeCode}` : null,
    fetcher,
    {
      refreshInterval: 5000,
      onError: (err: Error & { status?: number }) => {
        if (err.status === 404) {
          setError("This session has expired or no longer exists.")
          setActiveCode(null)
        }
      },
    },
  )

  const createSession = async () => {
    setBusy(true)
    setError("")
    try {
      const res = await fetch("/api/sessions", { method: "POST" })
      if (!res.ok) throw new Error()
      const json = await res.json()
      setActiveCode(json.code)
    } catch {
      setError("Could not create a session. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  const joinSession = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (!code) return
    setBusy(true)
    setError("")
    try {
      const res = await fetch(`/api/sessions/${code}`)
      if (res.status === 404) {
        setError("No session found for that code. It may have expired.")
        return
      }
      if (!res.ok) throw new Error()
      setActiveCode(code)
      setJoinCode("")
    } catch {
      setError("Could not join the session. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  const copyItem = async (item: SessionItem) => {
    await navigator.clipboard.writeText(item.content)
    setCopiedId(item.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const items = useMemo(
    () => (data?.items ? [...data.items].reverse() : []),
    [data],
  )

  // ---- Not in a session: show create / join ----
  if (!activeCode) {
    return (
      <div className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Create a Session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Create a temporary session to collect scanned content. You&apos;ll get a
              short code to open it on another device. Sessions auto-delete after 30
              minutes.
            </p>
            <Button onClick={createSession} disabled={busy} className="w-full sm:w-auto">
              {busy ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Create Session
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Open with a Code</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={joinSession} className="flex flex-col sm:flex-row gap-2">
              <Input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter code (e.g. K7P2QX)"
                maxLength={6}
                autoCapitalize="characters"
                className="font-mono tracking-widest text-base uppercase"
              />
              <Button type="submit" variant="secondary" disabled={busy || !joinCode.trim()}>
                <LogIn className="w-4 h-4 mr-2" />
                Open
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---- In a session: show code, countdown, items ----
  const expiresIn = data?.expiresIn ?? 0

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="py-6">
          <div className="flex flex-col items-center gap-3">
            <span className="text-sm text-muted-foreground">Your session code</span>
            <div className="text-4xl sm:text-5xl font-bold font-mono tracking-[0.3em] pl-[0.3em]">
              {activeCode}
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              {swrError ? (
                <span>checking…</span>
              ) : (
                <span>Expires in {formatTime(expiresIn)}</span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setActiveCode(null)
                setError("")
              }}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Leave session
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">
            Saved Items
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({items.length})
            </span>
          </CardTitle>
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <Inbox className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No content saved yet.</p>
              <p className="text-sm mt-2">
                Scan a QR code, then tap &quot;Save to session&quot; to store it here.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border bg-muted/40 p-3 flex items-start gap-3"
                >
                  <pre className="flex-1 whitespace-pre-wrap break-all text-sm font-mono min-w-0">
                    {item.content}
                  </pre>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-8 w-8"
                    onClick={() => copyItem(item)}
                    aria-label="Copy item"
                  >
                    {copiedId === item.id ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
