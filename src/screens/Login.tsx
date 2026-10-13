import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Card, Field, Input, Button, Text, Title2, MessageBar, MessageBarBody, makeStyles, tokens,
} from '@fluentui/react-components'
import { LockClosedRegular } from '@fluentui/react-icons'
import { login } from '@/lib/authApi'
import { useAuth } from '@/app/auth'

const useStyles = makeStyles({
  page: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', backgroundColor: tokens.colorNeutralBackground2,
  },
  card: { width: '360px', padding: '32px 28px 28px', display: 'flex', flexDirection: 'column', gap: '4px' },
  brandRow: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' },
  brand: { color: tokens.colorNeutralForeground1, fontWeight: 700 },
  brandSub: {
    display: 'block', fontSize: '11px', letterSpacing: '0.14em', color: tokens.colorNeutralForeground3,
    textTransform: 'uppercase', marginBottom: '18px',
  },
  form: { display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '4px' },
})

/** Postgres backend's sign-in gate — see src/app/auth.tsx. The Dataverse build never renders this. */
export default function Login() {
  const s = useStyles()
  const { refresh } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () => login(email.trim(), password),
    onSuccess: () => refresh(),
  })

  const submit = () => {
    if (!email.trim() || !password || mutation.isPending) return
    mutation.mutate()
  }

  return (
    <div className={s.page}>
      <Card className={s.card}>
        <div className={s.brandRow}>
          <LockClosedRegular />
          <Title2 className={s.brand}>PropTrack</Title2>
        </div>
        <Text className={s.brandSub}>Sign in</Text>
        {mutation.isError && (
          <MessageBar intent="error" style={{ marginBottom: '4px' }}>
            <MessageBarBody>{mutation.error instanceof Error ? mutation.error.message : 'Sign-in failed.'}</MessageBarBody>
          </MessageBar>
        )}
        <div className={s.form} onKeyDown={(e) => { if (e.key === 'Enter') submit() }}>
          <Field label="Email">
            <Input type="email" value={email} onChange={(_, d) => setEmail(d.value)} autoFocus autoComplete="username" />
          </Field>
          <Field label="Password">
            <Input type="password" value={password} onChange={(_, d) => setPassword(d.value)} autoComplete="current-password" />
          </Field>
          <Button appearance="primary" disabled={mutation.isPending} onClick={submit}>
            {mutation.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
