import { createContext, useContext, useEffect, useRef } from 'react'

export interface UnsavedChangesGuard {
  dirty: boolean
  onSave: () => Promise<boolean>
  onReset: () => void
}

export interface UnsavedChangesContextValue {
  registerGuard: (guard: UnsavedChangesGuard | null) => void
  guardedNavigate: (to: string) => void
}

export const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null)

/**
 * Lets a screen with an inline-editable form register itself as "dirty" so that
 * in-app navigation (sidebar links) and tab close/refresh both prompt the user
 * to save or discard before leaving. Pass a fresh `guard` each render; it's
 * unregistered automatically on unmount.
 */
export function useUnsavedChangesGuard(guard: UnsavedChangesGuard) {
  const ctx = useContext(UnsavedChangesContext)
  const guardRef = useRef(guard)
  useEffect(() => { guardRef.current = guard })

  useEffect(() => {
    if (!ctx) return
    ctx.registerGuard({
      get dirty() { return guardRef.current.dirty },
      onSave: () => guardRef.current.onSave(),
      onReset: () => guardRef.current.onReset(),
    } as UnsavedChangesGuard)
    return () => ctx.registerGuard(null)
  }, [ctx])

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!guardRef.current.dirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])
}

export function useGuardedNavigate() {
  const ctx = useContext(UnsavedChangesContext)
  return ctx?.guardedNavigate ?? ((to: string) => { window.location.href = to })
}
