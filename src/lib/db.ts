import Dexie, { type EntityTable } from 'dexie'
import type { ParsedRow } from './csv'
import { makeSuggester, merchantKey } from './suggest'
import { BUILTIN_CATEGORIES } from './taxCategories'
import type { Category, ImportRecord, Transaction } from './types'

// Everything lives in the browser's IndexedDB. Nothing is sent to a server.

export class ExpenserDB extends Dexie {
  categories!: EntityTable<Category, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  imports!: EntityTable<ImportRecord, 'id'>

  constructor(name = 'expenser') {
    super(name)
    this.version(1).stores({
      categories: 'id, group',
      transactions: '++id, importId, categoryId, fingerprint, merchantKey, date',
      imports: '++id',
    })
  }
}

export const db = new ExpenserDB()

/** Add any built-in categories that are missing, leaving the user's edits alone. */
export async function ensureBuiltins(database: ExpenserDB = db): Promise<void> {
  await database.transaction('rw', database.categories, async () => {
    const existing = new Set(await database.categories.toCollection().primaryKeys())
    const missing = BUILTIN_CATEGORIES.filter((c) => !existing.has(c.id))
    if (missing.length) await database.categories.bulkAdd(missing)
  })
}

/**
 * Identity of a row for duplicate detection: the same date, amount and
 * description. The occurrence counter keeps two identical $5 coffees on the
 * same day as two rows, while re-importing the same file adds nothing.
 */
