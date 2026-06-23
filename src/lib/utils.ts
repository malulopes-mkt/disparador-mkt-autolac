export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (!digits.startsWith('55')) digits = '55' + digits
  // Brazilian mobile numbers: 55 + 2-digit area code + 9-digit number = 13 digits
  // Meta webhook sometimes sends 12 digits (missing the leading 9 of the mobile)
  // Normalize 12-digit BR numbers to 13 by inserting the 9 after the area code
  if (digits.length === 12) {
    digits = digits.slice(0, 4) + '9' + digits.slice(4)
  }
  return '+' + digits
}

export function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 13) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`
  }
  if (digits.length === 12) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`
  }
  return phone
}

export function generatePhoneVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, '')
  const variants = ['+' + digits]
  if (digits.length === 13 && digits[4] === '9') {
    variants.push('+' + digits.slice(0, 4) + digits.slice(5))
  }
  if (digits.length === 12) {
    variants.push('+' + digits.slice(0, 4) + '9' + digits.slice(4))
  }
  return variants
}

export function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'agora'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export async function isInternalPhone(phone: string): Promise<boolean> {
  const { getSetting } = await import('./settings')
  const raw = await getSetting('INTERNAL_PHONES')
  if (!raw) return false
  const blocklist = new Set(raw.split(',').map(p => p.trim()).filter(Boolean))
  const variants = generatePhoneVariants(phone)
  for (const v of variants) {
    const digits = v.replace(/\D/g, '')
    if (blocklist.has(digits) || blocklist.has('+' + digits)) return true
  }
  return false
}
