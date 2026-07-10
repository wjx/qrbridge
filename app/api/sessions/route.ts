import { NextResponse } from "next/server"
import {
  redis,
  generateCode,
  sessionKey,
  SESSION_TTL_SECONDS,
} from "@/lib/redis"

// POST /api/sessions -> create a new empty session and return its short code
export async function POST() {
  // Try a few times to avoid an extremely unlikely code collision
  let code = ""
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateCode(6)
    const created = await redis.set(
      sessionKey(candidate),
      [] as never,
      { nx: true, ex: SESSION_TTL_SECONDS },
    )
    if (created === "OK") {
      code = candidate
      break
    }
  }

  if (!code) {
    return NextResponse.json(
      { error: "Could not create session, please try again." },
      { status: 500 },
    )
  }

  return NextResponse.json({
    code,
    expiresIn: SESSION_TTL_SECONDS,
  })
}
