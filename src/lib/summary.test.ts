import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'
import { summaryCsv, transactionsCsv } from './export'
import { summarize } from './summary'
import { BUILTIN_CATEGORIES } from './taxCategories'
import type { Category, Transaction } from './types'

const custom: Category = {
  id: 'custom-software',
  name: 'Software',
  group: 'Custom',
  line: null,
  description: '',
  deductiblePct: 100,
  parentId: 'sc-18',
  keywords: [],
  builtin: false,
  hidden: false,
  excluded: false,
}
const tracking: Category = { ...custom, id: 'custom-kids', name: 'Kids activities', parentId: null, deductiblePct: 0 }
const categories = [...BUILTIN_CATEGORIES, custom, tracking]

let id = 0
const txn = (categoryId: string | null, amount: number, date = '2026-03-01', description = 'X'): Transaction => ({
  id: ++id,
  importId: 1,
  account: 'Visa',
  date,
  description,
  amount,
  categoryId,
  suggestedId: null,
  suggestionSource: null,
  notes: '',
  merchantKey: 'x',
  fingerprint: String(id),
})

const data = [
  txn('sc-18', 100),
  txn('custom-software', 30),
  txn('sc-24b', 80),
  txn('sc-24b', -10), // refund reduces the line
  txn('sa-11', 50),
  txn('custom-kids', 40),
  txn('personal', 25),
  txn('transfer', 500),
  txn(null, 12.5),
  txn('sc-18', 999, '2025-12-31'),
]

describe('summarize', () => {
  const s = summarize(data, categories, '2026')
  const line = (group: string, lineNo: string) =>
    s.groups.find((g) => g.group === group)!.lines.find((l) => l.target.line === lineNo)!

  it('rolls custom categories into their parent tax line', () => {
    const office = line('Schedule C', '18')
    expect(office.total).toBe(130)
    expect(office.parts.map((p) => [p.category.name, p.total])).toEqual([
      ['Office expense', 100],
      ['Software', 30],
    ])
  })

  it('applies the deductible percentage (meals at 50%) after refunds', () => {
    expect(line('Schedule C', '24b')).toMatchObject({ total: 70, deductible: 35 })
  })

  it('sums groups and keeps lines in IRS order', () => {
    const c = s.groups.find((g) => g.group === 'Schedule C')!
    expect(c.lines.map((l) => l.target.line)).toEqual(['18', '24b'])
    expect(c).toMatchObject({ total: 200, deductible: 165 })
  })

  it('lists custom categories without a tax line on their own', () => {
    const g = s.groups.find((x) => x.group === 'Custom')!
    expect(g.lines.map((l) => [l.target.name, l.total, l.deductible])).toEqual([['Kids activities', 40, 0]])
  })

  it('reports uncategorized and excluded money separately', () => {
    expect(s.uncategorized).toEqual({ count: 1, total: 12.5 })
    expect(s.excluded).toEqual({ count: 1, total: 500 })
  })

  it('filters by year, or includes everything with null', () => {
    expect(line('Schedule C', '18').count).toBe(2)
    const all = summarize(data, categories, null)
    expect(all.groups[0].lines[0].total).toBe(1129)
  })
})

describe('exports', () => {
  it('writes one CSV row per transaction with its tax line', () => {
    const csv = transactionsCsv(
      [txn('custom-software', 30, '2026-01-01', '=HYPERLINK("x")'), txn(null, 5, '2026-01-02', 'PLAIN')],
      categories,
    )
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true }).data
    expect(parsed[0]).toMatchObject({
      Description: `'=HYPERLINK("x")`,
      Category: 'Software',
      Form: 'Schedule C',
      Line: '18',
      'Deductible amount': '30.00',
    })
    expect(parsed[1]).toMatchObject({ Description: 'PLAIN', Category: '', Line: '' })
  })

  it('writes the summary with one row per contributing category', () => {
    const parsed = Papa.parse<Record<string, string>>(summaryCsv(summarize(data, categories, '2026')), { header: true }).data
    expect(parsed.find((r) => r.Category === 'Software')).toMatchObject({ Line: '18', 'Line name': 'Office expense', Total: '30.00' })
  })
})
