import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectColumns, readCsv, toRows } from './csv'
import {
  acceptSuggestions,
  clearAll,
  countDuplicates,
  deleteCategory,
  deleteImport,
  ensureBuiltins,
  exportBackup,
  ExpenserDB,
  importRows,
  parseBackup,
  restoreBackup,
  saveCategory,
  setCategory,
} from './db'
import { BUILTIN_CATEGORIES } from './taxCategories'
import type { Category } from './types'

let database: ExpenserDB
let n = 0

beforeEach(async () => {
  database = new ExpenserDB(`test-${n++}`)
  await ensureBuiltins(database)
})

afterEach(async () => {
  await database.delete()
})

const CSV = `Date,Description,Amount
2026-01-02,GOOGLE ADS - CAMPAIGN #4521,-450.00
2026-01-03,STARBUCKS #8822 SEATTLE,-6.75
2026-01-03,STARBUCKS #8822 SEATTLE,-6.75
2026-02-03,STARBUCKS #9001 SEATTLE,-5.25
2026-01-05,ACME WIDGETS,-20.00`

function rows(text = CSV) {
  const t = readCsv(text)
  return toRows(t, detectColumns(t.headers), 'auto').rows
}

describe('import', () => {
  it('stores rows with keyword suggestions', async () => {
    const rec = await importRows('jan.csv', 'Visa', rows(), database)
    expect(rec).toMatchObject({ added: 5, duplicates: 0 })
    const all = await database.transactions.toArray()
    expect(all.find((t) => t.description.startsWith('GOOGLE'))).toMatchObject({
      amount: 450,
      suggestedId: 'sc-08',
      suggestionSource: 'keyword',
      categoryId: null,
    })
    expect(all.find((t) => t.description === 'ACME WIDGETS')?.suggestedId).toBeNull()
  })

  it('skips rows already imported for the same account, keeping same-day repeats', async () => {
    await importRows('jan.csv', 'Visa', rows(), database)
    expect(await countDuplicates(rows(), 'Visa', database)).toBe(5)
    const again = await importRows('jan-again.csv', 'visa', rows(), database)
    expect(again).toMatchObject({ added: 0, duplicates: 5 })
    // The two identical coffees on Jan 3 are both kept.
    expect(await database.transactions.count()).toBe(5)
    // A different account is a different card, so nothing is a duplicate.
    expect(await countDuplicates(rows(), 'Amex', database)).toBe(0)
  })

  it('deleting an import removes its transactions', async () => {
    const rec = await importRows('jan.csv', 'Visa', rows(), database)
    await deleteImport(rec.id!, database)
    expect(await database.transactions.count()).toBe(0)
    expect(await database.imports.count()).toBe(0)
  })
})

describe('categorizing', () => {
  it('learns from your choice for the same merchant', async () => {
    await importRows('jan.csv', 'Visa', rows(), database)
    const coffee = await database.transactions.where('merchantKey').equals('starbucks seattle').toArray()
    expect(coffee).toHaveLength(3)
    await setCategory([coffee[0].id!], 'personal', database)
    const rest = await database.transactions.bulkGet(coffee.slice(1).map((t) => t.id!))
    for (const t of rest) expect(t).toMatchObject({ suggestedId: 'personal', suggestionSource: 'history' })
  })

  it('accepts suggestions in bulk, leaving rows without one alone', async () => {
    await importRows('jan.csv', 'Visa', rows(), database)
    const ids = (await database.transactions.toCollection().primaryKeys()) as number[]
    expect(await acceptSuggestions(ids, database)).toBe(4)
    const acme = await database.transactions.filter((t) => t.description === 'ACME WIDGETS').first()
    expect(acme?.categoryId).toBeNull()
  })
})

describe('custom categories', () => {
  const custom = (over: Partial<Category> = {}): Category => ({
    id: 'custom-a',
    name: 'Client gifts',
    group: 'Custom',
    line: null,
    description: '',
    deductiblePct: 100,
    parentId: 'sc-27a',
    keywords: ['acme'],
    builtin: false,
    hidden: false,
    excluded: false,
    ...over,
  })

  it('suggests a new custom category from its keywords', async () => {
    await importRows('jan.csv', 'Visa', rows(), database)
    await saveCategory(custom(), database)
    const acme = await database.transactions.filter((t) => t.description === 'ACME WIDGETS').first()
    expect(acme?.suggestedId).toBe('custom-a')
  })

  it('rejects duplicate names, case-insensitively', async () => {
    await expect(saveCategory(custom({ id: 'custom-b', name: 'advertising' }), database)).rejects.toThrow(/already exists/)
  })

  it('deleting one sends its transactions back to review', async () => {
    await importRows('jan.csv', 'Visa', rows(), database)
    await saveCategory(custom(), database)
    const acme = await database.transactions.filter((t) => t.description === 'ACME WIDGETS').first()
    await setCategory([acme!.id!], 'custom-a', database)
    await deleteCategory('custom-a', database)
    expect((await database.transactions.get(acme!.id!))?.categoryId).toBeNull()
    expect(await database.categories.get('custom-a')).toBeUndefined()
  })

  it('refuses to delete built-ins', async () => {
    await expect(deleteCategory('sc-08', database)).rejects.toThrow(/hidden but not deleted/)
  })
})

describe('backup', () => {
  it('round-trips through JSON', async () => {
    await importRows('jan.csv', 'Visa', rows(), database)
    const coffee = await database.transactions.where('merchantKey').equals('starbucks seattle').first()
    await setCategory([coffee!.id!], 'personal', database)
    const json = JSON.stringify(await exportBackup(database))

    await clearAll(database)
    expect(await database.transactions.count()).toBe(0)
    expect(await database.categories.count()).toBe(BUILTIN_CATEGORIES.length)

    await restoreBackup(parseBackup(json), database)
    expect(await database.transactions.count()).toBe(5)
    expect((await database.transactions.get(coffee!.id!))?.categoryId).toBe('personal')
  })

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('{"hello":1}')).toThrow(/not an Expenser backup/)
    expect(() => parseBackup('nope')).toThrow(/not valid JSON/)
  })
})
