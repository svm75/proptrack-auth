import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  makeStyles, tokens, Button, Input, Field, Textarea, Text, Spinner, Badge,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
  Table, TableHeader, TableRow, TableHeaderCell, TableBody, TableCell,
} from '@fluentui/react-components'
import {
  useProperties, useContacts, useInvoices, useAttachments, useReferenceData,
  useRecordActivity, useSaveProperty, useDeleteProperty, usePropertyDeletable,
  useDeleteAttachment,
} from '@/hooks/data'
import { ActivityAction, ActivityTable, InvoiceType } from '@/domain/types'
import type { Property, Invoice, Attachment } from '@/domain/types'
import { formatMoney } from '@/domain/money'
import { isPostgresBackend } from '@/data/backend'
import { listFolders, createFolder, uploadDocument, deleteDocument, documentDownloadUrl, type FolderEntry } from '@/services/documents'
import InvoiceForm from './InvoiceForm'
import PropertyConnectionDiagram from './PropertyConnectionDiagram'

const PROP_REF_TYPE = 233100000

const useStyles = makeStyles({
  root: { display: 'flex', height: '100%', overflow: 'hidden', gap: '0' },
  left: { width: '50%', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: `1px solid ${tokens.colorNeutralStroke2}` },
  leftHeader: { padding: '16px 24px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flex: 1, overflowY: 'auto', padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  card: { backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusLarge, padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', cursor: 'pointer' },
  right: { flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: tokens.colorNeutralBackground2 },
  emptyState: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' },
  overlay: { position: 'absolute', inset: 0, display: 'flex' },
  clickOutside: { flex: 1, cursor: 'pointer' },
  panel: { flex: '0 0 66%', backgroundColor: tokens.colorNeutralBackground1, borderLeft: `1px solid ${tokens.colorNeutralStroke2}`, boxShadow: tokens.shadow28, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  panelHeader: { padding: '12px 16px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' },
  sectionHeader: { padding: '8px 16px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  scrollSection: { overflowY: 'auto', flex: 1 },
})

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface PropForm { id: string | null; name: string; shortid: string; address: string; notes: string }
const EMPTY_FORM: PropForm = { id: null, name: '', shortid: '', address: '', notes: '' }

// NAS-native document storage. Uploads go to /documents (api/src/routes/documentsRoutes.ts) and
// are only available when this build is wired to the Postgres/NAS backend — see isPostgresBackend
// in src/data/backend.ts. Google Drive has been fully removed (zero attachment rows referenced
// it in production); on the legacy Power Platform/Dataverse backend the upload UI stays visible
// but disabled, per migration.md's Google-removal addendum.
interface AttachForm { typeRefId: string; file: File | null }
const EMPTY_ATTACH: AttachForm = { typeRefId: '', file: null }

interface YearSummary { year: number; income: number; expenses: number }

export default function Properties() {
  const s = useStyles()
  const recordActivity = useRecordActivity()
  const [searchParams, setSearchParams] = useSearchParams()

  const { data: properties = [], isLoading: loadingProps } = useProperties()
  const { data: contactsList = [], isLoading: loadingContacts } = useContacts()
  const { data: invoices = [], isLoading: loadingInvoices } = useInvoices()
  const { data: allAttachments = [] } = useAttachments()
  const { data: referenceData = [] } = useReferenceData()

  const saveProperty = useSaveProperty()
  const deleteProperty = useDeleteProperty()
  const propertyDeletable = usePropertyDeletable()
  const deleteAttachmentMutation = useDeleteAttachment()

  const loading = loadingProps || loadingContacts || loadingInvoices
  const [saving, setSaving] = useState(false)

  const invoiceCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const inv of invoices) {
      if (inv.propertyId) counts[inv.propertyId] = (counts[inv.propertyId] ?? 0) + 1
    }
    return counts
  }, [invoices])

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<PropForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)

  const [diagramPropId, setDiagramPropId] = useState<string | null>(null)
  const diagramInvoices = useMemo(
    () => diagramPropId ? invoices.filter(i => i.propertyId === diagramPropId) : [],
    [invoices, diagramPropId],
  )

  function openDiagram(propId: string) {
    setDiagramPropId(propId)
  }

  const [selectedPropId, setSelectedPropId] = useState<string | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null)

  const [attachOpen, setAttachOpen] = useState(false)
  const [attachForm, setAttachForm] = useState<AttachForm>(EMPTY_ATTACH)
  const [attachSaving, setAttachSaving] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // NAS document folder browser state — starts at Properties/<name> for the selected property.
  const [docPath, setDocPath] = useState('')
  const [docFolders, setDocFolders] = useState<FolderEntry[]>([])
  const [docLoading, setDocLoading] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  const contactById = useMemo(() => new Map(contactsList.map(c => [c.id, c])), [contactsList])

  const attachments = useMemo(
    () => allAttachments.filter(a => a.propertyId === selectedPropId),
    [allAttachments, selectedPropId],
  )
  const attachRefTypes = useMemo(
    () => referenceData.filter(r => r.referenceType === PROP_REF_TYPE),
    [referenceData],
  )

  // Deep-link support from the global Quick Add menu (?new=1)
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openNew()
      setSearchParams(p => { p.delete('new'); return p }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams])

  function openNew() { setForm(EMPTY_FORM); setFormError(null); setFormOpen(true) }
  function openEdit(p: Property) {
    setForm({ id: p.id, name: p.name, shortid: p.shortId, address: p.address, notes: p.notes ?? '' })
    setFormError(null); setFormOpen(true)
  }
  function closeForm() { setFormOpen(false); setForm(EMPTY_FORM); setFormError(null) }

  async function handleSaveProperty() {
    if (!form.name.trim() || !form.shortid.trim() || !form.address.trim()) {
      setFormError('Name, Short ID, and Address are required.')
      return
    }
    const shortIdUpper = form.shortid.trim().toUpperCase()
    const duplicate = properties.find(p => p.shortId.toUpperCase() === shortIdUpper && p.id !== form.id)
    if (duplicate) {
      setFormError(`Short ID "${shortIdUpper}" is already used by "${duplicate.name}".`)
      return
    }
    setFormError(null)
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(), shortId: shortIdUpper,
        address: form.address.trim(), notes: form.notes.trim() || undefined,
      }
      if (form.id) {
        await saveProperty.mutateAsync({ id: form.id, ...payload })
        recordActivity.mutate({ action: ActivityAction.Updated, table: ActivityTable.Property, recordName: form.name.trim() })
      } else {
        await saveProperty.mutateAsync(payload)
        recordActivity.mutate({ action: ActivityAction.Created, table: ActivityTable.Property, recordName: form.name.trim() })
      }
      closeForm()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteProperty(p: Property) {
    const result = await propertyDeletable.mutateAsync(p.id)
    if (!result.deletable) { alert(result.reason ?? `Cannot delete — "${p.name}" is referenced elsewhere.`); return }
    if (!confirm(`Delete property "${p.name}"?`)) return
    await deleteProperty.mutateAsync(p.id)
    recordActivity.mutate({ action: ActivityAction.Deleted, table: ActivityTable.Property, recordName: p.name })
    if (selectedPropId === p.id) setSelectedPropId(null)
  }

  function openDetail(propId: string) {
    if (selectedPropId === propId) { setSelectedPropId(null); return }
    setSelectedPropId(propId); setAttachOpen(false)
    const invs = invoices.filter(i => i.propertyId === propId)
    const years = Array.from(new Set(
      invs.map(i => i.date ? new Date(i.date).getFullYear() : null).filter((y): y is number => y !== null && y > 2020)
    )).sort((a, b) => b - a)
    setSelectedYear(years[0] ?? null)
  }
  function closeDetail() { setSelectedPropId(null); setAttachOpen(false) }

  const propInvoices = useMemo(
    () => selectedPropId ? invoices.filter(i => i.propertyId === selectedPropId) : [],
    [invoices, selectedPropId],
  )

  const yearSummaries: YearSummary[] = useMemo(() => {
    const map = new Map<number, YearSummary>()
    for (const inv of propInvoices) {
      if (!inv.date) continue
      const y = new Date(inv.date).getFullYear()
      if (y <= 2020) continue
      if (!map.has(y)) map.set(y, { year: y, income: 0, expenses: 0 })
      const summary = map.get(y)!
      const gross = inv.totalGross ?? 0
      if (inv.type === InvoiceType.Income) summary.income += gross
      else summary.expenses += gross
    }
    return Array.from(map.values()).sort((a, b) => b.year - a.year)
  }, [propInvoices])

  const yearInvoices = propInvoices.filter(inv => inv.date && selectedYear && new Date(inv.date).getFullYear() === selectedYear)

  function contactName(inv: Invoice): string {
    return (inv.contactId && contactById.get(inv.contactId)?.name) ?? '—'
  }
  function invType(inv: Invoice): string {
    return inv.type === InvoiceType.Income ? 'Income' : 'Expense'
  }

  async function refreshDocFolders(path: string) {
    setDocLoading(true)
    try {
      const listing = await listFolders(path)
      setDocFolders(listing.folders)
      setDocPath(listing.path)
    } catch (e: unknown) {
      setAttachError(e instanceof Error ? e.message : 'Failed to browse folders.')
    } finally {
      setDocLoading(false)
    }
  }

  function openAttachments(propId: string) {
    setAttachOpen(true); setAttachForm(EMPTY_ATTACH); setAttachError(null); setNewFolderName('')
    const prop = properties.find(p => p.id === propId)
    const startPath = prop ? `Properties/${prop.name}` : 'General'
    void refreshDocFolders(startPath)
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return
    setAttachError(null)
    try {
      await createFolder(docPath, newFolderName.trim())
      setNewFolderName('')
      await refreshDocFolders(docPath)
    } catch (e: unknown) {
      setAttachError(e instanceof Error ? e.message : 'Failed to create folder.')
    }
  }

  async function addAttachment(propId: string) {
    if (!attachForm.file) { setAttachError('Choose a file first.'); return }
    setAttachSaving(true); setAttachError(null)
    try {
      const row = await uploadDocument(attachForm.file, {
        path: docPath,
        propertyId: propId,
        attachTypeId: attachForm.typeRefId || undefined,
      })
      const prop = properties.find(p => p.id === propId)
      recordActivity.mutate({ action: ActivityAction.Created, table: ActivityTable.Attachment, recordName: row.original_filename ?? row.file_name, details: `Uploaded to: ${prop?.name ?? propId} / ${docPath || '(root)'}` })
      setAttachForm(EMPTY_ATTACH)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (e: unknown) {
      setAttachError(e instanceof Error ? e.message : 'Failed to upload document.')
    } finally {
      setAttachSaving(false)
    }
  }

  async function deleteAttachment(a: Attachment) {
    if (!confirm('Delete this attachment?')) return
    if (a.storagePath) {
      // NAS-native document — remove the physical file + metadata via the new API.
      try {
        const result = await deleteDocument(a.id)
        if (result.warning) console.warn('[documents] delete warning:', result.warning)
      } catch (e: unknown) {
        setAttachError(e instanceof Error ? e.message : 'Failed to delete document.')
        return
      }
    } else {
      // Legacy row with no NAS storage_path (pre-dates NAS document storage). Google Drive
      // integration has been removed entirely — no drive-side cleanup is performed or possible.
      await deleteAttachmentMutation.mutateAsync(a.id)
    }
    recordActivity.mutate({ action: ActivityAction.Deleted, table: ActivityTable.Attachment, recordName: a.fileName })
  }

  const selectedProp = properties.find(p => p.id === selectedPropId)

  return (
    <div className={s.root}>
      <div className={s.left}>
        <div className={s.leftHeader}>
          <Text size={600} weight="semibold">Properties</Text>
          <Button appearance="primary" onClick={openNew}>+ Add Property</Button>
        </div>
        <div className={s.grid}>
          {loading ? <Spinner label="Loading…" /> : properties.length === 0 ? (
            <Text style={{ color: tokens.colorNeutralForeground3 }}>No properties yet.</Text>
          ) : properties.map(p => {
            const invCount = invoiceCounts[p.id] ?? 0
            const isSelected = selectedPropId === p.id
            return (
              <div
                key={p.id}
                className={s.card}
                style={isSelected ? { borderColor: tokens.colorBrandStroke1, boxShadow: `0 0 0 2px ${tokens.colorBrandBackground2}` } : undefined}
                onClick={() => openDetail(p.id)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                  <div>
                    <Text weight="semibold">{p.name}</Text>
                    <div><Badge appearance="tint" color="brand" style={{ marginTop: 4, fontFamily: 'monospace' }}>{p.shortId}</Badge></div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                    <Button size="small" appearance="subtle" onClick={() => openDiagram(p.id)}>Diagram</Button>
                    <Button size="small" appearance="subtle" onClick={() => openEdit(p)}>Edit</Button>
                    <Button size="small" appearance="subtle" onClick={() => handleDeleteProperty(p)}>Delete</Button>
                  </div>
                </div>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>{p.address}</Text>
                {p.notes && <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>{p.notes}</Text>}
                <Text size={200} style={{ color: tokens.colorNeutralForeground4, borderTop: `1px solid ${tokens.colorNeutralStroke2}`, paddingTop: '6px' }}>
                  {invCount} invoice{invCount !== 1 ? 's' : ''}
                </Text>
              </div>
            )
          })}
        </div>
      </div>

      <div className={s.right}>
        {!selectedPropId && (
          <div className={s.emptyState}><Text style={{ color: tokens.colorNeutralForeground4 }}>Select a property to view details</Text></div>
        )}
        {selectedPropId && selectedProp && (
          <div className={s.overlay}>
            <div className={s.clickOutside} onClick={closeDetail} />
            <div className={s.panel}>
              <div className={s.panelHeader}>
                <div style={{ minWidth: 0 }}>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Property</Text>
                  <div><Text weight="semibold">{selectedProp.name}</Text></div>
                  <Text size={200} style={{ fontFamily: 'monospace', color: tokens.colorNeutralForeground4 }}>{selectedProp.shortId}</Text>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button size="small" appearance={attachOpen ? 'primary' : 'outline'} onClick={() => attachOpen ? setAttachOpen(false) : openAttachments(selectedPropId)}>Attachments</Button>
                  <Button size="small" appearance="subtle" onClick={closeDetail}>×</Button>
                </div>
              </div>

              {attachOpen && (
                <div style={{ borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, maxHeight: '55%', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: '6px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` }}>
                    <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                      Folder: <span style={{ fontFamily: 'monospace' }}>{docPath || '(root)'}</span>
                    </Text>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      <Button size="small" appearance="subtle" disabled={!docPath || docLoading}
                        onClick={() => refreshDocFolders(docPath.split('/').slice(0, -1).join('/'))}>⬆ Up</Button>
                      {docLoading ? <Spinner size="tiny" /> : docFolders.map(f => (
                        <Button key={f.path} size="small" appearance="outline" onClick={() => refreshDocFolders(f.path)}>📁 {f.name}</Button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <Input size="small" placeholder="New folder name…" value={newFolderName}
                        onChange={(_, d) => setNewFolderName(d.value)} style={{ flex: 1 }} />
                      <Button size="small" appearance="outline" onClick={handleCreateFolder} disabled={!newFolderName.trim()}>+ Folder</Button>
                    </div>

                    {!isPostgresBackend ? (
                      <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>
                        Document upload is disabled in the legacy Power Platform version. Please use the NAS-hosted version.
                      </Text>
                    ) : (
                      <>
                        <select value={attachForm.typeRefId} onChange={e => setAttachForm(f => ({ ...f, typeRefId: e.target.value }))}
                          style={{ padding: '6px 8px', fontSize: '12px', borderRadius: 4, border: `1px solid ${tokens.colorNeutralStroke1}` }}>
                          <option value="">Type (optional)…</option>
                          {attachRefTypes.map(r => <option key={r.id} value={r.id}>{r.value}</option>)}
                        </select>
                        <input ref={fileInputRef} type="file" style={{ display: 'none' }}
                          onChange={e => { const f = e.target.files?.[0]; if (f) setAttachForm(af => ({ ...af, file: f })) }} />
                        <Button size="small" appearance="outline" onClick={() => fileInputRef.current?.click()}>
                          {attachForm.file ? `✓ ${attachForm.file.name}` : '📎 Choose file…'}
                        </Button>
                        {attachError && <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>{attachError}</Text>}
                        <Button size="small" appearance="primary" disabled={attachSaving || !attachForm.file} onClick={() => addAttachment(selectedPropId!)}>
                          {attachSaving ? 'Uploading…' : '+ Upload to NAS'}
                        </Button>
                      </>
                    )}
                  </div>
                  <div className={s.scrollSection}>
                    {attachments.length === 0 ? (
                      <Text size={200} style={{ padding: '12px', color: tokens.colorNeutralForeground4 }}>No attachments yet.</Text>
                    ) : attachments.map(a => (
                      <div key={a.id} style={{ padding: '8px 16px', display: 'flex', gap: '8px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {a.storagePath ? (
                            <a href={documentDownloadUrl(a.id)} target="_blank" rel="noreferrer" style={{ color: tokens.colorBrandForegroundLink, fontSize: '12px', fontWeight: 600 }}>{a.fileName}</a>
                          ) : <Text size={200} weight="semibold">{a.fileName}</Text>}
                        </div>
                        <Button size="small" appearance="subtle" onClick={() => deleteAttachment(a)}>✕</Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ flex: '0 0 35%', display: 'flex', flexDirection: 'column', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, overflow: 'hidden' }}>
                <div className={s.sectionHeader}><Text size={200} weight="semibold" style={{ textTransform: 'uppercase', color: tokens.colorNeutralForeground3 }}>Income & Expenses by Year</Text></div>
                {yearSummaries.length === 0 ? (
                  <Text size={200} style={{ padding: '12px 16px', color: tokens.colorNeutralForeground4 }}>No data (2021 onwards).</Text>
                ) : (
                  <div className={s.scrollSection}>
                    <Table size="small">
                      <TableHeader><TableRow>
                        <TableHeaderCell>Year</TableHeaderCell>
                        <TableHeaderCell>Expenses</TableHeaderCell>
                        <TableHeaderCell>Income</TableHeaderCell>
                        <TableHeaderCell>Net</TableHeaderCell>
                      </TableRow></TableHeader>
                      <TableBody>
                        {yearSummaries.map(y => {
                          const net = y.income - y.expenses
                          return (
                            <TableRow key={y.year} onClick={() => setSelectedYear(y.year)} style={{ cursor: 'pointer', backgroundColor: selectedYear === y.year ? tokens.colorBrandBackground2 : undefined }}>
                              <TableCell>{y.year}</TableCell>
                              <TableCell style={{ color: tokens.colorPaletteRedForeground1 }}>{formatMoney(y.expenses)}</TableCell>
                              <TableCell style={{ color: tokens.colorPaletteGreenForeground1 }}>{formatMoney(y.income)}</TableCell>
                              <TableCell style={{ fontWeight: 600, color: net >= 0 ? undefined : tokens.colorPaletteRedForeground1 }}>{formatMoney(net)}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div className={s.sectionHeader} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text size={200} weight="semibold" style={{ textTransform: 'uppercase', color: tokens.colorNeutralForeground3 }}>Invoices{selectedYear ? ` — ${selectedYear}` : ''}</Text>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>{yearInvoices.length} invoice{yearInvoices.length !== 1 ? 's' : ''}</Text>
                </div>
                <div className={s.scrollSection}>
                  {!selectedYear ? (
                    <Text size={200} style={{ padding: '12px 16px', color: tokens.colorNeutralForeground4 }}>Select a year above.</Text>
                  ) : yearInvoices.length === 0 ? (
                    <Text size={200} style={{ padding: '12px 16px', color: tokens.colorNeutralForeground4 }}>No invoices for {selectedYear}.</Text>
                  ) : (
                    <Table size="small">
                      <TableHeader><TableRow>
                        <TableHeaderCell>ID</TableHeaderCell>
                        <TableHeaderCell>Type</TableHeaderCell>
                        <TableHeaderCell>Contact</TableHeaderCell>
                        <TableHeaderCell>Date</TableHeaderCell>
                        <TableHeaderCell>Total</TableHeaderCell>
                      </TableRow></TableHeader>
                      <TableBody>
                        {yearInvoices.map(inv => (
                          <TableRow key={inv.id} onClick={() => setViewInvoice(inv)} style={{ cursor: 'pointer' }}>
                            <TableCell style={{ fontFamily: 'monospace', fontWeight: 600, color: tokens.colorBrandForegroundLink }}>{inv.internalId}</TableCell>
                            <TableCell><Badge appearance="tint" color={invType(inv) === 'Income' ? 'success' : 'informative'}>{invType(inv)}</Badge></TableCell>
                            <TableCell>{contactName(inv)}</TableCell>
                            <TableCell>{fmtDate(inv.date)}</TableCell>
                            <TableCell style={{ fontWeight: 600 }}>{inv.totalGross != null ? formatMoney(inv.totalGross) : '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={(_, d) => !d.open && closeForm()}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{form.id ? 'Edit Property' : 'Add Property'}</DialogTitle>
            <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Field label="Name" required>
                <Input value={form.name} onChange={(_, d) => setForm(f => ({ ...f, name: d.value }))} placeholder="e.g. Lake Villa" />
              </Field>
              <Field label="Short ID" required hint="Used in invoice IDs, e.g. LV001/2026. Must be unique.">
                <Input value={form.shortid} onChange={(_, d) => setForm(f => ({ ...f, shortid: d.value.toUpperCase() }))} placeholder="e.g. LV" maxLength={10} />
              </Field>
              <Field label="Address" required>
                <Input value={form.address} onChange={(_, d) => setForm(f => ({ ...f, address: d.value }))} placeholder="Full address" />
              </Field>
              <Field label="Notes">
                <Textarea value={form.notes} onChange={(_, d) => setForm(f => ({ ...f, notes: d.value }))} rows={3} placeholder="Optional notes…" />
              </Field>
              {formError && <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{formError}</Text>}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={closeForm}>Cancel</Button>
              <Button appearance="primary" disabled={saving} onClick={handleSaveProperty}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {diagramPropId && (() => {
        const diagramProp = properties.find(p => p.id === diagramPropId)
        if (!diagramProp) return null
        return (
          <PropertyConnectionDiagram
            property={diagramProp} allProperties={properties} invoices={diagramInvoices} contacts={contactsList}
            onClose={() => setDiagramPropId(null)}
          />
        )
      })()}

      {viewInvoice && (
        <InvoiceForm invoice={viewInvoice} properties={properties} contacts={contactsList} readOnly onSaved={() => undefined} onClose={() => setViewInvoice(null)} />
      )}
    </div>
  )
}
