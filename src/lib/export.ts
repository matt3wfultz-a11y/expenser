import Papa from 'papaparse'
import { taxTarget, toMap } from './categories'
import { round2 } from './csv'
import type { Summary } from './summary'
import type { Category, Transaction } from './types'

/** Stop spreadsheet apps from treating text cells as formulas. */
function safeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

export function transactionsCsv(transactions: Transaction[], categories: Category[]): string {
  const map = toMap(categories)
  const rows = [...transactions]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0))
    .map((t) => {
      const c = t.categoryId ? map.get(t.categoryId) : undefined
      const target = c ? taxTarget(c, map) : undefined
      return {
        Date: t.date,
        Description: safeText(t.description),
        Amount: t.amount.toFixed(2),
        Account: safeText(t.account),
        Category: c ? safeText(c.name) : '',
        Form: target?.line ? target.group : '',
        Line: target?.line ?? '',
        'Deductible %': c ? String(c.deductiblePct) : '',
        'Deductible amount': c ? round2((t.amount * c.deductiblePct) / 100).toFixed(2) : '',
        Notes: safeText(t.notes),
      }
    })
  return Papa.unparse(rows, { newline: '\r\n' })
}

export function summaryCsv(summary: Summary): string {
  const rows: Record<string, string>[] = []
  for (const g of summary.groups) {
    for (const l of g.lines) {
      for (const p of l.parts) {
        rows.push({
          Form: l.target.line ? g.group : '',
          Line: l.target.line ?? '',
          'Line name': l.target.line ? l.target.name : '',
          Category: safeText(p.category.name),
          Transactions: String(p.count),
          Total: p.total.toFixed(2),
          'Deductible %': String(p.category.deductiblePct),
          'Deductible amount': p.deductible.toFixed(2),
        })
      }
    }
  }
  return Papa.unparse(rows, { newline: '\r\n' })
}

export function download(fileName: string, content: string, type = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
