import { NextResponse } from "next/server"
import { redis, sessionKey, type SessionItem } from "@/lib/redis"

async function readItems(code: string): Promise<SessionItem[] | null> {
  const key = sessionKey(code)
  const exists = await redis.exists(key)
  if (!exists) return null
  const items = await redis.get<SessionItem[]>(key)
  return Array.isArray(items) ? items : []
}

// GET /api/sessions/[code] -> return items + remaining ttl
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  const items = await readItems(code)

  if (items === null) {
    return NextResponse.json(
      { error: "Session not found or expired." },
      { status: 404 },
    )
  }

  const ttl = await redis.ttl(sessionKey(code))

  return NextResponse.json({
    code: code.toUpperCase(),
    items,
    expiresIn: ttl > 0 ? ttl : 0,
  })
}

// POST /api/sessions/[code] -> append a scanned item to the session
export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  const key = sessionKey(code)

  let body: { content?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  const content = typeof body.content === "string" ? body.content.trim() : ""
  if (!content) {
    return NextResponse.json({ error: "Content is required." }, { status: 400 })
  }

  const items = await readItems(code)
  if (items === null) {
    return NextResponse.json(
      { error: "Session not found or expired." },
      { status: 404 },
    )
  }

  const newItem: SessionItem = {
    id: crypto.randomUUID(),
    content: content.slice(0, 10000),
    createdAt: Date.now(),
  }
  items.push(newItem)

  // Preserve the original 30-minute expiry when writing back
  await redis.set(key, items as never, { keepTtl: true })

  const ttl = await redis.ttl(key)

  return NextResponse.json({
    item: newItem,
    items,
    expiresIn: ttl > 0 ? ttl : 0,
  })
}
