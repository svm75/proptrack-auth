import { useState } from 'react'
import {
  makeStyles, tokens, Button, Input, Textarea, Field, Select, Checkbox, Text, Spinner, Badge,
  TabList, Tab, type SelectTabData, type SelectTabEvent,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
  Table, TableHeader, TableRow, TableHeaderCell, TableBody, TableCell,
} from '@fluentui/react-components'
import {
  useContacts, useProperties, useCategories, useSupplierContracts,
  useSaveContact, useDeleteContact, useSaveSupplierContract, useDeleteSupplierContract, useRecordActivity,
} from '@/hooks/data'
import { ContactRole, ActivityAction, ActivityTable, type Contact, type SupplierContract } from '@/domain/types'

type Tab = 'clients' | 'suppliers'

const useStyles = makeStyles({
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' },
  search: { marginBottom: '16px', maxWidth: '360px' },
  contractRow: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' },
})

interface ContactForm {
  id: string | null
  name: string
  email: string
  taxid: string
  defaultdesc: string
  role: ContactRole
  defaultCategoryId: string
}

interface ContractRow {
  id: string | null
  propertyId: string
  allProperties: boolean
  contractCount: number
  categoryId: string
  description: string
  active: boolean
}

function emptyForm(role: ContactRole): ContactForm {
  return { id: null, name: '', email: '', taxid: '', defaultdesc: '', role, defaultCategoryId: '' }
}
function emptyContractRow(): ContractRow {
  return { id: null, propertyId: '', allProperties: false, contractCount: 1, categoryId: '', description: '', active: true }
}
function contractToRow(c: SupplierContract): ContractRow {
  return {
    id: c.id, propertyId: c.propertyId ?? '', allProperties: c.allProperties,
    contractCount: c.contractCount > 0 ? c.contractCount : 1,
    categoryId: c.defaultCategoryId ?? '', description: c.defaultDescription ?? '', active: c.active,
  }
}

