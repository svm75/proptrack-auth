import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  makeStyles, tokens, Button, Input, Field, Textarea, Text, Spinner, Badge,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
  Table, TableHeader, TableRow, TableHeaderCell, TableBody, TableCell,
} from '@fluentui/react-components'
import { Cr9b5_pt_propertiesService } from '@/generated/services/Cr9b5_pt_propertiesService'
import { Cr9b5_pt_contactsService } from '@/generated/services/Cr9b5_pt_contactsService'
import { Cr9b5_pt_attachmentsService } from '@/generated/services/Cr9b5_pt_attachmentsService'
import { Cr9b5_pt_referencesService } from '@/generated/services/Cr9b5_pt_referencesService'
import { Cr9b5_pt_invoicesService } from '@/generated/services/Cr9b5_pt_invoicesService'
import type { Cr9b5_pt_properties } from '@/generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_contacts } from '@/generated/models/Cr9b5_pt_contactsModel'
import type { Cr9b5_pt_attachments } from '@/generated/models/Cr9b5_pt_attachmentsModel'
import type { Cr9b5_pt_references } from '@/generated/models/Cr9b5_pt_referencesModel'
import type { Cr9b5_pt_invoices } from '@/generated/models/Cr9b5_pt_invoicesModel'
import { useRecordActivity } from '@/hooks/data'
import { ActivityAction, ActivityTable } from '@/domain/types'
import { formatMoney } from '@/domain/money'
import { uploadFile, deleteFile, getOrCreateFolder, propertyFolderPath, isAuthorized, authorizeWithPopup } from '@/services/googledrive'
import InvoiceForm from './InvoiceForm'
import PropertyConnectionDiagram from './PropertyConnectionDiagram'

// NOTE: InvoiceForm and PropertyConnectionDiagram haven't been migrated to the domain-typed
// hooks yet, so this screen still fetches raw Cr9b5_pt_* records directly (like the
// pre-migration version) rather than via `useProperties()`/`useContacts()` — the Fluent UI
// rewrite here is presentation-only. Revisit once those two are migrated.

const PROP_REF_TYPE = 233100000
const TYPE_INCOMING = 233100000
const TYPE_OUTGOING = 233100001

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

interface AttachForm { typeRefId: string; fileName: string; file: File | null; uploading: boolean; driveId: string; driveUrl: string }
const EMPTY_ATTACH: AttachForm = { typeRefId: '', fileName: '', file: null, uploading: false, driveId: '', driveUrl: '' }

interface YearSummary { year: number; income: number; expenses: number }

