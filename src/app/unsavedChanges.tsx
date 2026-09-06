import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions } from '@fluentui/react-components'
import { UnsavedChangesContext, type UnsavedChangesGuard } from './unsavedChangesContext'

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const guardRef = useRef<UnsavedChangesGuard | null>(null)
  const [pendingTo, setPendingTo] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const registerGuard = useCallback((guard: UnsavedChangesGuard | null) => { guardRef.current = guard }, [])

  const guardedNavigate = useCallback((to: string) => {
    if (guardRef.current?.dirty) { setPendingTo(to); return }
    navigate(to)
  }, [navigate])

  const value = useMemo(() => ({ registerGuard, guardedNavigate }), [registerGuard, guardedNavigate])

  async function handleSave() {
    if (!guardRef.current || !pendingTo) return
    setSaving(true)
    try {
      const ok = await guardRef.current.onSave()
      setSaving(false)
      if (ok) { const to = pendingTo; setPendingTo(null); navigate(to) }
    } catch {
      setSaving(false)
    }
  }
  function handleDiscard() {
    if (!pendingTo) return
    guardRef.current?.onReset()
    const to = pendingTo
    setPendingTo(null)
    navigate(to)
  }
  function handleCancel() { setPendingTo(null) }

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      <Dialog open={pendingTo !== null} onOpenChange={(_, d) => { if (!d.open) handleCancel() }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogContent>You have unsaved changes on this page. Save them before leaving, or discard them?</DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={handleCancel} disabled={saving}>Cancel</Button>
              <Button appearance="secondary" onClick={handleDiscard} disabled={saving}>Discard changes</Button>
              <Button appearance="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </UnsavedChangesContext.Provider>
  )
}
