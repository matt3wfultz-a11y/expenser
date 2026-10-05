import { useMemo } from 'react'
import { optionLabel, sortCategories, toMap } from './lib/categories'
import { GROUP_LABELS, GROUP_ORDER } from './lib/taxCategories'
import type { Category } from './lib/types'

export interface OptionGroup {
  label: string
  options: { id: string; label: string }[]
}

export interface CategoryOptions {
  groups: OptionGroup[]
  labels: Map<string, string>
}

/** Picker options grouped by form, in IRS line order. Hidden categories are left out. */
export function useCategoryOptions(categories: Category[]): CategoryOptions {
  return useMemo(() => {
    const map = toMap(categories)
    const labels = new Map(categories.map((c) => [c.id, optionLabel(c, map)]))
    const sorted = sortCategories(categories)
    const groups = GROUP_ORDER.map((group) => ({
      label: GROUP_LABELS[group],
      options: sorted
        .filter((c) => c.group === group && !c.hidden)
        .map((c) => ({ id: c.id, label: labels.get(c.id)! })),
    })).filter((g) => g.options.length > 0)
    return { groups, labels }
  }, [categories])
}
