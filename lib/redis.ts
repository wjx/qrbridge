import { Redis } from "@upstash/redis"

export const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

// Sessions expire after 30 minutes
export const SESSION_TTL_SECONDS = 30 * 60

// Characters used for short codes (no ambiguous 0/O/1/I)
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

export function generateCode(length = 6): string {
  let code = ""
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return code
}

export function sessionKey(code: string): string {
  return `qrbridge:session:${code.toUpperCase()}`
}

export interface SessionItem {
  id: string
  content: string
  createdAt: number
}
