import Papa from 'papaparse'

// CSV parsing for bank and credit card exports. Column aliases and the
// amount/date normalization rules are ported from the Python parser in
// realtonkaa/smart-expense-categorizer (MIT License, see THIRD_PARTY_NOTICES.md).

const DATE_ALIASES = ['date', 'transaction date', 'trans date', 'trans. date', 'posted date', 'posting date', 'post date', 'value date']
const DESC_ALIASES = [
  'description', 'transaction description', 'memo', 'narrative', 'details',
  'transaction details', 'payee', 'merchant', 'merchant name', 'name', 'particulars',
]
const AMOUNT_ALIASES = ['amount', 'transaction amount', 'net amount', 'value', 'amount (usd)']
const DEBIT_ALIASES = ['debit', 'withdrawal', 'withdrawals', 'charge', 'debit amount', 'money out']
const CREDIT_ALIASES = ['credit', 'deposit', 'deposits', 'credit amount', 'money in']

export interface ColumnMapping {
  date: number | null
  description: number | null
  /** A single signed amount column. Used when present; otherwise debit/credit. */
  amount: number | null
  debit: number | null
  credit: number | null
}

export interface CsvTable {
  headers: string[]
  /** Data rows after the header row. */
  rows: string[][]
  /** Non-empty lines skipped above the header (banks sometimes put a summary there). */
  headerRow: number
}

export type SignConvention = 'auto' | 'negative-is-expense' | 'positive-is-expense'

export interface ParsedRow {
  date: string
  description: string
  /** Positive = money out (expense), negative = money in. */
  amount: number
}

export interface ParseResult {
  rows: ParsedRow[]
  /** Rows dropped because they had no usable amount or description. */
  skipped: number
  /** Convention actually applied (resolves "auto"). */
  convention: Exclude<SignConvention, 'auto'> | 'debit-credit'
}

function findColumn(headers: string[], aliases: string[]): number | null {
  const normalized = headers.map((h) => h.trim().toLowerCase())
  for (const alias of aliases) {
    const i = normalized.indexOf(alias)
    if (i !== -1) return i
  }
  return null
}

export function detectColumns(headers: string[]): ColumnMapping {
  return {
    date: findColumn(headers, DATE_ALIASES),
    description: findColumn(headers, DESC_ALIASES),
    amount: findColumn(headers, AMOUNT_ALIASES),
    debit: findColumn(headers, DEBIT_ALIASES),
    credit: findColumn(headers, CREDIT_ALIASES),
  }
}

function looksLikeHeader(row: string[]): boolean {
  const m = detectColumns(row)
  return m.date !== null && (m.amount !== null || m.debit !== null || m.credit !== null)
}

export function readCsv(text: string): CsvTable {
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ''), {
    skipEmptyLines: 'greedy',
  })
  const all = result.data.map((r) => r.map((c) => (c ?? '').trim()))
  // Use the first row that looks like a header within the first few lines.
  let headerRow = all.slice(0, 15).findIndex(looksLikeHeader)
  if (headerRow === -1) headerRow = 0
  const headers = all[headerRow] ?? []
  const rows = all.slice(headerRow + 1).filter((r) => r.some((c) => c !== ''))
  return { headers, rows, headerRow }
}

/**
 * Parse an amount string. Handles -450.00, ($34.50), $1,234.56, 34.50CR, 12.00 DR.
 * Returns null when the cell holds no number.
 */
