import { compareLines, taxTarget, toMap } from './categories'
import { round2 } from './csv'
import { GROUP_ORDER } from './taxCategories'
import type { Category, CategoryGroup, Transaction } from './types'

export interface SummaryPart {
  category: Category
  count: number
  total: number
  deductible: number
}

/** One row per tax line (or per standalone category), with roll-up parts. */
export interface SummaryLine {
  target: Category
  count: number
  total: number
  deductible: number
  /** The categories contributing to this line, e.g. the line itself plus custom roll-ups. */
  parts: SummaryPart[]
}

export interface SummaryGroup {
  group: CategoryGroup
  lines: SummaryLine[]
  total: number
  deductible: number
}

export interface Summary {
  groups: SummaryGroup[]
  uncategorized: { count: number; total: number }
  excluded: { count: number; total: number }
}

export function yearOf(t: Pick<Transaction, 'date'>): string {
  return /^\d{4}-/.test(t.date) ? t.date.slice(0, 4) : 'Unknown'
}

export function summarize(transactions: Transaction[], categories: Category[], year: string | null): Summary {
  const map = toMap(categories)
  const lines = new Map<string, SummaryLine>()
  const uncategorized = { count: 0, total: 0 }
  const excluded = { count: 0, total: 0 }

  for (const t of transactions) {
    if (year && yearOf(t) !== year) continue
    const category = t.categoryId ? map.get(t.categoryId) : undefined
    if (!category) {
      uncategorized.count++
      uncategorized.total += t.amount
      continue
    }
    if (category.excluded) {
      excluded.count++
      excluded.total += t.amount
      continue
    }
    const target = taxTarget(category, map)
    let line = lines.get(target.id)
    if (!line) lines.set(target.id, (line = { target, count: 0, total: 0, deductible: 0, parts: [] }))
    let part = line.parts.find((p) => p.category.id === category.id)
    if (!part) line.parts.push((part = { category, count: 0, total: 0, deductible: 0 }))
    const deductible = (t.amount * category.deductiblePct) / 100
    part.count++
    part.total += t.amount
    part.deductible += deductible
    line.count++
    line.total += t.amount
    line.deductible += deductible
  }

  const groups: SummaryGroup[] = []
  for (const group of GROUP_ORDER) {
    const groupLines = [...lines.values()]
      .filter((l) => l.target.group === group)
      .sort((a, b) =>
        group === 'Custom' ? a.target.name.localeCompare(b.target.name) : compareLines(a.target.line, b.target.line),
      )
    if (!groupLines.length) continue
    for (const l of groupLines) {
      l.total = round2(l.total)
      l.deductible = round2(l.deductible)
      // The line's own category first, then custom roll-ups by name.
      l.parts.sort((a, b) =>
        a.category.id === l.target.id ? -1 : b.category.id === l.target.id ? 1 : a.category.name.localeCompare(b.category.name),
      )
      for (const p of l.parts) {
        p.total = round2(p.total)
        p.deductible = round2(p.deductible)
      }
    }
    groups.push({
      group,
      lines: groupLines,
      total: round2(groupLines.reduce((s, l) => s + l.total, 0)),
      deductible: round2(groupLines.reduce((s, l) => s + l.deductible, 0)),
    })
  }

  uncategorized.total = round2(uncategorized.total)
  excluded.total = round2(excluded.total)
  return { groups, uncategorized, excluded }
}
