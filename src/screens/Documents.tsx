import { useEffect, useMemo, useState } from 'react'
import {
  makeStyles, tokens, Button, Input, Field, Textarea, Text, Spinner, Badge, Select, Checkbox,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
} from '@fluentui/react-components'
import {
  useAttachments, useReferenceData, useProperties, useContacts, useSaveAttachment,
} from '@/hooks/data'
import type { Attachment } from '@/domain/types'
import { isPostgresBackend } from '@/data/backend'
import {
  listFolders, createFolder, uploadDocument, deleteDocument, moveDocument,
  documentDownloadUrl, downloadDocumentBlob, type FolderEntry,
} from '@/services/documents'

// Documents tab (Document Management, Phases 1-3). Reviews/manages every NAS-native attachment
// across the whole app in one place — Properties.tsx/InvoiceForm.tsx keep their own embedded
// upload widgets (scoped to one property/invoice), this screen is the general-purpose,
// entity-agnostic view: browse by category or folder, search, preview (popup), edit metadata
// (single or bulk), move.
const DOCUMENT_CATEGORY_REF_TYPE = 233100007

const useStyles = makeStyles({
  root: { display: 'flex', height: '100%', overflow: 'hidden' },
  left: { width: '260px', flexShrink: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', borderRight: `1px solid ${tokens.colorNeutralStroke2}`, padding: '16px 12px' },
  leftGroupTitle: { fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: tokens.colorNeutralForeground3, padding: '8px 8px 4px' },
  leftItem: { display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderRadius: tokens.borderRadiusMedium, cursor: 'pointer', fontSize: '13px' },
  leftItemActive: { backgroundColor: tokens.colorBrandBackground2, fontWeight: 600 },
  center: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 },
  centerHeader: { padding: '16px 24px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' },
  bulkBar: { padding: '10px 24px', backgroundColor: tokens.colorBrandBackground2, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' },
  listWrap: { flex: 1, overflowY: 'auto' },
  row: { display: 'grid', gridTemplateColumns: '28px 1fr 140px 160px 110px 90px', gap: '10px', alignItems: 'center', padding: '10px 24px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, fontSize: '13px' },
  rowName: { cursor: 'pointer' },
  rowHead: { fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', color: tokens.colorNeutralForeground3, backgroundColor: tokens.colorNeutralBackground2 },
  emptyState: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tokens.colorNeutralForeground3 },
  previewWrap: { height: '360px', backgroundColor: tokens.colorNeutralBackground2, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: tokens.borderRadiusLarge, marginBottom: '12px' },
  metaWrap: { display: 'flex', flexDirection: 'column', gap: '10px' },
  uploadBox: { padding: '12px 16px', borderTop: `1px solid ${tokens.colorNeutralStroke2}`, display: 'flex', flexDirection: 'column', gap: '8px' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' },
  tree: { maxHeight: '220px', overflowY: 'auto', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, padding: '4px' },
  treeNode: { display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 6px', borderRadius: tokens.borderRadiusSmall, cursor: 'pointer', fontSize: '13px' },
  treeNodeActive: { backgroundColor: tokens.colorBrandBackground2, fontWeight: 600 },
  moveSection: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' },
})

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtSize(bytes: number | undefined): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function expiryFlag(expiryDate: string | undefined): 'expired' | 'soon' | null {
  if (!expiryDate) return null
  const days = (new Date(expiryDate).getTime() - Date.now()) / 86_400_000
  if (days < 0) return 'expired'
  if (days <= 90) return 'soon'
  return null
}

// ── Folder tree (click-to-select, lazy-expanding) — replaces the old flat browse-and-Up UI ──
function FolderTreeNode({ path, name, depth, selectedPath, onSelect, reloadKey }: {
  path: string; name: string; depth: number; selectedPath: string; onSelect: (p: string) => void; reloadKey: number
}) {
  const s = useStyles()
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<FolderEntry[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { setChildren(null) }, [reloadKey])

  async function toggle() {
    if (!expanded && children === null) {
      setLoading(true)
      try {
        const listing = await listFolders(path)
        setChildren(listing.folders)
      } finally {
        setLoading(false)
      }
    }
    setExpanded(e => !e)
  }

  return (
    <div>
      <div className={`${s.treeNode} ${selectedPath === path ? s.treeNodeActive : ''}`} style={{ paddingLeft: `${depth * 16 + 6}px` }}>
        <span onClick={toggle}>{expanded ? '▾' : '▸'}</span>
        <span onClick={() => onSelect(path)}>📁 {name}</span>
      </div>
      {expanded && (
        loading ? <div style={{ paddingLeft: `${depth * 16 + 28}px` }}><Spinner size="tiny" /></div>
          : children?.map(c => (
            <FolderTreeNode key={c.path} path={c.path} name={c.name} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} reloadKey={reloadKey} />
          ))
      )}
    </div>
  )
}

function FolderTree({ selectedPath, onSelect, reloadKey }: { selectedPath: string; onSelect: (p: string) => void; reloadKey: number }) {
  const s = useStyles()
  const [roots, setRoots] = useState<FolderEntry[] | null>(null)
  useEffect(() => { listFolders('').then(l => setRoots(l.folders)) }, [reloadKey])
  return (
    <div className={s.tree}>
      <div className={`${s.treeNode} ${selectedPath === '' ? s.treeNodeActive : ''}`} onClick={() => onSelect('')}>📁 (root)</div>
      {roots === null ? <Spinner size="tiny" /> : roots.map(r => (
        <FolderTreeNode key={r.path} path={r.path} name={r.name} depth={1} selectedPath={selectedPath} onSelect={onSelect} reloadKey={reloadKey} />
      ))}
    </div>
  )
}

interface UploadForm {
  file: File | null
  categoryId: string
  validFromDate: string
  dueDate: string
  propertyId: string
  contactId: string
  description: string
  path: string
}
const EMPTY_UPLOAD: UploadForm = {
  file: null, categoryId: '', validFromDate: new Date().toISOString().slice(0, 10), dueDate: '',
  propertyId: '', contactId: '', description: '', path: '',
}

interface BulkForm { categoryId: string; propertyId: string; dueDate: string; contactId: string }
const EMPTY_BULK: BulkForm = { categoryId: '', propertyId: '', dueDate: '', contactId: '' }

export default function Documents() {
  const s = useStyles()
  const { data: attachments = [], isLoading } = useAttachments()
  const { data: referenceData = [] } = useReferenceData()
  const { data: properties = [] } = useProperties()
  const { data: contacts = [] } = useContacts()
  const saveAttachment = useSaveAttachment()

  const categories = useMemo(
    () => referenceData.filter(r => r.referenceType === DOCUMENT_CATEGORY_REF_TYPE).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [referenceData],
  )
  const nasDocs = useMemo(() => attachments.filter(a => a.storagePath), [attachments])

  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [expiringOnly, setExpiringOnly] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return nasDocs.filter(a => {
      if (categoryFilter && a.categoryId !== categoryFilter) return false
      if (expiringOnly && expiryFlag(a.expiryDate) === null) return false
      if (q && !(a.originalFilename ?? a.fileName).toLowerCase().includes(q)
            && !(a.description ?? '').toLowerCase().includes(q)
            && !(a.tags ?? []).some(t => t.toLowerCase().includes(q))) return false
      return true
    }).sort((a, b) => (b.validFromDate ?? '').localeCompare(a.validFromDate ?? ''))
  }, [nasDocs, categoryFilter, expiringOnly, search])

  const preview = nasDocs.find(a => a.id === previewId) ?? null

  function categoryName(id: string | undefined): string {
    return categories.find(c => c.id === id)?.value ?? '—'
  }
  function linkedEntityLabel(a: Attachment): string {
    if (a.propertyId) return properties.find(p => p.id === a.propertyId)?.name ?? 'Property'
    if (a.contactId) return contacts.find(c => c.id === a.contactId)?.name ?? 'Contact'
    return '—'
  }

  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(id); else next.delete(id)
      return next
    })
  }
  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? new Set(filtered.map(a => a.id)) : new Set())
  }

  // ── Upload ──
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadForm, setUploadForm] = useState<UploadForm>(EMPTY_UPLOAD)
  const [uploadSaving, setUploadSaving] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [treeReloadKey, setTreeReloadKey] = useState(0)

  function openUpload() {
    setUploadForm(EMPTY_UPLOAD); setUploadError(null); setUploadOpen(true); setNewFolderName('')
  }
  function selectCategory(categoryId: string) {
    const cat = categories.find(c => c.id === categoryId)
    setUploadForm(f => ({ ...f, categoryId, path: cat?.defaultFolderPath ?? f.path }))
  }
  async function handleCreateFolder() {
    if (!newFolderName.trim()) return
    setUploadError(null)
    try {
      await createFolder(uploadForm.path, newFolderName.trim())
      setNewFolderName('')
      setTreeReloadKey(k => k + 1)
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : 'Failed to create folder.')
    }
  }

  async function doUpload() {
    if (!uploadForm.file) { setUploadError('Choose a file first.'); return }
    if (!uploadForm.categoryId) { setUploadError('Choose a category first.'); return }
    if (!uploadForm.validFromDate) { setUploadError('Valid-from date is required.'); return }
    setUploadSaving(true); setUploadError(null)
    try {
      const row = await uploadDocument(uploadForm.file, {
        path: uploadForm.path,
        categoryId: uploadForm.categoryId,
        validFromDate: uploadForm.validFromDate,
        expiryDate: uploadForm.dueDate || undefined,
        propertyId: uploadForm.propertyId || undefined,
        contactId: uploadForm.contactId || undefined,
        description: uploadForm.description || undefined,
      })
      setUploadOpen(false)
      setPreviewId(row.id)
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setUploadSaving(false)
    }
  }

  // ── Move (now inline inside the preview popup, not a separate stacked dialog) ──
  const [moveExpanded, setMoveExpanded] = useState(false)
  const [movePath, setMovePath] = useState('')
  const [moveSaving, setMoveSaving] = useState(false)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [moveTreeReloadKey, setMoveTreeReloadKey] = useState(0)

  function openMove() {
    if (!preview) return
    setMoveExpanded(true); setMoveError(null)
    setMovePath(preview.storagePath?.split('/').slice(0, -1).join('/') ?? '')
    setMoveTreeReloadKey(k => k + 1)
  }
  async function confirmMove() {
    if (!preview) return
    setMoveSaving(true); setMoveError(null)
    try {
      await moveDocument(preview.id, movePath)
      setMoveExpanded(false)
    } catch (e: unknown) {
      setMoveError(e instanceof Error ? e.message : 'Move failed.')
    } finally {
      setMoveSaving(false)
    }
  }

  // ── Preview file — opt-in only (not fetched automatically), and via an authenticated blob
  // fetch, not a bare <img>/<iframe> src: those can't carry the Authorization header the API's
  // requireToken gate needs, which is exactly why the direct-URL approach 401'd. ──
  const [previewRequested, setPreviewRequested] = useState(false)
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null)
  const [previewLoadError, setPreviewLoadError] = useState<string | null>(null)

  useEffect(() => {
    setPreviewRequested(false)
    setPreviewBlobUrl(null)
    setPreviewLoadError(null)
    setMoveExpanded(false)
  }, [previewId])

  useEffect(() => {
    if (!preview || !previewRequested) return
    let cancelled = false
    let url: string | null = null
    downloadDocumentBlob(preview.id).then(({ blob }) => {
      if (cancelled) return
      url = URL.createObjectURL(blob)
      setPreviewBlobUrl(url)
    }).catch((e: unknown) => {
      if (!cancelled) setPreviewLoadError(e instanceof Error ? e.message : 'Failed to load preview.')
    })
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewRequested, preview?.id])

  // ── Single-document metadata edit (preview popup) ──
  async function updateField(patch: Partial<Attachment>) {
    if (!preview) return
    await saveAttachment.mutateAsync({ ...preview, ...patch })
  }

  async function doDelete(a: Attachment) {
    if (!confirm(`Delete "${a.originalFilename ?? a.fileName}"? This cannot be undone.`)) return
    const result = await deleteDocument(a.id)
    if (result.warning) console.warn('[documents] delete warning:', result.warning)
    if (previewId === a.id) setPreviewId(null)
    setSelectedIds(prev => { const n = new Set(prev); n.delete(a.id); return n })
  }

  // ── Bulk edit ──
  const [bulkForm, setBulkForm] = useState<BulkForm>(EMPTY_BULK)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)

  async function applyBulk() {
    const targets = nasDocs.filter(a => selectedIds.has(a.id))
    if (targets.length === 0) return
    setBulkSaving(true); setBulkError(null)
    try {
      await Promise.all(targets.map(a => {
        const patch: Partial<Attachment> = {}
        if (bulkForm.categoryId) patch.categoryId = bulkForm.categoryId
        if (bulkForm.propertyId) patch.propertyId = bulkForm.propertyId
        if (bulkForm.dueDate) patch.expiryDate = bulkForm.dueDate
        if (bulkForm.contactId) patch.contactId = bulkForm.contactId
        return saveAttachment.mutateAsync({ ...a, ...patch })
      }))
      setSelectedIds(new Set())
      setBulkForm(EMPTY_BULK)
    } catch (e: unknown) {
      setBulkError(e instanceof Error ? e.message : 'Bulk update failed.')
    } finally {
      setBulkSaving(false)
    }
  }

  if (!isPostgresBackend) {
    return (
      <div className={s.emptyState} style={{ height: '100%' }}>
        <Text>Document management is disabled in the legacy Power Platform version. Please use the NAS-hosted version.</Text>
      </div>
    )
  }

  const allSelected = filtered.length > 0 && filtered.every(a => selectedIds.has(a.id))

  return (
    <div className={s.root}>
      {/* ── Left: category filter ── */}
      <div className={s.left}>
        <div className={s.leftGroupTitle}>Categories</div>
        <div className={`${s.leftItem} ${categoryFilter === '' ? s.leftItemActive : ''}`} onClick={() => setCategoryFilter('')}>
          <span>All Documents</span><span>{nasDocs.length}</span>
        </div>
        {categories.map(c => {
          const count = nasDocs.filter(a => a.categoryId === c.id).length
          return (
            <div key={c.id} className={`${s.leftItem} ${categoryFilter === c.id ? s.leftItemActive : ''}`} onClick={() => setCategoryFilter(c.id)}>
              <span>{c.value}</span><span>{count}</span>
            </div>
          )
        })}
        <div className={s.leftGroupTitle} style={{ marginTop: '12px' }}>Saved Views</div>
        <div className={`${s.leftItem} ${expiringOnly ? s.leftItemActive : ''}`} onClick={() => setExpiringOnly(v => !v)}>
          <span>⚠ Expiring / Expired</span><span>{nasDocs.filter(a => expiryFlag(a.expiryDate) !== null).length}</span>
        </div>
      </div>

      {/* ── Center: list ── */}
      <div className={s.center}>
        <div className={s.centerHeader}>
          <Input placeholder="Search filename, description, tags…" value={search} onChange={(_, d) => setSearch(d.value)} style={{ flex: 1, minWidth: '220px' }} />
          <Button appearance="primary" onClick={openUpload}>+ Upload Document</Button>
        </div>

        {selectedIds.size > 0 && (
          <div className={s.bulkBar}>
            <Text weight="semibold" size={200}>{selectedIds.size} selected</Text>
            <Select value={bulkForm.categoryId} onChange={e => setBulkForm(f => ({ ...f, categoryId: e.target.value }))} style={{ minWidth: '140px' }}>
              <option value="">Category…</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.value}</option>)}
            </Select>
            <Select value={bulkForm.propertyId} onChange={e => setBulkForm(f => ({ ...f, propertyId: e.target.value }))} style={{ minWidth: '140px' }}>
              <option value="">House/Property…</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <Input type="date" placeholder="Due date…" value={bulkForm.dueDate} onChange={(_, d) => setBulkForm(f => ({ ...f, dueDate: d.value }))} />
            <Select value={bulkForm.contactId} onChange={e => setBulkForm(f => ({ ...f, contactId: e.target.value }))} style={{ minWidth: '160px' }}>
              <option value="">Client/Supplier…</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Button size="small" appearance="primary" disabled={bulkSaving} onClick={applyBulk}>{bulkSaving ? 'Applying…' : 'Apply to Selected'}</Button>
            <Button size="small" appearance="subtle" onClick={() => { setSelectedIds(new Set()); setBulkForm(EMPTY_BULK) }}>Clear</Button>
            {bulkError && <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{bulkError}</Text>}
          </div>
        )}

        <div className={`${s.row} ${s.rowHead}`}>
          <Checkbox checked={allSelected} onChange={(_, d) => toggleSelectAll(!!d.checked)} />
          <span>Name</span><span>Category</span><span>Linked To</span><span>Valid From</span><span>Due</span>
        </div>
        <div className={s.listWrap}>
          {isLoading && <div style={{ padding: '24px', textAlign: 'center' }}><Spinner size="small" /></div>}
          {!isLoading && filtered.length === 0 && (
            <div className={s.emptyState} style={{ padding: '40px' }}>
              <Text>No documents match this view.</Text>
            </div>
          )}
          {filtered.map(a => {
            const flag = expiryFlag(a.expiryDate)
            return (
              <div key={a.id} className={s.row}>
                <Checkbox checked={selectedIds.has(a.id)} onChange={(_, d) => toggleSelect(a.id, !!d.checked)} />
                <span className={s.rowName} title={a.originalFilename ?? a.fileName} onClick={() => setPreviewId(a.id)}>{a.originalFilename ?? a.fileName}</span>
                <span>{categoryName(a.categoryId)}</span>
                <span>{linkedEntityLabel(a)}</span>
                <span>{fmtDate(a.validFromDate)}</span>
                <span>
                  {a.expiryDate && (
                    <Badge appearance="filled" color={flag === 'expired' ? 'danger' : flag === 'soon' ? 'warning' : 'informative'}>
                      {fmtDate(a.expiryDate)}
                    </Badge>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Preview popup — opens on clicking a document name. Move is now an inline expandable
          section inside this same dialog (a separate stacked popup was unclickable, sitting
          behind Fluent's own Dialog portal z-index). ── */}
      <Dialog open={!!preview} onOpenChange={(_, d) => { if (!d.open) setPreviewId(null) }}>
        <DialogSurface style={{ maxWidth: '720px' }}>
          {preview && (
            <DialogBody>
              <DialogTitle
                action={
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <Button size="small" appearance="outline" onClick={() => window.open(documentDownloadUrl(preview.id), '_blank')}>Download</Button>
                    <Button size="small" appearance="outline" onClick={openMove}>Move</Button>
                    <Button size="small" appearance="outline" onClick={() => doDelete(preview)}>Delete</Button>
                  </div>
                }
              >
                {preview.originalFilename ?? preview.fileName}
              </DialogTitle>
              <DialogContent>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>{fmtSize(preview.fileSize)} · {preview.mimeType} · Folder: {preview.storagePath?.split('/').slice(0, -1).join('/') || '(root)'}</Text>

                {!previewRequested ? (
                  <div className={s.previewWrap}>
                    <Checkbox
                      label="Load preview (not fetched automatically)"
                      checked={previewRequested}
                      onChange={(_, d) => setPreviewRequested(!!d.checked)}
                    />
                  </div>
                ) : (
                  <div className={s.previewWrap}>
                    {previewLoadError ? (
                      <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{previewLoadError}</Text>
                    ) : !previewBlobUrl ? (
                      <Spinner size="small" label="Loading preview…" />
                    ) : preview.mimeType?.startsWith('image/') ? (
                      <img src={previewBlobUrl} alt={preview.originalFilename} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    ) : preview.mimeType === 'application/pdf' ? (
                      <iframe src={previewBlobUrl} title="Document preview" style={{ width: '100%', height: '100%', border: 'none' }} />
                    ) : (
                      <Text style={{ color: tokens.colorNeutralForeground3 }}>No inline preview for this file type — use Download.</Text>
                    )}
                  </div>
                )}

                {moveExpanded && (
                  <div className={s.moveSection}>
                    <Text weight="semibold" size={200}>Move to folder</Text>
                    <FolderTree selectedPath={movePath} onSelect={setMovePath} reloadKey={moveTreeReloadKey} />
                    <Text size={200} style={{ fontFamily: 'monospace' }}>Destination: {movePath || '(root)'}</Text>
                    {moveError && <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{moveError}</Text>}
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <Button size="small" appearance="secondary" onClick={() => setMoveExpanded(false)}>Cancel</Button>
                      <Button size="small" appearance="primary" disabled={moveSaving} onClick={confirmMove}>{moveSaving ? 'Moving…' : 'Move Here'}</Button>
                    </div>
                  </div>
                )}

                <div className={s.metaWrap}>
                  <div className={s.grid3}>
                    <Field label="Category">
                      <Select value={preview.categoryId ?? ''} onChange={e => updateField({ categoryId: e.target.value })}>
                        <option value="">—</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.value}</option>)}
                      </Select>
                    </Field>
                    <Field label="Valid From">
                      <Input type="date" value={preview.validFromDate?.slice(0, 10) ?? ''} onChange={(_, d) => updateField({ validFromDate: d.value })} />
                    </Field>
                    <Field label="Due Date">
                      <Input type="date" value={preview.expiryDate?.slice(0, 10) ?? ''} onChange={(_, d) => updateField({ expiryDate: d.value || undefined })} />
                    </Field>
                  </div>
                  <div className={s.grid2}>
                    <Field label="House / Property">
                      <Select value={preview.propertyId ?? ''} onChange={e => updateField({ propertyId: e.target.value || undefined })}>
                        <option value="">—</option>
                        {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Client / Supplier">
                      <Select value={preview.contactId ?? ''} onChange={e => updateField({ contactId: e.target.value || undefined })}>
                        <option value="">—</option>
                        {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Description / Comment">
                    <Textarea value={preview.description ?? ''} onChange={(_, d) => updateField({ description: d.value || undefined })} rows={2} />
                  </Field>
                  <Field label="Tags (comma-separated)">
                    <Input value={(preview.tags ?? []).join(', ')}
                      onChange={(_, d) => updateField({ tags: d.value.split(',').map(t => t.trim()).filter(Boolean) })} />
                  </Field>
                </div>
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setPreviewId(null)}>Close</Button>
              </DialogActions>
            </DialogBody>
          )}
        </DialogSurface>
      </Dialog>

      {/* ── Upload dialog ── */}
      {uploadOpen && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', zIndex: 100 }}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)' }} onClick={() => setUploadOpen(false)} />
          <div style={{ width: '460px', backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow28, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` }}>
              <Text weight="semibold">Upload Document</Text>
            </div>
            <div className={s.uploadBox} style={{ flex: 1, overflowY: 'auto' }}>
              <div className={s.grid2}>
                <Field label="Category" required>
                  <Select value={uploadForm.categoryId} onChange={e => selectCategory(e.target.value)}>
                    <option value="">Choose…</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.value}</option>)}
                  </Select>
                </Field>
                <Field label="File" required>
                  <input type="file" onChange={e => { const f = e.target.files?.[0]; if (f) setUploadForm(uf => ({ ...uf, file: f })) }} />
                </Field>
              </div>
              <div className={s.grid2}>
                <Field label="Valid From" required>
                  <Input type="date" value={uploadForm.validFromDate} onChange={(_, d) => setUploadForm(f => ({ ...f, validFromDate: d.value }))} />
                </Field>
                <Field label="Due Date">
                  <Input type="date" value={uploadForm.dueDate} onChange={(_, d) => setUploadForm(f => ({ ...f, dueDate: d.value }))} />
                </Field>
              </div>
              <div className={s.grid2}>
                <Field label="House / Property">
                  <Select value={uploadForm.propertyId} onChange={e => setUploadForm(f => ({ ...f, propertyId: e.target.value }))}>
                    <option value="">—</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </Field>
                <Field label="Client / Supplier">
                  <Select value={uploadForm.contactId} onChange={e => setUploadForm(f => ({ ...f, contactId: e.target.value }))}>
                    <option value="">—</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
              </div>
              <Field label="Description / Comment">
                <Textarea value={uploadForm.description} onChange={(_, d) => setUploadForm(f => ({ ...f, description: d.value }))} rows={2} />
              </Field>
              <Field label="Destination Folder">
                <FolderTree selectedPath={uploadForm.path} onSelect={p => setUploadForm(f => ({ ...f, path: p }))} reloadKey={treeReloadKey} />
                <Text size={200} style={{ fontFamily: 'monospace', display: 'block', marginTop: '4px' }}>{uploadForm.path || '(root)'}</Text>
                <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                  <Input size="small" placeholder="New folder name…" value={newFolderName} onChange={(_, d) => setNewFolderName(d.value)} style={{ flex: 1 }} />
                  <Button size="small" appearance="outline" onClick={handleCreateFolder} disabled={!newFolderName.trim()}>+ Folder</Button>
                </div>
              </Field>
              {uploadError && <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{uploadError}</Text>}
            </div>
            <div style={{ padding: '16px', borderTop: `1px solid ${tokens.colorNeutralStroke2}`, display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button appearance="secondary" onClick={() => setUploadOpen(false)}>Cancel</Button>
              <Button appearance="primary" disabled={uploadSaving} onClick={doUpload}>{uploadSaving ? 'Uploading…' : 'Upload'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