export function parseAmount(value: string | undefined): number | null {
  if (value === undefined) return null
  let s = value.trim()
  if (s === '') return null
  let suffix: 'CR' | 'DR' | null = null
  const upper = s.toUpperCase()
  if (upper.endsWith('CR')) suffix = 'CR'
  else if (upper.endsWith('DR')) suffix = 'DR'
  if (suffix) s = s.slice(0, -2).trim()
  // Minus anywhere before the digits ("-45", "$-45", "-$45") or accounting parentheses.
  const negative = (s.startsWith('(') && s.endsWith(')')) || /^[^\d]*[-−]/.test(s)
  s = s.replace(/[()$,\s−+-]/g, '').replace(/^USD/i, '')
  if (!/^\d*\.?\d+$/.test(s)) return null
  let amount = parseFloat(s)
  if (negative) amount = -amount
  if (suffix === 'CR') amount = Math.abs(amount)
  if (suffix === 'DR') amount = -Math.abs(amount)
  return amount
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

function monthNumber(name: string): number | undefined {
  const key = name.toLowerCase()
  return MONTHS[key.slice(0, 4)] ?? MONTHS[key.slice(0, 3)]
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function fullYear(y: string): number {
  const n = parseInt(y, 10)
  if (y.length > 2) return n
  return n < 70 ? 2000 + n : 1900 + n
}

/** Parse a date into ISO yyyy-mm-dd. US month-first wins when ambiguous. Returns the input when unparseable. */
export function parseDate(value: string): string {
  const s = value.trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/)
  if (m) return iso(+m[1], +m[2], +m[3]) ?? s
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) return iso(+m[1], +m[2], +m[3]) ?? s
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s.*)?$/)
  if (m) {
    const a = +m[1]
    const b = +m[2]
    const y = fullYear(m[3])
    // Month-first unless the first number cannot be a month.
    return (a > 12 ? iso(y, b, a) : iso(y, a, b)) ?? s
  }
  // "Jan 2, 2026" / "January 2 2026"
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2}|\d{4})$/)
  if (m) {
    const month = monthNumber(m[1])
    if (month) return iso(fullYear(m[3]), month, +m[2]) ?? s
  }
  // "2 Jan 2026" / "02-Jan-26"
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,9})\.?[\s,-]+(\d{2}|\d{4})$/)
  if (m) {
    const month = monthNumber(m[2])
    if (month) return iso(fullYear(m[3]), month, +m[1]) ?? s
  }
  return s
}

/** Guess the sign convention of a single amount column from the data itself. */
export function detectSign(values: number[]): Exclude<SignConvention, 'auto'> {
  let neg = 0
  let pos = 0
  for (const v of values) {
    if (v < 0) neg++
    else if (v > 0) pos++
  }
  // Bank exports (and Chase cards) show spending as negative; most other card
  // exports show charges as positive. Majority wins; ties assume bank style.
  return neg >= pos ? 'negative-is-expense' : 'positive-is-expense'
}

export function toRows(table: CsvTable, mapping: ColumnMapping, sign: SignConvention): ParseResult {
  const cell = (row: string[], i: number | null) => (i === null ? '' : (row[i] ?? ''))
  const useDebitCredit = mapping.amount === null && (mapping.debit !== null || mapping.credit !== null)

  const raw: { date: string; description: string; value: number }[] = []
  let skipped = 0
  for (const row of table.rows) {
    let description = cell(row, mapping.description).replace(/\s+/g, ' ').trim()
    if (!description) {
      // Fall back to the first non-numeric text cell that is not the date.
      description =
        row.find((c, i) => i !== mapping.date && c && parseAmount(c) === null)?.replace(/\s+/g, ' ').trim() ?? ''
    }
    let value: number | null
    if (useDebitCredit) {
      const debit = parseAmount(cell(row, mapping.debit))
      const credit = parseAmount(cell(row, mapping.credit))
      // Money out is positive here regardless of how the bank signs the columns.
      value = debit === null && credit === null ? null : Math.abs(debit ?? 0) - Math.abs(credit ?? 0)
    } else {
      value = parseAmount(cell(row, mapping.amount))
    }
    if (value === null || !description) {
      skipped++
      continue
    }
    raw.push({ date: parseDate(cell(row, mapping.date)), description, value })
  }

  if (useDebitCredit) {
    return {
      rows: raw.map((r) => ({ date: r.date, description: r.description, amount: r.value })),
      skipped,
      convention: 'debit-credit',
    }
  }

  const convention = sign === 'auto' ? detectSign(raw.map((r) => r.value)) : sign
  const flip = convention === 'negative-is-expense' ? -1 : 1
  return {
    rows: raw.map((r) => ({ date: r.date, description: r.description, amount: round2(r.value * flip) })),
    skipped,
    convention,
  }
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100 + 0 // + 0 turns -0 into 0
}
