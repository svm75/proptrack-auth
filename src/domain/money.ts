import Decimal from 'decimal.js'

export const D = (v: number | string | Decimal | null | undefined) => new Decimal(v ?? 0)
export const sum = (xs: Array<number | undefined | null>) =>
  xs.reduce<Decimal>((a, x) => a.plus(x ?? 0), new Decimal(0)).toNumber()
export const mul = (a: number, b: number) => D(a).times(b).toNumber()
export const div = (a: number, b: number) => (b === 0 ? 0 : D(a).div(b).toNumber())
export const round = (v: number, dp = 2) => D(v).toDecimalPlaces(dp, Decimal.ROUND_HALF_UP).toNumber()

/**
 * PropTrack is single-currency (EUR) today, so this doesn't need Wealth Ledger's
 * locale-preference toggle — but it follows the same `D`/`round`/`formatMoney` shape so the
 * two apps' domain layers read the same way. Output format matches the pre-migration
 * `fmtEur()` helper exactly (apostrophe thousands separator) to avoid a visual regression as
 * screens migrate over one at a time.
 */
export function formatMoney(amount: number | string | null | undefined, currencySymbol = '€'): string {
  if (amount == null || amount === '') return '—'
  const num = typeof amount === 'string' ? parseFloat(amount.replace(/[€\s']/g, '').replace(',', '.')) : amount
  if (isNaN(num)) return '—'
  const [int, dec] = round(num).toFixed(2).split('.')
  const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, "'")
  return `${currencySymbol} ${intFormatted}.${dec}`
}

export function formatMoneyShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1000) return `€${(n / 1000).toFixed(1)}k`
  return `€${n.toFixed(0)}`
}
