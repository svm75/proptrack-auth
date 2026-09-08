import { useState } from 'react'
import {
  makeStyles, tokens, Button, Input, Field, Select, Text, Spinner, Badge,
  TabList, Tab, type SelectTabData, type SelectTabEvent,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
  Table, TableHeader, TableRow, TableHeaderCell, TableBody, TableCell,
} from '@fluentui/react-components'
import {
  useInvoiceTemplates, useSaveInvoiceTemplate, useDeleteInvoiceTemplate, useActivityLog,
  useReferenceData, useSaveReferenceData, useDeleteReferenceData, useAttachments,
} from '@/hooks/data'
import { CategoryType, type InvoiceTemplate, type ReferenceData } from '@/domain/types'

type AdminTab = 'refdata' | 'templates' | 'activitylog'
type RefType = number

const useStyles = makeStyles({
  header: { marginBottom: '20px' },
  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' },
  group: { marginBottom: '24px' },
  groupTitle: { padding: '8px 16px', backgroundColor: tokens.colorNeutralBackground2, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, textTransform: 'uppercase', fontSize: '11px', fontWeight: 600, color: tokens.colorNeutralForeground3 },
  filterRow: { display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', alignItems: 'flex-end' },
})

interface TemplateForm { id: string | null; name: string; type: CategoryType; categoryId: string; description: string; defaultAmount: string }
const EMPTY_TEMPLATE_FORM: TemplateForm = { id: null, name: '', type: CategoryType.Expense, categoryId: '', description: '', defaultAmount: '' }

const REF_TYPE_LABELS: Record<number, string> = {
  233100000: 'Property', 233100001: 'Supplier', 233100002: 'Client',
  233100003: 'Expense', 233100004: 'Income', 233100005: 'Income Category', 233100006: 'Expense Category',
}
const REF_TYPE_OPTIONS = Object.entries(REF_TYPE_LABELS).map(([k, v]) => ({ value: Number(k) as RefType, label: v }))

interface FormState { id: string | null; value: string; reftype: RefType | ''; sortorder: string }
const EMPTY_FORM: FormState = { id: null, value: '', reftype: '', sortorder: '' }

const ACTION_LABELS: Record<number, string> = { 233100000: 'Created', 233100001: 'Updated', 233100002: 'Deleted', 233100003: 'Exported' }
const TABLE_LABELS: Record<number, string> = { 233100000: 'Invoice', 233100001: 'Contact', 233100002: 'Property', 233100003: 'Attachment' }

function fmtTs(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function Admin() {
  const s = useStyles()
  const [tab, setTab] = useState<AdminTab>('refdata')

  // ── Reference Data ──
  const refsQ = useReferenceData()
  const attachmentsQ = useAttachments()
  const saveRefM = useSaveReferenceData()
  const deleteRefM = useDeleteReferenceData()
  const refs = refsQ.data ?? []
  const loading = refsQ.isLoading || attachmentsQ.isLoading
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const usedCounts: Record<string, number> = {}
  for (const a of attachmentsQ.data ?? []) {
    if (a.attachTypeId) usedCounts[a.attachTypeId] = (usedCounts[a.attachTypeId] ?? 0) + 1
  }

  function openNew() { setForm(EMPTY_FORM); setError(null); setFormOpen(true) }
  function openEdit(r: ReferenceData) {
    setForm({ id: r.id, value: r.value, reftype: r.referenceType, sortorder: r.sortOrder?.toString() ?? '' })
    setError(null); setFormOpen(true)
  }
  function closeForm() { setFormOpen(false); setForm(EMPTY_FORM); setError(null) }

  async function save() {
    if (!form.value.trim() || form.reftype === '') { setError('Value and type are required.'); return }
    const duplicate = refs.find(r => r.referenceType === form.reftype && r.value.trim().toLowerCase() === form.value.trim().toLowerCase() && r.id !== form.id)
    if (duplicate) { setError('A reference with this type and value already exists.'); return }
    setSaving(true); setError(null)
    try {
      await saveRefM.mutateAsync({
        ...(form.id ? { id: form.id } : {}),
        value: form.value.trim(), referenceType: form.reftype as number,
        sortOrder: form.sortorder !== '' ? Number(form.sortorder) : undefined,
      } as ReferenceData | Omit<ReferenceData, 'id'>)
      closeForm()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function del(r: ReferenceData) {
    if ((usedCounts[r.id] ?? 0) > 0) return
    if (!confirm(`Delete "${r.value}"?`)) return
    await deleteRefM.mutateAsync(r.id)
  }

  const grouped = REF_TYPE_OPTIONS.map(opt => ({ ...opt, items: refs.filter(r => r.referenceType === opt.value) })).filter(g => g.items.length > 0)

  // ── Invoice Templates ──
  const templatesQ = useInvoiceTemplates()
  const saveTemplateM = useSaveInvoiceTemplate()
  const deleteTemplateM = useDeleteInvoiceTemplate()
  const templates = templatesQ.data ?? []
  const templateCategories = refs.filter(r => r.referenceType === CategoryType.Income || r.referenceType === CategoryType.Expense)

  const [templateForm, setTemplateForm] = useState<TemplateForm>(EMPTY_TEMPLATE_FORM)
  const [templateFormOpen, setTemplateFormOpen] = useState(false)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)

  function openNewTemplate() { setTemplateForm(EMPTY_TEMPLATE_FORM); setTemplateError(null); setTemplateFormOpen(true) }
  function openEditTemplate(t: InvoiceTemplate) {
    setTemplateForm({ id: t.id, name: t.name, type: t.type, categoryId: t.categoryId ?? '', description: t.description ?? '', defaultAmount: t.defaultAmount?.toString() ?? '' })
    setTemplateError(null); setTemplateFormOpen(true)
  }
  function closeTemplateForm() { setTemplateFormOpen(false); setTemplateForm(EMPTY_TEMPLATE_FORM); setTemplateError(null) }

  async function saveTemplate() {
    if (!templateForm.name.trim()) { setTemplateError('Name is required.'); return }
    setTemplateSaving(true); setTemplateError(null)
    try {
      await saveTemplateM.mutateAsync({
        ...(templateForm.id ? { id: templateForm.id } : {}),
        name: templateForm.name.trim(), type: templateForm.type,
        categoryId: templateForm.categoryId || undefined,
        description: templateForm.description.trim() || undefined,
        defaultAmount: templateForm.defaultAmount !== '' ? Number(templateForm.defaultAmount) : undefined,
      } as InvoiceTemplate | Omit<InvoiceTemplate, 'id'>)
      closeTemplateForm()
    } catch (e: unknown) {
      setTemplateError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setTemplateSaving(false)
    }
  }
  async function deleteTemplate(t: InvoiceTemplate) {
    if (!confirm(`Delete template "${t.name}"?`)) return
    await deleteTemplateM.mutateAsync(t.id)
  }
  const templateCategoryOptions = templateCategories.filter(c => c.referenceType === templateForm.type)

  // ── Activity Log ──
  const logsQ = useActivityLog()
  const logs = logsQ.data ?? []
  const [logFilterAction, setLogFilterAction] = useState('')
  const [logFilterTable, setLogFilterTable] = useState('')
  const [logFilterFrom, setLogFilterFrom] = useState('')
  const [logFilterTo, setLogFilterTo] = useState('')

  const filteredLogs = logs.filter(l => {
    if (logFilterAction && String(l.action) !== logFilterAction) return false
    if (logFilterTable && String(l.table) !== logFilterTable) return false
    if (logFilterFrom && l.timestamp && l.timestamp < new Date(logFilterFrom).toISOString()) return false
    if (logFilterTo && l.timestamp && l.timestamp > new Date(logFilterTo + 'T23:59:59').toISOString()) return false
    return true
  })

  return (
    <div style={{ maxWidth: '1100px' }}>
      <Text size={600} weight="semibold" className={s.header} style={{ display: 'block' }}>Admin</Text>

      <TabList selectedValue={tab} onTabSelect={(_: SelectTabEvent, d: SelectTabData) => setTab(d.value as AdminTab)} style={{ marginBottom: '20px' }}>
        <Tab value="refdata">Reference Data</Tab>
        <Tab value="templates">Invoice Templates</Tab>
        <Tab value="activitylog">Activity Log</Tab>
      </TabList>

      {tab === 'refdata' && (
        <div style={{ maxWidth: '760px' }}>
          <div className={s.sectionHeader}>
            <Text style={{ color: tokens.colorNeutralForeground3 }}>Manage lookup values used across the app.</Text>
            <Button appearance="primary" onClick={openNew}>+ Add Reference</Button>
          </div>
          {loading ? <Spinner label="Loading…" /> : grouped.length === 0 ? (
            <Text style={{ color: tokens.colorNeutralForeground4 }}>No reference data yet. Add your first entry.</Text>
          ) : grouped.map(group => (
            <div key={group.value} className={s.group}>
              <div className={s.groupTitle}>{group.label}</div>
              <Table size="small">
                <TableHeader><TableRow>
                  <TableHeaderCell>Value</TableHeaderCell>
                  <TableHeaderCell>Sort</TableHeaderCell>
                  <TableHeaderCell>Usage</TableHeaderCell>
                  <TableHeaderCell />
                </TableRow></TableHeader>
                <TableBody>
                  {group.items.map(r => {
                    const count = usedCounts[r.id] ?? 0
                    return (
                      <TableRow key={r.id}>
                        <TableCell>{r.value}</TableCell>
                        <TableCell>{r.sortOrder ?? '—'}</TableCell>
                        <TableCell>{count > 0 ? <Badge appearance="tint" color="informative">Used {count}×</Badge> : <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>unused</Text>}</TableCell>
                        <TableCell>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <Button size="small" appearance="subtle" onClick={() => openEdit(r)}>Edit</Button>
                            <Button size="small" appearance="subtle" disabled={count > 0} title={count > 0 ? 'In use — cannot delete' : 'Delete'} onClick={() => del(r)}>Delete</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ))}

          <Dialog open={formOpen} onOpenChange={(_, d) => !d.open && closeForm()}>
            <DialogSurface>
              <DialogBody>
                <DialogTitle>{form.id ? 'Edit Reference' : 'Add Reference'}</DialogTitle>
                <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <Field label="Type">
                    <Select value={form.reftype} onChange={e => setForm(f => ({ ...f, reftype: Number(e.target.value) as RefType }))}>
                      <option value="">Select type…</option>
                      {REF_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  </Field>
                  <Field label="Value">
                    <Input value={form.value} onChange={(_, d) => setForm(f => ({ ...f, value: d.value }))} placeholder="e.g. House Rules, Receipt…" />
                  </Field>
                  <Field label="Sort Order">
                    <Input type="number" value={form.sortorder} onChange={(_, d) => setForm(f => ({ ...f, sortorder: d.value }))} placeholder="Optional" />
                  </Field>
                  {error && <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{error}</Text>}
                </DialogContent>
                <DialogActions>
                  <Button appearance="secondary" onClick={closeForm}>Cancel</Button>
                  <Button appearance="primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</Button>
                </DialogActions>
              </DialogBody>
            </DialogSurface>
          </Dialog>
        </div>
      )}

      {tab === 'templates' && (
        <div style={{ maxWidth: '760px' }}>
          <div className={s.sectionHeader}>
            <Text style={{ color: tokens.colorNeutralForeground3 }}>Reusable presets shown as "Use Template" when creating a new invoice.</Text>
            <Button appearance="primary" onClick={openNewTemplate}>+ Add Template</Button>
          </div>
          {templatesQ.isLoading ? <Spinner label="Loading…" /> : templates.length === 0 ? (
            <Text style={{ color: tokens.colorNeutralForeground4 }}>No templates yet. Add your first one.</Text>
          ) : (
            <Table size="small">
              <TableHeader><TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Type</TableHeaderCell>
                <TableHeaderCell>Category</TableHeaderCell>
                <TableHeaderCell>Description</TableHeaderCell>
                <TableHeaderCell>Default Amount</TableHeaderCell>
                <TableHeaderCell />
              </TableRow></TableHeader>
              <TableBody>
                {templates.map(t => (
                  <TableRow key={t.id}>
                    <TableCell style={{ fontWeight: 600 }}>{t.name}</TableCell>
                    <TableCell>{t.type === CategoryType.Income ? 'Income' : 'Expense'}</TableCell>
                    <TableCell>{templateCategories.find(c => c.id === t.categoryId)?.value ?? '—'}</TableCell>
                    <TableCell>{t.description ?? '—'}</TableCell>
                    <TableCell>{t.defaultAmount != null ? t.defaultAmount.toFixed(2) : '—'}</TableCell>
                    <TableCell>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <Button size="small" appearance="subtle" onClick={() => openEditTemplate(t)}>Edit</Button>
                        <Button size="small" appearance="subtle" onClick={() => deleteTemplate(t)}>Delete</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <Dialog open={templateFormOpen} onOpenChange={(_, d) => !d.open && closeTemplateForm()}>
            <DialogSurface>
              <DialogBody>
                <DialogTitle>{templateForm.id ? 'Edit Template' : 'Add Template'}</DialogTitle>
                <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <Field label="Name" required>
                    <Input value={templateForm.name} onChange={(_, d) => setTemplateForm(f => ({ ...f, name: d.value }))} placeholder="e.g. Annual Insurance Renewal" />
                  </Field>
                  <Field label="Type">
                    <Select value={templateForm.type} onChange={e => setTemplateForm(f => ({ ...f, type: Number(e.target.value) as CategoryType, categoryId: '' }))}>
                      <option value={CategoryType.Expense}>Expense</option>
                      <option value={CategoryType.Income}>Income</option>
                    </Select>
                  </Field>
                  <Field label="Category">
                    <Select value={templateForm.categoryId} onChange={e => setTemplateForm(f => ({ ...f, categoryId: e.target.value }))}>
                      <option value="">No category</option>
                      {templateCategoryOptions.map(c => <option key={c.id} value={c.id}>{c.value}</option>)}
                    </Select>
                  </Field>
                  <Field label="Description">
                    <Input value={templateForm.description} onChange={(_, d) => setTemplateForm(f => ({ ...f, description: d.value }))} placeholder="Pre-fills the invoice description (optional)" />
                  </Field>
                  <Field label="Default Amount">
                    <Input type="number" value={templateForm.defaultAmount} onChange={(_, d) => setTemplateForm(f => ({ ...f, defaultAmount: d.value }))} placeholder="Optional" />
                  </Field>
                  {templateError && <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{templateError}</Text>}
                </DialogContent>
                <DialogActions>
                  <Button appearance="secondary" onClick={closeTemplateForm}>Cancel</Button>
                  <Button appearance="primary" disabled={templateSaving} onClick={saveTemplate}>{templateSaving ? 'Saving…' : 'Save'}</Button>
                </DialogActions>
              </DialogBody>
            </DialogSurface>
          </Dialog>
        </div>
      )}

      {tab === 'activitylog' && (
        <div>
          <div className={s.filterRow}>
            <Field label="Action">
              <Select value={logFilterAction} onChange={e => setLogFilterAction(e.target.value)}>
                <option value="">All actions</option>
                {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Table">
              <Select value={logFilterTable} onChange={e => setLogFilterTable(e.target.value)}>
                <option value="">All tables</option>
                {Object.entries(TABLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="From"><Input type="date" value={logFilterFrom} onChange={(_, d) => setLogFilterFrom(d.value)} /></Field>
            <Field label="To"><Input type="date" value={logFilterTo} onChange={(_, d) => setLogFilterTo(d.value)} /></Field>
            <Button appearance="secondary" onClick={() => logsQ.refetch()}>Refresh</Button>
          </div>

          {logsQ.isLoading ? <Spinner label="Loading…" /> : (
            <>
              <Table size="small">
                <TableHeader><TableRow>
                  <TableHeaderCell>Timestamp</TableHeaderCell>
                  <TableHeaderCell>User</TableHeaderCell>
                  <TableHeaderCell>Action</TableHeaderCell>
                  <TableHeaderCell>Table</TableHeaderCell>
                  <TableHeaderCell>Record</TableHeaderCell>
                  <TableHeaderCell>Details</TableHeaderCell>
                </TableRow></TableHeader>
                <TableBody>
                  {filteredLogs.length === 0 ? (
                    <TableRow><TableCell colSpan={6}><Text style={{ color: tokens.colorNeutralForeground4 }}>No activity log entries found.</Text></TableCell></TableRow>
                  ) : filteredLogs.map(l => {
                    const colorMap: Record<number, 'success' | 'informative' | 'danger' | 'important'> = { 233100000: 'success', 233100001: 'informative', 233100002: 'danger', 233100003: 'important' }
                    return (
                      <TableRow key={l.id}>
                        <TableCell>{fmtTs(l.timestamp)}</TableCell>
                        <TableCell>{l.user}</TableCell>
                        <TableCell><Badge appearance="tint" color={colorMap[l.action] ?? 'informative'}>{ACTION_LABELS[l.action] ?? '—'}</Badge></TableCell>
                        <TableCell>{TABLE_LABELS[l.table] ?? '—'}</TableCell>
                        <TableCell style={{ fontFamily: 'monospace' }}>{l.recordName}</TableCell>
                        <TableCell title={l.details}>{l.details ?? '—'}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              <Text size={200} style={{ color: tokens.colorNeutralForeground4, marginTop: '8px', display: 'block' }}>
                {filteredLogs.length} {filteredLogs.length === 1 ? 'entry' : 'entries'}{filteredLogs.length !== logs.length && ` (filtered from ${logs.length})`}
              </Text>
            </>
          )}
        </div>
      )}
    </div>
  )
}
