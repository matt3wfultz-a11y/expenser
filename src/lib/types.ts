export type CategoryGroup = 'Schedule C' | 'Schedule A' | 'Custom' | 'Other'

export interface Category {
  /** Stable id. Built-ins use fixed ids (e.g. "sc-18"); custom ones are "custom-<uuid>". */
  id: string
  name: string
  group: CategoryGroup
  /** IRS form line (e.g. "24b"). Null for custom and non-tax categories. */
  line: string | null
  description: string
  /** Share of the amount that counts as deductible, 0–100 (meals are 50). */
  deductiblePct: number
  /** Custom categories can roll up into a built-in tax category's line. */
  parentId: string | null
  /** Case-insensitive whole-word matches used to suggest this category. */
  keywords: string[]
  builtin: boolean
  /** Hidden categories are left out of pickers but keep their transactions. */
  hidden: boolean
  /** Transfers, card payments and income are left out of expense totals. */
  excluded: boolean
}

export type SuggestionSource = 'history' | 'keyword'

export interface Transaction {
  id?: number
  importId: number
  account: string
  /** ISO yyyy-mm-dd when the source date could be parsed, otherwise the raw text. */
  date: string
  description: string
  /** Positive = money out (an expense). Negative = money in (refund, credit). */
  amount: number
  categoryId: string | null
  suggestedId: string | null
  suggestionSource: SuggestionSource | null
  notes: string
  merchantKey: string
  fingerprint: string
}

export interface ImportRecord {
  id?: number
  fileName: string
  account: string
  importedAt: string
  added: number
  duplicates: number
}
