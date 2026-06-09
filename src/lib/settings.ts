import { prisma } from './db'

const cache = new Map<string, { value: string; ts: number }>()
const CACHE_TTL = 30_000 // 30 seconds

export async function getSetting(key: string): Promise<string> {
  // Check memory cache first
  const cached = cache.get(key)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.value
  }

  // Check database
  try {
    const row = await prisma.setting.findUnique({ where: { key } })
    if (row?.value) {
      cache.set(key, { value: row.value, ts: Date.now() })
      return row.value
    }
  } catch {
    // DB not ready yet, fall through to env
  }

  // Fallback to environment variable
  const envVal = process.env[key] || ''
  return envVal
}

export function clearSettingsCache() {
  cache.clear()
}
