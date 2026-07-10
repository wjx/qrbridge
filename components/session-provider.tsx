"use client"

import { createContext, useContext, useEffect, useState, useCallback } from "react"

interface SessionContextValue {
  activeCode: string | null
  setActiveCode: (code: string | null) => void
  saveToSession: (content: string) => Promise<{ ok: boolean; error?: string }>
}

const SessionContext = createContext<SessionContextValue | null>(null)

const STORAGE_KEY = "qrbridge:activeCode"

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [activeCode, setActiveCodeState] = useState<string | null>(null)

  // Restore the active session code for this tab on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored) setActiveCodeState(stored)
  }, [])

  const setActiveCode = useCallback((code: string | null) => {
    setActiveCodeState(code)
    if (code) {
      sessionStorage.setItem(STORAGE_KEY, code)
    } else {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  const saveToSession = useCallback(
    async (content: string) => {
      if (!activeCode) {
        return { ok: false, error: "No active session. Create or join one first." }
      }
      try {
        const res = await fetch(`/api/sessions/${activeCode}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          if (res.status === 404) setActiveCode(null)
          return { ok: false, error: data.error ?? "Failed to save." }
        }
        return { ok: true }
      } catch {
        return { ok: false, error: "Network error." }
      }
    },
    [activeCode, setActiveCode],
  )

  return (
    <SessionContext.Provider value={{ activeCode, setActiveCode, saveToSession }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error("useSession must be used within a SessionProvider")
  return ctx
}
