import { useState, useEffect, useRef } from 'react'

// ── Column definitions ────────────────────────────────────────────────────────

export interface ExportColumn {
  key:       string
  label:     string
  mandatory?: boolean
}

export const ALL_COLUMNS: ExportColumn[] = [
  { key: 'Internal ID',    label: 'Internal ID',    mandatory: true },
  { key: 'Type',           label: 'Type' },
  { key: 'Category',       label: 'Category' },
  { key: 'Property',       label: 'Property' },
  { key: 'All Properties', label: 'All Properties' },
  { key: 'Contact (TaxID)', label: 'Contact (TaxID)' },
  { key: 'Date',           label: 'Date' },
  { key: 'Description',    label: 'Description' },
  { key: 'Booking Ref',    label: 'Booking Ref' },
  { key: 'Check-in',       label: 'Check-in' },
  { key: 'Check-out',      label: 'Check-out' },
  { key: 'Nights',         label: 'Nights' },
  { key: 'Days',           label: 'Days' },
  { key: 'Adults',         label: 'Adults' },
  { key: 'Children',       label: 'Children' },
  { key: 'Babies',         label: 'Babies' },
  { key: 'Base Amount',    label: 'Base Amount' },
  { key: 'Tax Rate',       label: 'Tax Rate' },
  { key: 'Tax Amount',     label: 'Tax Amount' },
  { key: 'Total Gross',    label: 'Total Gross' },
]

const DEFAULT_COLUMNS = ALL_COLUMNS.map(c => c.key)
const STORAGE_KEY     = 'proptrack_export_formats'

// ── Format persistence ────────────────────────────────────────────────────────

export interface ExportFormat {
  name:    string
  columns: string[]
}

function loadFormats(): ExportFormat[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ExportFormat[]) : []
  } catch {
    return []
  }
}

function saveFormats(formats: ExportFormat[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(formats))
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  rowCount: number
  onExport: (orderedColumns: string[]) => void
  onClose:  () => void
}

