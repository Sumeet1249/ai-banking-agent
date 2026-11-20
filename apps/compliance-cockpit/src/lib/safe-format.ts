// src/lib/safe-format.ts
export function parseMaybeJson<T = Record<string, unknown>>(value: unknown): T {
  if (value == null) return {} as T
  if (typeof value === 'object') return value as T
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return (typeof parsed === 'object' && parsed !== null ? parsed : { value: parsed }) as T
    } catch {
      return { raw: value } as T
    }
  }
  return { value } as T
}

export interface PayloadEntry {
  key: string
  value: string
}

export function extractNodePayloadEntries(input: unknown, maxEntries = 4): PayloadEntry[] {
  if (input == null) return []
  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
    const str = String(input)
    return [{ key: 'value', value: str.length > 72 ? `${str.slice(0, 69)}…` : str }]
  }

  const obj = parseMaybeJson<Record<string, unknown>>(input)
  return Object.entries(obj)
    .slice(0, maxEntries)
    .map(([key, val]) => {
      let formatted: string
      if (val == null) {
        formatted = 'null'
      } else if (typeof val === 'object') {
        const serialized = JSON.stringify(val)
        formatted = serialized.length > 56 ? `${serialized.slice(0, 53)}…` : serialized
      } else {
        const str = String(val)
        formatted = str.length > 56 ? `${str.slice(0, 53)}…` : str
      }
      return { key, value: formatted }
    })
}

export function formatPaiseToINR(paise: number): string {
  const rupees = paise / 100
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees)
}
