// Chart/KPI data palette — see docs/layout.md §2 for the full spec and rationale.

export const dataColors = {
  positive: '#10B981', // gains, success, "on track"
  negative: '#EF4444', // losses, failure, risk
  informational: '#2563EB', // single-series historical/informational trend line
  assetBlue: '#2563EB', // asset class 1 — "trustworthy"
  assetViolet: '#7C3AED', // asset class 2 — "substance"
  assetAmber: '#F59E0B', // asset class 3 — commodities/alternatives
  assetSlate: '#94A3B8', // asset class 4 — cash/liquidity (deliberately least prominent)
} as const

// Fixed-order categorical set — same index always maps to the same color across
// every chart in the app.
export const categoricalPalette = [
  '#2F3538', // anthracite
  '#2563EB', // blue
  '#10B981', // green
  '#7C3AED', // violet
  '#F59E0B', // amber
  '#94A3B8', // slate
] as const

// Single-hue sequential ramp (heatmaps, magnitude scales) derived from the
// informational blue — don't reuse the categorical set here, it reads as
// "category" rather than "intensity".
export const sequentialPalette = [
  '#F1F5FE',
  '#D6E4FC',
  '#A8C5F8',
  '#6D9AF0',
  '#2563EB',
  '#1E3A8A',
] as const