export default function ExportConfigModal({ rowCount, onExport, onClose }: Props) {
  const [orderedCols, setOrderedCols] = useState<string[]>(DEFAULT_COLUMNS)
  const [formats,     setFormats]     = useState<ExportFormat[]>([])
  const [savePrompt,  setSavePrompt]  = useState(false)
  const [newName,     setNewName]     = useState('')
  const [selectedFmt, setSelectedFmt] = useState<string>('')

  // Drag state
  const dragIdx   = useRef<number | null>(null)
  const dragOver  = useRef<number | null>(null)
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

  function selectAll() {
    setOrderedCols(ALL_COLUMNS.map(c => c.key))
    markChanged()
  }

  function deselectAll() {
    setOrderedCols(ALL_COLUMNS.filter(c => c.mandatory).map(c => c.key))
    markChanged()
  }

  // ── Drag and drop ──────────────────────────────────────────────────────────

  function onDragStart(idx: number) {
    dragIdx.current = idx
  }

  function onDragEnter(idx: number) {
    dragOver.current = idx
    setDropTarget(idx)
  }

  function onDragEnd() {
    const from = dragIdx.current
    const to   = dragOver.current
    if (from !== null && to !== null && from !== to) {
      setOrderedCols(prev => {
        const next = [...prev]
        const [item] = next.splice(from, 1)
        next.splice(to, 0, item)
        return next
      })
      markChanged()
    }
    dragIdx.current  = null
    dragOver.current = null
    setDropTarget(null)
  }

  // ── Formats ────────────────────────────────────────────────────────────────

  function applyFormat(name: string) {
    const fmt = formats.find(f => f.name === name)
    if (!fmt) return
    const withMandatory = fmt.columns.includes('Internal ID') ? fmt.columns : ['Internal ID', ...fmt.columns]
    setOrderedCols(withMandatory)
    setSelectedFmt(name)
  }

  function saveFormat() {
    const trimmed = newName.trim()
    if (!trimmed) return
    const updated = [...formats.filter(f => f.name !== trimmed), { name: trimmed, columns: orderedCols }]
    saveFormats(updated)
    setFormats(updated)
    setSelectedFmt(trimmed)
    setSavePrompt(false)
    setNewName('')
  }

  function deleteFormat(name: string) {
    const updated = formats.filter(f => f.name !== name)
    saveFormats(updated)
    setFormats(updated)
    if (selectedFmt === name) setSelectedFmt('')
  }

  const disabledCols = ALL_COLUMNS.filter(c => !enabledSet.has(c.key))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Export Excel — Configure Columns</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* Saved formats */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Saved Formats</p>
            {formats.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No saved formats yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {formats.map(f => (
                  <div key={f.name} className="flex items-center gap-1">
                    <button
                      onClick={() => applyFormat(f.name)}
                      className={[
                        'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                        selectedFmt === f.name
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400',
                      ].join(' ')}
                    >
                      {f.name}
                    </button>
                    <button
                      onClick={() => deleteFormat(f.name)}
                      className="text-gray-300 hover:text-red-500 text-xs leading-none"
                      title="Delete format"
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Enabled columns — with drag & drop */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Column Order &amp; Selection
                <span className="ml-2 font-normal text-gray-400 normal-case">({orderedCols.length} of {ALL_COLUMNS.length} enabled)</span>
              </p>
              <div className="flex gap-2 text-xs">
                <button
                  onClick={selectAll}
                  disabled={allNonMandatorySelected}
                  className="text-indigo-600 hover:text-indigo-800 disabled:opacity-30 font-medium"
                >
                  Select all
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={deselectAll}
                  disabled={nonMandatoryEnabled.length === 0}
                  className="text-indigo-600 hover:text-indigo-800 disabled:opacity-30 font-medium"
                >
                  Deselect all
                </button>
              </div>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden">
              {orderedCols.map((key, idx) => {
                const col = ALL_COLUMNS.find(c => c.key === key)
                if (!col) return null
                const isDropHere = dropTarget === idx && dragIdx.current !== idx
                return (
                  <div
                    key={key}
                    draggable
                    onDragStart={() => onDragStart(idx)}
                    onDragEnter={() => onDragEnter(idx)}
                    onDragOver={e => e.preventDefault()}
                    onDragEnd={onDragEnd}
                    className={[
                      'flex items-center gap-2 px-3 py-2 border-b border-gray-100 last:border-0 select-none transition-colors',
                      isDropHere ? 'bg-indigo-50 border-t-2 border-t-indigo-400' : 'bg-white hover:bg-gray-50',
                    ].join(' ')}
                  >
                    {/* Drag handle */}
                    <span className="text-gray-300 cursor-grab active:cursor-grabbing text-sm leading-none pr-0.5" title="Drag to reorder">⠿</span>
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked
                      disabled={col.mandatory}
                      onChange={() => toggle(key)}
                      className="rounded border-gray-300 text-indigo-600 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <span className={['text-sm flex-1', col.mandatory ? 'font-semibold text-gray-700' : 'text-gray-700'].join(' ')}>
                      {col.label}
                      {col.mandatory && <span className="ml-1.5 text-xs text-gray-400">(required)</span>}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Excluded columns */}
          {disabledCols.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Excluded Columns</p>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                {disabledCols.map(col => (
                  <div key={col.key} className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 last:border-0 bg-gray-50 hover:bg-gray-100">
                    <span className="w-4" />
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => toggle(col.key)}
                      className="rounded border-gray-300 text-indigo-600 cursor-pointer"
                    />
                    <span className="text-sm text-gray-400">{col.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Save format */}
          {savePrompt ? (
            <div className="flex gap-2 items-center">
              <input
                autoFocus
                type="text"
                placeholder="Format name…"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveFormat(); if (e.key === 'Escape') setSavePrompt(false) }}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button onClick={saveFormat} className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">Save</button>
              <button onClick={() => setSavePrompt(false)} className="px-3 py-1.5 bg-white border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setSavePrompt(true)} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
              + Save current configuration as format…
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <span className="text-xs text-gray-400">{rowCount} row{rowCount !== 1 ? 's' : ''} will be exported</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={() => onExport(orderedCols)}
              className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700"
            >
              ↓ Export {orderedCols.length} columns
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
