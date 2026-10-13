// Two [start, end) night ranges overlap only if they share an actual night —
// a checkout on the same date as another booking's checkin is a normal
// same-day turnover, not a conflict.
export function nightsOverlap(startA: string | Date, endA: string | Date, startB: string | Date, endB: string | Date): boolean {
  const sA = new Date(startA).getTime(), eA = new Date(endA).getTime()
  const sB = new Date(startB).getTime(), eB = new Date(endB).getTime()
  if (isNaN(sA) || isNaN(eA) || isNaN(sB) || isNaN(eB)) return false
  return sA < eB && sB < eA
}
