import { useEffect, useState } from 'react'
import { MessageBar, MessageBarBody, Button, makeStyles } from '@fluentui/react-components'
import { useQueryClient } from '@tanstack/react-query'
import { DismissRegular } from '@fluentui/react-icons'

const useStyles = makeStyles({
  banner: { marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  body: { flex: 1 },
})

export function QueryErrorBanner() {
  const s = useStyles()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe(event => {
      if (event.query.state.error) {
        const err = event.query.state.error
        setError(err instanceof Error ? err.message : String(err))
      }
    })
    return unsubscribe
  }, [queryClient])

  if (!error) return null

  return (
    <MessageBar intent="error" className={s.banner}>
      <MessageBarBody className={s.body}>{error}</MessageBarBody>
      <Button
        appearance="subtle"
        size="small"
        icon={<DismissRegular />}
        onClick={() => setError(null)}
        aria-label="Dismiss error"
      />
    </MessageBar>
  )
}
