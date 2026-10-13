import { useState, useEffect, useRef } from 'react'
import {
  makeStyles, tokens, Button, Input, Checkbox, Text,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
} from '@fluentui/react-components'

export interface ExportColumn { key: string; label: string; mandatory?: boolean }

export const ALL_COLUMNS: ExportColumn[] = [
  { key: 'Internal ID', label: 'Internal ID', mandatory: true },
  { key: 'Type', label: 'Type' },
  { key: 'Category', label: 'Category' },
  { key: 'Property', label: 'Property' },
  { key: 'All Properties', label: 'All Properties' },
  { key: 'Contact (TaxID)', label: 'Contact (TaxID)' },
  { key: 'Date', label: 'Date' },
  { key: 'Description', label: 'Description' },
  { key: 'Booking Ref', label: 'Booking Ref' },
  { key: 'Check-in', label: 'Check-in' },
  { key: 'Check-out', label: 'Check-out' },
  { key: 'Nights', label: 'Nights' },
  { key: 'Days', label: 'Days' },
  { key: 'Adults', label: 'Adults' },
  { key: 'Children', label: 'Children' },
  { key: 'Babies', label: 'Babies' },
  { key: 'Base Amount', label: 'Base Amount' },
  { key: 'Tax Rate', label: 'Tax Rate' },
  { key: 'Tax Amount', label: 'Tax Amount' },
  { key: 'Total Gross', label: 'Total Gross' },
]

const DEFAULT_COLUMNS = ALL_COLUMNS.map(c => c.key)
const STORAGE_KEY = 'proptrack_export_formats'

export interface ExportFormat { name: string; columns: string[] }

function loadFormats(): ExportFormat[] {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? (JSON.parse(raw) as ExportFormat[]) : [] } catch { return [] }
}
function saveFormats(formats: ExportFormat[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(formats)) }

const useStyles = makeStyles({
  section: { marginBottom: '20px' },
  sectionTitle: { fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: tokens.colorNeutralForeground3, marginBottom: '8px', display: 'block' },
  list: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusLarge, overflow: 'hidden' },
  row: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  rowDisabled: { backgroundColor: tokens.colorNeutralBackground2 },
  dropTarget: { backgroundColor: tokens.colorBrandBackground2, borderTop: `2px solid ${tokens.colorBrandStroke1}` },
  footer: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
})

interface Props { rowCount: number; onExport: (orderedColumns: string[]) => void; onClose: () => void }