export function fingerprints(rows: ParsedRow[]): string[] {
  const seen = new Map<string, number>()
  return rows.map((r) => {
    const base = `${r.date}|${r.amount.toFixed(2)}|${r.description.toLowerCase()}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return `${base}|${n}`
  })
}

function accountFingerprints(rows: ParsedRow[], account: string): string[] {
  return fingerprints(rows).map((f) => `${account.trim().toLowerCase()}|${f}`)
}

async function existingFingerprints(fps: string[], database: ExpenserDB): Promise<Set<string>> {
  const matches = await database.transactions.where('fingerprint').anyOf(fps).toArray()
  return new Set(matches.map((t) => t.fingerprint))
}

/** How many of these rows are already stored for this account. */
export async function countDuplicates(rows: ParsedRow[], account: string, database: ExpenserDB = db): Promise<number> {
  const fps = accountFingerprints(rows, account)
  const existing = await existingFingerprints(fps, database)
  return fps.filter((f) => existing.has(f)).length
}

export async function importRows(
  fileName: string,
  account: string,
  rows: ParsedRow[],
  database: ExpenserDB = db,
): Promise<ImportRecord> {
  const fps = accountFingerprints(rows, account)
  return database.transaction('rw', database.transactions, database.imports, database.categories, async () => {
    const existing = await existingFingerprints(fps, database)
    const record: ImportRecord = {
      fileName,
      account,
      importedAt: new Date().toISOString(),
      added: 0,
      duplicates: 0,
    }
    const importId = (await database.imports.add(record)) as number
    const fresh: Transaction[] = []
    rows.forEach((r, i) => {
      if (existing.has(fps[i])) {
        record.duplicates++
        return
      }
      existing.add(fps[i])
      fresh.push({
        importId,
        account,
        date: r.date,
        description: r.description,
        amount: r.amount,
        categoryId: null,
        suggestedId: null,
        suggestionSource: null,
        notes: '',
        merchantKey: merchantKey(r.description),
        fingerprint: fps[i],
      })
    })
    record.added = fresh.length
    await database.transactions.bulkAdd(fresh)
    await database.imports.update(importId, { added: record.added, duplicates: record.duplicates })
    await refreshSuggestions(database)
    return { ...record, id: importId }
  })
}

/** Recompute suggestions for every uncategorized transaction. */
export async function refreshSuggestions(database: ExpenserDB = db): Promise<void> {
  await database.transaction('rw', database.transactions, database.categories, async () => {
    const [categories, transactions] = await Promise.all([
      database.categories.toArray(),
      database.transactions.toArray(),
    ])
    const suggest = makeSuggester(categories, transactions)
    const changed: { key: number; changes: Partial<Transaction> }[] = []
    for (const t of transactions) {
      const s = t.categoryId ? null : suggest(t)
      const id = s?.id ?? null
      const source = s?.source ?? null
      if (t.suggestedId !== id || t.suggestionSource !== source) {
        changed.push({ key: t.id!, changes: { suggestedId: id, suggestionSource: source } })
      }
    }
    if (changed.length) await database.transactions.bulkUpdate(changed)
  })
}

export async function setCategory(ids: number[], categoryId: string | null, database: ExpenserDB = db): Promise<void> {
  if (!ids.length) return
  await database.transaction('rw', database.transactions, database.categories, async () => {
    await database.transactions.bulkUpdate(ids.map((key) => ({ key, changes: { categoryId } })))
    await refreshSuggestions(database)
  })
}

export async function acceptSuggestions(ids: number[], database: ExpenserDB = db): Promise<number> {
  return database.transaction('rw', database.transactions, database.categories, async () => {
    const rows = await database.transactions.bulkGet(ids)
    const updates = rows
      .filter((t): t is Transaction => !!t && !t.categoryId && !!t.suggestedId)
      .map((t) => ({ key: t.id!, changes: { categoryId: t.suggestedId } }))
    if (updates.length) {
      await database.transactions.bulkUpdate(updates)
      await refreshSuggestions(database)
    }
    return updates.length
  })
}

export async function setNotes(id: number, notes: string, database: ExpenserDB = db): Promise<void> {
  await database.transactions.update(id, { notes })
}

export async function deleteImport(importId: number, database: ExpenserDB = db): Promise<void> {
  await database.transaction('rw', database.transactions, database.imports, database.categories, async () => {
    await database.transactions.where('importId').equals(importId).delete()
    await database.imports.delete(importId)
    await refreshSuggestions(database)
  })
}

export function newCategoryId(): string {
  return `custom-${crypto.randomUUID()}`
}

export async function saveCategory(category: Category, database: ExpenserDB = db): Promise<void> {
  await database.transaction('rw', database.transactions, database.categories, async () => {
    const clash = await database.categories
      .filter((c) => c.id !== category.id && c.name.trim().toLowerCase() === category.name.trim().toLowerCase())
      .first()
    if (clash) throw new Error(`A category named "${clash.name}" already exists.`)
    await database.categories.put(category)
    await refreshSuggestions(database)
  })
}

/** Delete a custom category. Its transactions go back to uncategorized. */
export async function deleteCategory(id: string, database: ExpenserDB = db): Promise<void> {
  await database.transaction('rw', database.transactions, database.categories, async () => {
    const category = await database.categories.get(id)
    if (!category) return
    if (category.builtin) throw new Error('Built-in categories can be hidden but not deleted.')
    await database.transactions.where('categoryId').equals(id).modify({ categoryId: null })
    await database.categories.delete(id)
    await refreshSuggestions(database)
  })
}

// ── Backup ────────────────────────────────────────────────────────────────────

export interface Backup {
  app: 'expenser'
  version: 1
  exportedAt: string
  categories: Category[]
  imports: ImportRecord[]
  transactions: Transaction[]
}

export async function exportBackup(database: ExpenserDB = db): Promise<Backup> {
  const [categories, imports, transactions] = await Promise.all([
    database.categories.toArray(),
    database.imports.toArray(),
    database.transactions.toArray(),
  ])
  return { app: 'expenser', version: 1, exportedAt: new Date().toISOString(), categories, imports, transactions }
}

export function parseBackup(text: string): Backup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  const b = data as Partial<Backup>
  if (b?.app !== 'expenser' || !Array.isArray(b.categories) || !Array.isArray(b.transactions) || !Array.isArray(b.imports)) {
    throw new Error('That file is not an Expenser backup.')
  }
  if (b.version !== 1) throw new Error(`Unsupported backup version: ${String(b.version)}`)
  return b as Backup
}

/** Replace all data with the backup's contents. */
export async function restoreBackup(backup: Backup, database: ExpenserDB = db): Promise<void> {
  await database.transaction('rw', database.categories, database.transactions, database.imports, async () => {
    await Promise.all([database.categories.clear(), database.transactions.clear(), database.imports.clear()])
    await database.categories.bulkAdd(backup.categories)
    await database.imports.bulkAdd(backup.imports)
    await database.transactions.bulkAdd(backup.transactions)
  })
  await ensureBuiltins(database)
}

export async function clearAll(database: ExpenserDB = db): Promise<void> {
  await database.transaction('rw', database.categories, database.transactions, database.imports, async () => {
    await Promise.all([database.categories.clear(), database.transactions.clear(), database.imports.clear()])
  })
  await ensureBuiltins(database)
}
