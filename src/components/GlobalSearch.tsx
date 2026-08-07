import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { makeStyles, tokens, Input, Spinner, Text } from '@fluentui/react-components'
import { SearchRegular } from '@fluentui/react-icons'
import { Cr9b5_pt_propertiesService } from '@/generated/services/Cr9b5_pt_propertiesService'
import { Cr9b5_pt_contactsService } from '@/generated/services/Cr9b5_pt_contactsService'
import { Cr9b5_pt_invoicesService } from '@/generated/services/Cr9b5_pt_invoicesService'

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
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ResultItem[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    debounceRef.current = setTimeout(async () => {
      const esc = q.replace(/'/g, "''")
      const [propRes, conRes, invRes] = await Promise.all([
        Cr9b5_pt_propertiesService.getAll({ filter: `contains(cr9b5_name,'${esc}') or contains(cr9b5_shortid,'${esc}')`, top: 5 }),
        Cr9b5_pt_contactsService.getAll({ filter: `contains(cr9b5_name,'${esc}') or contains(cr9b5_taxid,'${esc}')`, top: 5 }),
        Cr9b5_pt_invoicesService.getAll({ filter: `contains(cr9b5_internalid,'${esc}') or contains(cr9b5_description,'${esc}')`, top: 5, orderBy: ['cr9b5_date desc'] }),
      ])
      const items: ResultItem[] = [
        ...(propRes.data ?? []).map(p => ({ id: p.cr9b5_pt_propertyid, label: p.cr9b5_name ?? '—', sub: p.cr9b5_shortid ?? '', kind: 'Property' as const })),
        ...(conRes.data ?? []).map(c => ({ id: c.cr9b5_pt_contactid, label: c.cr9b5_name ?? '—', sub: c.cr9b5_taxid ?? '', kind: 'Contact' as const })),
        ...(invRes.data ?? []).map(i => ({ id: i.cr9b5_pt_invoiceid, label: i.cr9b5_internalid ?? '—', sub: i.cr9b5_description ?? '', kind: 'Invoice' as const })),
      ]
      setResults(items)
      setLoading(false)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

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
          {loading ? (
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
