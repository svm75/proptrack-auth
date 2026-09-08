import { makeCrudRepo } from './genericRepo.js'

export interface OwnerOccupancyRow {
  id: string
  name: string | null
  property_id: string
  from_date: string
  to_date: string
  adults: number | null
  children: number | null
  babies: number | null
  created_at: string
  updated_at: string
}

// Overlap conflict detection deliberately stays client-side only (nightsOverlap() in
// src/domain/dateRanges.ts, migration.md §Business Rule Placement) — no server-side check here.
export const ownerOccupanciesRepo = makeCrudRepo<OwnerOccupancyRow>(
  'owner_occupancies',
  ['name', 'property_id', 'from_date', 'to_date', 'adults', 'children', 'babies'],
  'from_date DESC',
)
