import { GROUP_ORDER } from './taxCategories'
import type { Category } from './types'

export type CategoryMap = Map<string, Category>

export function toMap(categories: Category[]): CategoryMap {
  return new Map(categories.map((c) => [c.id, c]))
}

/** The category whose IRS line a category counts toward: its parent if it rolls up, else itself. */
export function taxTarget(category: Category, map: CategoryMap): Category {
  if (category.parentId) {
    const parent = map.get(category.parentId)
    if (parent) return parent
  }
  return category
}

export function formShort(group: Category['group']): string {
  if (group === 'Schedule C') return 'Sch C'
  if (group === 'Schedule A') return 'Sch A'
  return ''
}

/** Short IRS reference such as "Sch C 24b", or "" when the category has no tax line. */
export function lineRef(category: Category, map: CategoryMap): string {
  const target = taxTarget(category, map)
  if (!target.line) return ''
  return `${formShort(target.group)} ${target.line}`
}

/** Label used in pickers, e.g. "18 · Office expense" or "Client gifts (→ Sch C 27a)". */
export function optionLabel(category: Category, map: CategoryMap): string {
  if (category.group === 'Custom') {
    const ref = lineRef(category, map)
    return ref ? `${category.name} (→ ${ref})` : category.name
  }
  return category.line ? `${category.line} · ${category.name}` : category.name
}

/** Natural order for IRS line numbers: 8 < 9 < 10 < 16a < 16b < 20a. */
export function compareLines(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  const na = parseInt(a, 10)
  const nb = parseInt(b, 10)
  if (na !== nb) return (Number.isNaN(na) ? Infinity : na) - (Number.isNaN(nb) ? Infinity : nb)
  return a.localeCompare(b)
}

export function sortCategories(categories: Category[]): Category[] {
  return [...categories].sort((a, b) => {
    const g = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)
    if (g !== 0) return g
    if (a.group === 'Custom') return a.name.localeCompare(b.name)
    return compareLines(a.line, b.line)
  })
}

/** Categories that tax-line roll-ups can point at: built-in Schedule C and A lines. */
export function rollupTargets(categories: Category[]): Category[] {
  return sortCategories(
    categories.filter((c) => c.builtin && (c.group === 'Schedule C' || c.group === 'Schedule A')),
  )
}

export function parseKeywords(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of text.split(/[,\n]/)) {
    const kw = raw.trim().toLowerCase()
    if (kw && !seen.has(kw)) {
      seen.add(kw)
      out.push(kw)
    }
  }
  return out
}
