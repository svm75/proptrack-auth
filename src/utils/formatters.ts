export function fmtEur(n: number | string | undefined | null): string {
  if (n == null || n === '') return '—'
  const num = typeof n === 'string' ? parseFloat(n.replace(/[€\s']/g, '').replace(',', '.')) : n
  if (isNaN(num)) return '—'
  const [int, dec] = num.toFixed(2).split('.')
  const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, "'")
  return `€ ${intFormatted}.${dec}`
}

export function fmtEurShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1000) return `€${(n / 1000).toFixed(1)}k`
  return `€${n.toFixed(0)}`
}