export default function ExportConfigModal({ rowCount, onExport, onClose }: Props) {
  const s = useStyles()
  const [orderedCols, setOrderedCols] = useState<string[]>(DEFAULT_COLUMNS)
  const [formats, setFormats] = useState<ExportFormat[]>([])
  const [savePrompt, setSavePrompt] = useState(false)
  const [newName, setNewName] = useState('')
  const [selectedFmt, setSelectedFmt] = useState('')

  const dragIdx = useRef<number | null>(null)
  const dragOver = useRef<number | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)

  useEffect(() => { setFormats(loadFormats()) }, [])

  const enabledSet = new Set(orderedCols)
  const nonMandatoryEnabled = orderedCols.filter(k => !ALL_COLUMNS.find(c => c.key === k)?.mandatory)
  const allNonMandatorySelected = nonMandatoryEnabled.length === ALL_COLUMNS.filter(c => !c.mandatory).length

  function markChanged() { setSelectedFmt('') }
  function toggle(key: string) {
    const col = ALL_COLUMNS.find(c => c.key === key)
    if (col?.mandatory) return
    setOrderedCols(prev => enabledSet.has(key) ? prev.filter(k => k !== key) : [...prev, key])
    markChanged()
  }
  function selectAll() { setOrderedCols(ALL_COLUMNS.map(c => c.key)); markChanged() }
  function deselectAll() { setOrderedCols(ALL_COLUMNS.filter(c => c.mandatory).map(c => c.key)); markChanged() }

  function onDragStart(idx: number) { dragIdx.current = idx }
  function onDragEnter(idx: number) { dragOver.current = idx; setDropTarget(idx) }
  function onDragEnd() {
    const from = dragIdx.current, to = dragOver.current
    if (from !== null && to !== null && from !== to) {
      setOrderedCols(prev => { const next = [...prev]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next })
      markChanged()
    }
    dragIdx.current = null; dragOver.current = null; setDropTarget(null)
  }

  function applyFormat(name: string) {
    const fmt = formats.find(f => f.name === name)
    if (!fmt) return
    setOrderedCols(fmt.columns.includes('Internal ID') ? fmt.columns : ['Internal ID', ...fmt.columns])
    setSelectedFmt(name)
  }
  function saveFormat() {
    const trimmed = newName.trim()
    if (!trimmed) return
    const updated = [...formats.filter(f => f.name !== trimmed), { name: trimmed, columns: orderedCols }]
    saveFormats(updated); setFormats(updated); setSelectedFmt(trimmed); setSavePrompt(false); setNewName('')
  }
  function deleteFormat(name: string) {
    const updated = formats.filter(f => f.name !== name)
    saveFormats(updated); setFormats(updated)
    if (selectedFmt === name) setSelectedFmt('')
  }

  const disabledCols = ALL_COLUMNS.filter(c => !enabledSet.has(c.key))

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: '560px' }}>
        <DialogBody>
          <DialogTitle>Export Excel — Configure Columns</DialogTitle>
          <DialogContent style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            <div className={s.section}>
              <Text className={s.sectionTitle}>Saved Formats</Text>
              {formats.length === 0 ? (
                <Text size={200} style={{ fontStyle: 'italic', color: tokens.colorNeutralForeground4 }}>No saved formats yet.</Text>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {formats.map(f => (
                    <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Button size="small" appearance={selectedFmt === f.name ? 'primary' : 'outline'} shape="circular" onClick={() => applyFormat(f.name)}>{f.name}</Button>
                      <Button size="small" appearance="transparent" onClick={() => deleteFormat(f.name)} title="Delete format">✕</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={s.section}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <Text className={s.sectionTitle} style={{ marginBottom: 0 }}>
                  Column Order &amp; Selection <Text size={200} style={{ color: tokens.colorNeutralForeground4, textTransform: 'none', fontWeight: 400 }}>({orderedCols.length} of {ALL_COLUMNS.length} enabled)</Text>
                </Text>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button size="small" appearance="transparent" disabled={allNonMandatorySelected} onClick={selectAll}>Select all</Button>
                  <Button size="small" appearance="transparent" disabled={nonMandatoryEnabled.length === 0} onClick={deselectAll}>Deselect all</Button>
                </div>
              </div>
              <div className={s.list}>
                {orderedCols.map((key, idx) => {
                  const col = ALL_COLUMNS.find(c => c.key === key)
                  if (!col) return null
                  const isDropHere = dropTarget === idx && dragIdx.current !== idx
                  return (
                    <div
                      key={key} draggable
                      onDragStart={() => onDragStart(idx)} onDragEnter={() => onDragEnter(idx)}
                      onDragOver={e => e.preventDefault()} onDragEnd={onDragEnd}
                      className={`${s.row} ${isDropHere ? s.dropTarget : ''}`}
                      style={{ cursor: 'grab' }}
                    >
                      <span style={{ color: tokens.colorNeutralForeground4, fontSize: '13px' }} title="Drag to reorder">⠿</span>
                      <Checkbox checked disabled={col.mandatory} onChange={() => toggle(key)} />
                      <Text weight={col.mandatory ? 'semibold' : 'regular'} style={{ flex: 1 }}>
                        {col.label}{col.mandatory && <Text size={200} style={{ color: tokens.colorNeutralForeground4, marginLeft: 6 }}>(required)</Text>}
                      </Text>
                    </div>
                  )
                })}
              </div>
            </div>

            {disabledCols.length > 0 && (
              <div className={s.section}>
                <Text className={s.sectionTitle}>Excluded Columns</Text>
                <div className={s.list}>
                  {disabledCols.map(col => (
                    <div key={col.key} className={`${s.row} ${s.rowDisabled}`}>
                      <span style={{ width: 16 }} />
                      <Checkbox checked={false} onChange={() => toggle(col.key)} />
                      <Text style={{ color: tokens.colorNeutralForeground4 }}>{col.label}</Text>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {savePrompt ? (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Input autoFocus placeholder="Format name…" value={newName} onChange={(_, d) => setNewName(d.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveFormat(); if (e.key === 'Escape') setSavePrompt(false) }} style={{ flex: 1 }} />
                <Button appearance="primary" size="small" onClick={saveFormat}>Save</Button>
                <Button appearance="secondary" size="small" onClick={() => setSavePrompt(false)}>Cancel</Button>
              </div>
            ) : (
              <Button appearance="transparent" onClick={() => setSavePrompt(true)}>+ Save current configuration as format…</Button>
            )}
          </DialogContent>
          <DialogActions>
            <div className={s.footer}>
              <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>{rowCount} row{rowCount !== 1 ? 's' : ''} will be exported</Text>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button appearance="secondary" onClick={onClose}>Cancel</Button>
                <Button appearance="primary" onClick={() => onExport(orderedCols)}>↓ Export {orderedCols.length} columns</Button>
              </div>
            </div>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