export default function Contacts() {
  const s = useStyles()
  const contactsQ = useContacts()
  const propertiesQ = useProperties()
  const categoriesQ = useCategories()
  const contractsQ = useSupplierContracts()
  const saveContact = useSaveContact()
  const deleteContact = useDeleteContact()
  const saveContract = useSaveSupplierContract()
  const deleteContract = useDeleteSupplierContract()
  const recordActivity = useRecordActivity()

  const contacts = contactsQ.data ?? []
  const properties = propertiesQ.data ?? []
  const categories = (categoriesQ.data ?? []).filter(c => c.type === 233100006) // Expense categories
  const allContracts = contractsQ.data ?? []

  const [tab, setTab] = useState<Tab>('clients')
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<ContactForm>(emptyForm(ContactRole.Client))
  const [contractRows, setContractRows] = useState<ContractRow[]>([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const roleForTab = tab === 'clients' ? ContactRole.Client : ContactRole.Supplier
  const searchLower = search.trim().toLowerCase()
  const visible = contacts
    .filter(c => c.role === roleForTab)
    .filter(c => !searchLower || [c.name, c.email, c.taxId, c.defaultDescription].some(v => v?.toLowerCase().includes(searchLower)))

  const contractInfo = new Map<string, { count: number; propertyCount: number }>()
  for (const c of allContracts.filter(c => c.active)) {
    const entry = contractInfo.get(c.contactId) ?? { count: 0, propertyCount: 0 }
    entry.count++
    contractInfo.set(c.contactId, entry)
  }
  for (const contactId of contractInfo.keys()) {
    const props = new Set(allContracts.filter(c => c.active && c.contactId === contactId).map(c => c.allProperties ? 'ALL' : c.propertyId))
    contractInfo.get(contactId)!.propertyCount = props.size
  }

  function openNew() {
    setForm(emptyForm(roleForTab))
    setContractRows(roleForTab === ContactRole.Supplier ? [emptyContractRow()] : [])
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(c: Contact) {
    setForm({ id: c.id, name: c.name, email: c.email ?? '', taxid: c.taxId ?? '', defaultdesc: c.defaultDescription ?? '', role: c.role, defaultCategoryId: c.defaultCategoryId ?? '' })
    setFormError(null)
    if (c.role === ContactRole.Supplier) {
      const rows = allContracts.filter(sc => sc.contactId === c.id).map(contractToRow)
      setContractRows(rows.length > 0 ? rows : [emptyContractRow()])
    } else {
      setContractRows([])
    }
    setFormOpen(true)
  }

  function closeForm() { setFormOpen(false); setFormError(null); setContractRows([]) }
  function addContractRow() { setContractRows(rs => [...rs, emptyContractRow()]) }
  function updateContractRow(idx: number, patch: Partial<ContractRow>) { setContractRows(rs => rs.map((r, i) => i === idx ? { ...r, ...patch } : r)) }
  function removeContractRow(idx: number) { setContractRows(rs => rs.filter((_, i) => i !== idx)) }

  async function save() {
    if (!form.name.trim()) { setFormError('Name is required.'); return }
    const activeRows = contractRows.filter(r => r.propertyId || r.allProperties)
    if (form.role === ContactRole.Supplier && contractRows.some(r => !r.propertyId && !r.allProperties)) {
      setFormError('Every contract row needs a property, or "All properties" checked.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const contactPayload: Contact | Omit<Contact, 'id'> = {
        ...(form.id ? { id: form.id } : {}),
        name: form.name.trim(), role: form.role,
        email: form.email.trim() || undefined, taxId: form.taxid.trim() || undefined,
        defaultDescription: form.defaultdesc.trim() || undefined,
        regularSupplier: form.role === ContactRole.Supplier ? activeRows.some(r => r.active) : undefined,
        defaultCategoryId: form.defaultCategoryId || undefined,
      } as Contact | Omit<Contact, 'id'>
      const saved = await saveContact.mutateAsync(contactPayload)
      recordActivity.mutate({ action: form.id ? ActivityAction.Updated : ActivityAction.Created, table: ActivityTable.Contact, recordName: form.name.trim() })

      if (form.role === ContactRole.Supplier) {
        const originalIds = new Set(contractRows.filter(r => r.id).map(r => r.id as string))
        const keptIds = new Set(activeRows.filter(r => r.id).map(r => r.id as string))
        for (const id of [...originalIds].filter(id => !keptIds.has(id))) await deleteContract.mutateAsync(id)
        for (const row of activeRows) {
          await saveContract.mutateAsync({
            ...(row.id ? { id: row.id } : {}),
            contactId: saved.id, propertyId: row.allProperties ? undefined : row.propertyId,
            allProperties: row.allProperties, contractCount: row.contractCount > 0 ? row.contractCount : 1,
            defaultCategoryId: row.categoryId || undefined, defaultDescription: row.description.trim() || undefined,
            active: row.active,
          } as SupplierContract | Omit<SupplierContract, 'id'>)
        }
      }
      closeForm()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function del(c: Contact) {
    if (!confirm(`Delete "${c.name}"?`)) return
    if (c.role === ContactRole.Supplier) {
      for (const sc of allContracts.filter(sc => sc.contactId === c.id)) await deleteContract.mutateAsync(sc.id)
    }
    await deleteContact.mutateAsync(c.id)
    recordActivity.mutate({ action: ActivityAction.Deleted, table: ActivityTable.Contact, recordName: c.name })
  }

  const loading = contactsQ.isLoading || propertiesQ.isLoading || categoriesQ.isLoading || contractsQ.isLoading

  return (
    <div style={{ maxWidth: '1000px' }}>
      <div className={s.header}>
        <Text size={600} weight="semibold">Contacts</Text>
        <Button appearance="primary" onClick={openNew}>+ Add {tab === 'clients' ? 'Client' : 'Supplier'}</Button>
      </div>

      <TabList selectedValue={tab} onTabSelect={(_: SelectTabEvent, d: SelectTabData) => setTab(d.value as Tab)} style={{ marginBottom: '16px' }}>
        <Tab value="clients">Clients ({contacts.filter(c => c.role === ContactRole.Client).length})</Tab>
        <Tab value="suppliers">Suppliers ({contacts.filter(c => c.role === ContactRole.Supplier).length})</Tab>
      </TabList>

      <div className={s.search}>
        <Input value={search} onChange={(_, d) => setSearch(d.value)} placeholder={`Search ${tab} by name, email, tax ID or description…`} style={{ width: '100%' }} />
      </div>

      {loading ? <Spinner label="Loading…" /> : visible.length === 0 ? (
        <Text style={{ color: tokens.colorNeutralForeground4 }}>{searchLower ? `No ${tab} match "${search}".` : `No ${tab} yet. Add one above.`}</Text>
      ) : (
        <Table size="small">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Email</TableHeaderCell>
              <TableHeaderCell>Tax ID</TableHeaderCell>
              <TableHeaderCell>Default Description</TableHeaderCell>
              {tab === 'suppliers' && <TableHeaderCell>Default Category</TableHeaderCell>}
              {tab === 'suppliers' && <TableHeaderCell>Regular</TableHeaderCell>}
              <TableHeaderCell />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map(c => {
              const info = contractInfo.get(c.id)
              const catName = categories.find(cat => cat.id === c.defaultCategoryId)?.value
              return (
                <TableRow key={c.id}>
                  <TableCell style={{ fontWeight: 600 }}>{c.name}</TableCell>
                  <TableCell>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : '—'}</TableCell>
                  <TableCell style={{ fontFamily: 'monospace' }}>{c.taxId ?? '—'}</TableCell>
                  <TableCell>{c.defaultDescription ?? '—'}</TableCell>
                  {tab === 'suppliers' && <TableCell>{catName ?? '—'}</TableCell>}
                  {tab === 'suppliers' && (
                    <TableCell>
                      {info && info.count > 0 ? (
                        <Badge appearance="tint" color="success">Yes · {info.propertyCount} propert{info.propertyCount === 1 ? 'y' : 'ies'}</Badge>
                      ) : <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>No</Text>}
                    </TableCell>
                  )}
                  <TableCell>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <Button size="small" appearance="subtle" onClick={() => openEdit(c)}>Edit</Button>
                      <Button size="small" appearance="subtle" onClick={() => del(c)}>Delete</Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={formOpen} onOpenChange={(_, d) => !d.open && closeForm()}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{form.id ? 'Edit Contact' : `Add ${form.role === ContactRole.Client ? 'Client' : 'Supplier'}`}</DialogTitle>
            <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '65vh', overflowY: 'auto' }}>
              <Field label="Name" required>
                <Input value={form.name} onChange={(_, d) => setForm(f => ({ ...f, name: d.value }))} placeholder="Full name or company name" />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.email} onChange={(_, d) => setForm(f => ({ ...f, email: d.value }))} placeholder="Optional" />
              </Field>
              <Field label="Tax ID">
                <Input value={form.taxid} onChange={(_, d) => setForm(f => ({ ...f, taxid: d.value }))} placeholder="Optional" />
              </Field>
              <Field label="Default Description">
                <Textarea value={form.defaultdesc} onChange={(_, d) => setForm(f => ({ ...f, defaultdesc: d.value }))} rows={3} placeholder="Pre-fills the Description field on new invoices for this contact" />
              </Field>

              {form.role === ContactRole.Supplier && (
                <>
                  <Field label="Default Category" hint="Falls back into every property contract below unless overridden there.">
                    <Select value={form.defaultCategoryId} onChange={e => setForm(f => ({ ...f, defaultCategoryId: e.target.value }))}>
                      <option value="">No default category</option>
                      {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.value}</option>)}
                    </Select>
                  </Field>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <Text weight="semibold" size={300}>Property Contracts</Text>
                      <Button size="small" appearance="transparent" onClick={addContractRow}>+ Add contract</Button>
                    </div>
                    <Text size={200} style={{ color: tokens.colorNeutralForeground4, display: 'block', marginBottom: '8px' }}>
                      One row per recurring contract. A supplier with two contracts on a property will produce two rows in Regular Invoices.
                    </Text>

                    {contractRows.map((row, idx) => (
                      <div key={idx} className={s.contractRow}>
                        <div className={s.grid2}>
                          <Field label="Property">
                            <Select value={row.propertyId} disabled={row.allProperties} onChange={e => updateContractRow(idx, { propertyId: e.target.value })}>
                              <option value="">Select property…</option>
                              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </Select>
                          </Field>
                          <Field label="Contract count">
                            <Input type="number" min={1} value={String(row.contractCount)} onChange={(_, d) => updateContractRow(idx, { contractCount: parseInt(d.value, 10) || 1 })} />
                          </Field>
                        </div>
                        <div className={s.grid2}>
                          <Field label="Category override">
                            <Select value={row.categoryId} onChange={e => updateContractRow(idx, { categoryId: e.target.value })}>
                              <option value="">Use supplier default</option>
                              {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.value}</option>)}
                            </Select>
                          </Field>
                          <Field label="Description override">
                            <Input value={row.description} onChange={(_, d) => updateContractRow(idx, { description: d.value })} placeholder="Optional" />
                          </Field>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', gap: '16px' }}>
                            <Checkbox label="All properties" checked={row.allProperties} onChange={(_, d) => updateContractRow(idx, { allProperties: !!d.checked, propertyId: d.checked ? '' : row.propertyId })} />
                            <Checkbox label="Active" checked={row.active} onChange={(_, d) => updateContractRow(idx, { active: !!d.checked })} />
                          </div>
                          <Button size="small" appearance="subtle" onClick={() => removeContractRow(idx)}>Remove</Button>
                        </div>
                      </div>
                    ))}
                    {contractRows.length === 0 && <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>No contracts yet. Add one so this supplier appears in Regular Invoices.</Text>}
                  </div>
                </>
              )}
              {formError && <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{formError}</Text>}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={closeForm}>Cancel</Button>
              <Button appearance="primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
