import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { makeStyles, tokens, Input, Spinner, Text } from '@fluentui/react-components'
import { SearchRegular } from '@fluentui/react-icons'
import { useProperties, useContacts, useInvoices } from '@/hooks/data'

interface ResultItem { id: string; label: string; sub: string; kind: 'Property' | 'Contact' | 'Invoice' }

const useStyles = makeStyles({
  wrap: { position: 'relative', width: '260px' },
  input: { width: '100%' },
  panel: { position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusLarge, boxShadow: tokens.shadow16, zIndex: 100, maxHeight: '360px', overflowY: 'auto' },
  groupLabel: { padding: '8px 12px 4px', fontSize: '11px', fontWeight: 600, color: tokens.colorNeutralForeground4, textTransform: 'uppercase', letterSpacing: '0.04em' },
  item: { display: 'flex', flexDirection: 'column', padding: '8px 12px', cursor: 'pointer', textAlign: 'left', border: 'none', backgroundColor: 'transparent', width: '100%' },
  itemLabel: { fontSize: '13px', fontWeight: 500, color: tokens.colorNeutralForeground1 },
  itemSub: { fontSize: '11px', color: tokens.colorNeutralForeground4 },
  empty: { padding: '16px', textAlign: 'center', fontSize: '13px', color: tokens.colorNeutralForeground4 },
  loadingRow: { display: 'flex', justifyContent: 'center', padding: '12px' },
})

export function GlobalSearch() {
  const s = useStyles()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<ResultItem[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: properties = [], isLoading: loadingProps } = useProperties()
  const { data: contacts = [], isLoading: loadingContacts } = useContacts()
  const { data: invoices = [], isLoading: loadingInvoices } = useInvoices()
  const dataLoading = loadingProps || loadingContacts || loadingInvoices
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    debounceRef.current = setTimeout(() => {
      const needle = q.toLowerCase()
      const matches = (...vals: (string | undefined)[]) => vals.some(v => v?.toLowerCase().includes(needle))

      const propItems: ResultItem[] = properties
        .filter(p => matches(p.name, p.shortId))
        .slice(0, 5)
        .map(p => ({ id: p.id, label: p.name ?? '—', sub: p.shortId ?? '', kind: 'Property' as const }))
      const conItems: ResultItem[] = contacts
        .filter(c => matches(c.name, c.taxId))
        .slice(0, 5)
        .map(c => ({ id: c.id, label: c.name ?? '—', sub: c.taxId ?? '', kind: 'Contact' as const }))
      const invItems: ResultItem[] = invoices
        .filter(i => matches(i.internalId, i.description))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .slice(0, 5)
        .map(i => ({ id: i.id, label: i.internalId ?? '—', sub: i.description ?? '', kind: 'Invoice' as const }))

      setResults([...propItems, ...conItems, ...invItems])
      setLoading(false)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, properties, contacts, invoices])

  function goTo(item: ResultItem) {
    setOpen(false)
    setQuery('')
    if (item.kind === 'Property') navigate('/properties')
    else if (item.kind === 'Contact') navigate('/contacts')
    else navigate(`/invoices?search=${encodeURIComponent(item.label)}`)
  }

  const grouped: { kind: ResultItem['kind']; items: ResultItem[] }[] = (['Property', 'Contact', 'Invoice'] as const)
    .map(kind => ({ kind, items: results.filter(r => r.kind === kind) }))
    .filter(g => g.items.length > 0)

  return (
    <div className={s.wrap} ref={rootRef}>
      <Input
        className={s.input}
        contentBefore={<SearchRegular />}
        placeholder="Search properties, contacts, invoices…"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(_, d) => { setQuery(d.value); setOpen(true) }}
      />
      {open && query.trim().length >= 2 && (
        <div className={s.panel}>
          {loading || dataLoading ? (
            <div className={s.loadingRow}><Spinner size="tiny" label="Searching…" /></div>
          ) : grouped.length === 0 ? (
            <div className={s.empty}>No matches.</div>
          ) : grouped.map(g => (
            <div key={g.kind}>
              <Text className={s.groupLabel}>{g.kind}{g.items.length > 1 ? 's' : ''}</Text>
              {g.items.map(item => (
                <button key={item.id} className={s.item} onClick={() => goTo(item)}>
                  <span className={s.itemLabel}>{item.label}</span>
                  {item.sub && <span className={s.itemSub}>{item.sub}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
