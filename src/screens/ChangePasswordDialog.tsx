import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
  Button, Field, Input, MessageBar, MessageBarBody,
} from '@fluentui/react-components'
import { changeOwnPassword } from '@/lib/authApi'

/** Self-service password change — anyone signed in, own account only. The admin-only "Set
 *  password" in Admin → Users, by contrast, resets someone ELSE's forgotten password with no
 *  current-password check. */
export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [done, setDone] = useState(false)

  const mutation = useMutation({
    mutationFn: () => changeOwnPassword(currentPassword, newPassword),
    onSuccess: () => setDone(true),
  })

  const reset = () => { setCurrentPassword(''); setNewPassword(''); setDone(false); mutation.reset(); onClose() }

  return (
    <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) reset() }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Change your password</DialogTitle>
          <DialogContent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '4px' }}>
              {done ? (
                <MessageBar intent="success"><MessageBarBody>Password changed.</MessageBarBody></MessageBar>
              ) : (
                <>
                  {mutation.isError && (
                    <MessageBar intent="error">
                      <MessageBarBody>{mutation.error instanceof Error ? mutation.error.message : 'Could not change password.'}</MessageBarBody>
                    </MessageBar>
                  )}
                  <Field label="Current password" required><Input type="password" value={currentPassword} onChange={(_, d) => setCurrentPassword(d.value)} /></Field>
                  <Field label="New password" required><Input type="password" value={newPassword} onChange={(_, d) => setNewPassword(d.value)} placeholder="At least 8 characters" /></Field>
                </>
              )}
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={reset}>{done ? 'Close' : 'Cancel'}</Button>
            {!done && (
              <Button
                appearance="primary" disabled={mutation.isPending || !currentPassword || newPassword.length < 8}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? 'Saving…' : 'Change password'}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