export default function Properties() {
  const s = useStyles()
  const recordActivity = useRecordActivity()
  const [searchParams, setSearchParams] = useSearchParams()

  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [contactsList, setContactsList] = useState<Cr9b5_pt_contacts[]>([])
  const [loading, setLoading] = useState(true)
  const [invoiceCounts, setInvoiceCounts] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const [propsRes, invRes, conRes] = await Promise.all([
      Cr9b5_pt_propertiesService.getAll({ orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
      Cr9b5_pt_invoicesService.getAll({ select: ['cr9b5_pt_invoiceid', '_cr9b5_property_value'], maxPageSize: 5000 }),
      Cr9b5_pt_contactsService.getAll({ orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
    ])
    const counts: Record<string, number> = {}
    for (const inv of (invRes.data ?? []) as unknown as Array<Record<string, unknown>>) {
      const pid = inv['_cr9b5_property_value'] as string | undefined
      if (pid) counts[pid] = (counts[pid] ?? 0) + 1
    }
    setProperties(propsRes.data ?? [])
    setContactsList(conRes.data ?? [])
    setInvoiceCounts(counts)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<PropForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)

  const [diagramPropId, setDiagramPropId] = useState<string | null>(null)
  const [diagramInvoices, setDiagramInvoices] = useState<Cr9b5_pt_invoices[]>([])
  const [diagramLoading, setDiagramLoading] = useState(false)

  async function openDiagram(propId: string) {
    setDiagramLoading(true)
    setDiagramPropId(propId)
    const res = await Cr9b5_pt_invoicesService.getAll({
      filter: `_cr9b5_property_value eq '${propId}'`, orderBy: ['cr9b5_date desc'], maxPageSize: 5000,
    })
    setDiagramInvoices(res.data ?? [])
    setDiagramLoading(false)
  }

  const [selectedPropId, setSelectedPropId] = useState<string | null>(null)
  const [propInvoices, setPropInvoices] = useState<Cr9b5_pt_invoices[]>([])
  const [propInvLoading, setPropInvLoading] = useState(false)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [viewInvoice, setViewInvoice] = useState<Cr9b5_pt_invoices | null>(null)

  const [attachOpen, setAttachOpen] = useState(false)
  const [attachments, setAttachments] = useState<Cr9b5_pt_attachments[]>([])
  const [attachRefTypes, setAttachRefTypes] = useState<Cr9b5_pt_references[]>([])
  const [attachForm, setAttachForm] = useState<AttachForm>(EMPTY_ATTACH)
  const [attachSaving, setAttachSaving] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [attachLoading, setAttachLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [gdConnected, setGdConnected] = useState(isAuthorized())

  const contactById = useMemo(() => new Map(contactsList.map(c => [c.cr9b5_pt_contactid, c])), [contactsList])

  // Deep-link support from the global Quick Add menu (?new=1)
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openNew()
      setSearchParams(p => { p.delete('new'); return p }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams])

  function openNew() { setForm(EMPTY_FORM); setFormError(null); setFormOpen(true) }
  function openEdit(p: Cr9b5_pt_properties) {
    setForm({ id: p.cr9b5_pt_propertyid, name: p.cr9b5_name, shortid: p.cr9b5_shortid, address: p.cr9b5_address, notes: p.cr9b5_notes ?? '' })
    setFormError(null); setFormOpen(true)
  }
  function closeForm() { setFormOpen(false); setForm(EMPTY_FORM); setFormError(null) }

  async function handleSaveProperty() {
    if (!form.name.trim() || !form.shortid.trim() || !form.address.trim()) {
      setFormError('Name, Short ID, and Address are required.')
      return
    }
    const shortIdUpper = form.shortid.trim().toUpperCase()
    const duplicate = properties.find(p => p.cr9b5_shortid.toUpperCase() === shortIdUpper && p.cr9b5_pt_propertyid !== form.id)
    if (duplicate) {
      setFormError(`Short ID "${shortIdUpper}" is already used by "${duplicate.cr9b5_name}".`)
      return
    }
    setFormError(null)
    setSaving(true)
    try {
      const payload = {
        cr9b5_name: form.name.trim(), cr9b5_shortid: shortIdUpper,
        cr9b5_address: form.address.trim(), cr9b5_notes: form.notes.trim() || undefined,
      }
      if (form.id) {
        await Cr9b5_pt_propertiesService.update(form.id, payload)
        recordActivity.mutate({ action: ActivityAction.Updated, table: ActivityTable.Property, recordName: form.name.trim() })
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await Cr9b5_pt_propertiesService.create(payload as any)
        recordActivity.mutate({ action: ActivityAction.Created, table: ActivityTable.Property, recordName: form.name.trim() })
      }
      closeForm()
      await load()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteProperty(p: Cr9b5_pt_properties) {
    const count = invoiceCounts[p.cr9b5_pt_propertyid] ?? 0
    if (count > 0) { alert(`Cannot delete — "${p.cr9b5_name}" has ${count} invoice(s).`); return }
    if (!confirm(`Delete property "${p.cr9b5_name}"?`)) return
    await Cr9b5_pt_propertiesService.delete(p.cr9b5_pt_propertyid)
    recordActivity.mutate({ action: ActivityAction.Deleted, table: ActivityTable.Property, recordName: p.cr9b5_name })
    if (selectedPropId === p.cr9b5_pt_propertyid) setSelectedPropId(null)
    await load()
  }

  async function openDetail(propId: string) {
    if (selectedPropId === propId) { setSelectedPropId(null); return }
    setSelectedPropId(propId); setAttachOpen(false); setPropInvLoading(true); setSelectedYear(null); setPropInvoices([])
    const res = await Cr9b5_pt_invoicesService.getAll({
      filter: `_cr9b5_property_value eq '${propId}'`, orderBy: ['cr9b5_date desc'], maxPageSize: 5000,
    })
    const invs = res.data ?? []
    setPropInvoices(invs)
    const years = Array.from(new Set(
      invs.map(i => i.cr9b5_date ? new Date(i.cr9b5_date).getFullYear() : null).filter((y): y is number => y !== null && y > 2020)
    )).sort((a, b) => b - a)
    setSelectedYear(years[0] ?? null)
    setPropInvLoading(false)
  }
  function closeDetail() { setSelectedPropId(null); setAttachOpen(false) }

  const yearSummaries: YearSummary[] = useMemo(() => {
    const map = new Map<number, YearSummary>()
    for (const inv of propInvoices) {
      if (!inv.cr9b5_date) continue
      const y = new Date(inv.cr9b5_date).getFullYear()
      if (y <= 2020) continue
      if (!map.has(y)) map.set(y, { year: y, income: 0, expenses: 0 })
      const summary = map.get(y)!
      const type = (inv.cr9b5_type as unknown as number)
      const gross = inv.cr9b5_totalgross ?? 0
      if (type === TYPE_OUTGOING) summary.income += gross
      else if (type === TYPE_INCOMING) summary.expenses += gross
    }
    return Array.from(map.values()).sort((a, b) => b.year - a.year)
  }, [propInvoices])

  const yearInvoices = propInvoices.filter(inv => inv.cr9b5_date && selectedYear && new Date(inv.cr9b5_date).getFullYear() === selectedYear)

  function contactName(inv: Cr9b5_pt_invoices): string {
    const id = (inv as unknown as Record<string, unknown>)['_cr9b5_contact_value'] as string | undefined
    return (id && contactById.get(id)?.cr9b5_name) ?? '—'
  }
  function invType(inv: Cr9b5_pt_invoices): string {
    return (inv.cr9b5_type as unknown as number) === TYPE_OUTGOING ? 'Income' : 'Expense'
  }

  async function openAttachments(propId: string) {
    setAttachOpen(true); setAttachForm(EMPTY_ATTACH); setAttachError(null); setAttachLoading(true)
    const [attachRes, refRes] = await Promise.all([
      Cr9b5_pt_attachmentsService.getAll({ filter: `_cr9b5_propertyid_value eq '${propId}'`, orderBy: ['cr9b5_uploadedon desc'] }),
      Cr9b5_pt_referencesService.getAll({ filter: `cr9b5_referencetype eq ${PROP_REF_TYPE}`, orderBy: ['cr9b5_sortorder asc'] }),
    ])
    setAttachments(attachRes.data ?? [])
    setAttachRefTypes(refRes.data ?? [])
    setAttachLoading(false)
  }

  async function handleFileSelect(file: File, propId: string) {
    const prop = properties.find(p => p.cr9b5_pt_propertyid === propId)
    if (!prop) return
    setAttachForm(f => ({ ...f, file, fileName: file.name, uploading: true, driveId: '', driveUrl: '' }))
    setAttachError(null)
    try {
      let folderId = prop.svm_pt_googledrivefolderid
      if (!folderId) {
        folderId = await getOrCreateFolder(propertyFolderPath(prop.cr9b5_name, prop.cr9b5_shortid))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Cr9b5_pt_propertiesService.update(propId, { svm_pt_googledrivefolderid: folderId } as any).catch(() => {})
      }
      const { id, webViewLink } = await uploadFile(file, folderId)
      setAttachForm(f => ({ ...f, uploading: false, driveId: id, driveUrl: webViewLink }))
    } catch (e: unknown) {
      setAttachForm(f => ({ ...f, uploading: false, file: null }))
      setAttachError(e instanceof Error ? e.message : 'Upload failed.')
    }
  }

  async function addAttachment(propId: string) {
    if (!attachForm.fileName.trim()) { setAttachError('Choose a file first.'); return }
    if (attachForm.uploading) return
    setAttachSaving(true); setAttachError(null)
    try {
      const payload: Record<string, unknown> = {
        cr9b5_filename: attachForm.fileName.trim(), cr9b5_referencetype: PROP_REF_TYPE,
        cr9b5_uploadedon: new Date().toISOString(), 'cr9b5_PropertyId@odata.bind': `/cr9b5_pt_properties(${propId})`,
      }
      if (attachForm.typeRefId) payload['cr9b5_AttachType@odata.bind'] = `/cr9b5_pt_references(${attachForm.typeRefId})`
      if (attachForm.driveId) payload.cr9b5_googledriveid = attachForm.driveId
      if (attachForm.driveUrl) payload.cr9b5_googledriveurl = attachForm.driveUrl
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await Cr9b5_pt_attachmentsService.create(payload as any)
      const prop = properties.find(p => p.cr9b5_pt_propertyid === propId)
      recordActivity.mutate({ action: ActivityAction.Created, table: ActivityTable.Attachment, recordName: attachForm.fileName.trim(), details: `Uploaded to: ${prop?.cr9b5_name ?? propId}` })
      setAttachForm(EMPTY_ATTACH)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await openAttachments(propId)
    } catch (e: unknown) {
      setAttachError(e instanceof Error ? e.message : 'Failed to add attachment.')
    } finally {
      setAttachSaving(false)
    }
  }

  async function deleteAttachment(a: Cr9b5_pt_attachments, propId: string) {
    if (!confirm('Delete this attachment?')) return
    if (a.cr9b5_googledriveid) { try { await deleteFile(a.cr9b5_googledriveid) } catch { /* ignore */ } }
    await Cr9b5_pt_attachmentsService.delete(a.cr9b5_pt_attachmentid)
    recordActivity.mutate({ action: ActivityAction.Deleted, table: ActivityTable.Attachment, recordName: a.cr9b5_filename })
    await openAttachments(propId)
  }

  const selectedProp = properties.find(p => p.cr9b5_pt_propertyid === selectedPropId)

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
            const invCount = invoiceCounts[p.cr9b5_pt_propertyid] ?? 0
            const isSelected = selectedPropId === p.cr9b5_pt_propertyid
            return (
              <div
                key={p.cr9b5_pt_propertyid}
                className={s.card}
                style={isSelected ? { borderColor: tokens.colorBrandStroke1, boxShadow: `0 0 0 2px ${tokens.colorBrandBackground2}` } : undefined}
                onClick={() => openDetail(p.cr9b5_pt_propertyid)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                  <div>
                    <Text weight="semibold">{p.cr9b5_name}</Text>
                    <div><Badge appearance="tint" color="brand" style={{ marginTop: 4, fontFamily: 'monospace' }}>{p.cr9b5_shortid}</Badge></div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                    <Button size="small" appearance="subtle" onClick={() => openDiagram(p.cr9b5_pt_propertyid)}>Diagram</Button>
                    <Button size="small" appearance="subtle" onClick={() => openEdit(p)}>Edit</Button>
                    <Button size="small" appearance="subtle" onClick={() => handleDeleteProperty(p)}>Delete</Button>
                  </div>
                </div>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>{p.cr9b5_address}</Text>
                {p.cr9b5_notes && <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>{p.cr9b5_notes}</Text>}
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
                  <div><Text weight="semibold">{selectedProp.cr9b5_name}</Text></div>
                  <Text size={200} style={{ fontFamily: 'monospace', color: tokens.colorNeutralForeground4 }}>{selectedProp.cr9b5_shortid}</Text>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button size="small" appearance={attachOpen ? 'primary' : 'outline'} onClick={() => attachOpen ? setAttachOpen(false) : openAttachments(selectedPropId)}>Attachments</Button>
                  <Button size="small" appearance="subtle" onClick={closeDetail}>×</Button>
                </div>
              </div>

              {attachOpen && (
                <div style={{ borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, maxHeight: '50%', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: '6px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` }}>
                    <select value={attachForm.typeRefId} onChange={e => setAttachForm(f => ({ ...f, typeRefId: e.target.value }))}
                      style={{ padding: '6px 8px', fontSize: '12px', borderRadius: 4, border: `1px solid ${tokens.colorNeutralStroke1}` }}>
                      <option value="">Type (optional)…</option>
                      {attachRefTypes.map(r => <option key={r.cr9b5_pt_referenceid} value={r.cr9b5_pt_referenceid}>{r.cr9b5_value}</option>)}
                    </select>
                    <input ref={fileInputRef} type="file" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f && selectedPropId) handleFileSelect(f, selectedPropId) }} />
                    {gdConnected ? (
                      <Button size="small" appearance="outline" onClick={() => fileInputRef.current?.click()}>
                        {attachForm.uploading ? '⏳ Uploading…' : attachForm.driveId ? `✓ ${attachForm.fileName}` : '📎 Choose file…'}
                      </Button>
                    ) : (
                      <Button size="small" appearance="outline" onClick={async () => {
                        try { await authorizeWithPopup(); setGdConnected(true) }
                        catch (e) { setAttachError(e instanceof Error ? e.message : 'Google Drive sign-in failed.') }
                      }}>🔗 Connect Google Drive</Button>
                    )}
                    {attachError && <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>{attachError}</Text>}
                    <Button size="small" appearance="primary" disabled={attachSaving || attachForm.uploading || !attachForm.driveId} onClick={() => addAttachment(selectedPropId!)}>
                      {attachSaving ? 'Adding…' : '+ Add'}
                    </Button>
                  </div>
                  <div className={s.scrollSection}>
                    {attachLoading ? <Spinner size="tiny" label="Loading…" /> : attachments.length === 0 ? (
                      <Text size={200} style={{ padding: '12px', color: tokens.colorNeutralForeground4 }}>No attachments yet.</Text>
                    ) : attachments.map(a => (
                      <div key={a.cr9b5_pt_attachmentid} style={{ padding: '8px 16px', display: 'flex', gap: '8px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {a.cr9b5_googledriveurl ? (
                            <a href={a.cr9b5_googledriveurl} target="_blank" rel="noreferrer" style={{ color: tokens.colorBrandForegroundLink, fontSize: '12px', fontWeight: 600 }}>{a.cr9b5_filename}</a>
                          ) : <Text size={200} weight="semibold">{a.cr9b5_filename}</Text>}
                        </div>
                        <Button size="small" appearance="subtle" onClick={() => deleteAttachment(a, selectedPropId!)}>✕</Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ flex: '0 0 35%', display: 'flex', flexDirection: 'column', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, overflow: 'hidden' }}>
                <div className={s.sectionHeader}><Text size={200} weight="semibold" style={{ textTransform: 'uppercase', color: tokens.colorNeutralForeground3 }}>Income & Expenses by Year</Text></div>
                {propInvLoading ? <Spinner size="tiny" label="Loading…" /> : yearSummaries.length === 0 ? (
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
                  {propInvLoading ? <Spinner size="tiny" label="Loading…" /> : !selectedYear ? (
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
                          <TableRow key={inv.cr9b5_pt_invoiceid} onClick={() => setViewInvoice(inv)} style={{ cursor: 'pointer' }}>
                            <TableCell style={{ fontFamily: 'monospace', fontWeight: 600, color: tokens.colorBrandForegroundLink }}>{inv.cr9b5_internalid}</TableCell>
                            <TableCell><Badge appearance="tint" color={invType(inv) === 'Income' ? 'success' : 'informative'}>{invType(inv)}</Badge></TableCell>
                            <TableCell>{contactName(inv)}</TableCell>
                            <TableCell>{fmtDate(inv.cr9b5_date)}</TableCell>
                            <TableCell style={{ fontWeight: 600 }}>{inv.cr9b5_totalgross != null ? formatMoney(inv.cr9b5_totalgross) : '—'}</TableCell>
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
        const diagramProp = properties.find(p => p.cr9b5_pt_propertyid === diagramPropId)
        if (!diagramProp) return null
        if (diagramLoading) {
          return <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner label="Loading…" /></div>
        }
        return (
          <PropertyConnectionDiagram
            property={diagramProp} allProperties={properties} invoices={diagramInvoices} contacts={contactsList}
            onClose={() => { setDiagramPropId(null); setDiagramInvoices([]) }}
          />
        )
      })()}

      {viewInvoice && (
        <InvoiceForm invoice={viewInvoice} properties={properties} contacts={contactsList} readOnly onSaved={() => undefined} onClose={() => setViewInvoice(null)} />
      )}
    </div>
  )
}
