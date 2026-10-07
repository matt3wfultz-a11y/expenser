import { type CsvTable, parseAmount, parseDate } from './csv'

// Turns the text lines of a PDF bank or card statement into the same table
// shape the CSV importer uses (Date, Description, Amount), so the rest of the
// import flow (preview, sign handling, de-duplication) is shared.
//
// A transaction line starts with a date and ends with one or more amounts:
//   01/05 01/06 STARBUCKS #1234 SEATTLE WA      5.75
//   Jan 5   ACH DEPOSIT ACME CORP     1,200.00   3,450.12
// When a line ends with two amounts, the last is a running balance; the change
// in balance from the previous line tells money in from money out.

export interface StatementResult {
  table: CsvTable
  /** True when some dates had no year and `year` was used to fill it in. */
  usedYear: boolean
  /** Year guessed from full dates in the statement (closing date), if any. */
  guessedYear: number | null
  /** Amounts were signed from running balances: positive = money in. */
  signedFromBalance: boolean
}

const MONTH_NAMES = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december'
// Date at the very start of a line, with or without a year.
const LEADING_DATE = new RegExp(
  String.raw`^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}(?:[/.-](?:\d{4}|\d{2}))?|(?:${MONTH_NAMES})\.?\s+\d{1,2}(?:,?\s+\d{4})?)(?=\s|$)`,
  'i',
)
const SECOND_DATE = new RegExp(String.raw`^\s*(\d{1,2}[/.-]\d{1,2}(?:[/.-](?:\d{4}|\d{2}))?|(?:${MONTH_NAMES})\.?\s+\d{1,2})(?=\s)`, 'i')
// Money always has cents in statements, which keeps store numbers like "#1234" out.
const MONEY = /^\(?[-−]?\$?[-−]?\d{1,3}(?:,\d{3})*\.\d{2}\)?(?:CR|DR)?$/i
const FULL_DATE = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g
const SKIP = /^(previous|new|beginning|ending|opening|closing|starting|daily)\s+balance|^total\b|^balance\b/i

function hasYear(token: string): boolean {
  return /\d{4}/.test(token) || /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2}$/.test(token)
}

/** Latest complete date (with a year) in the text, typically the closing date. */
export function guessClosingDate(lines: string[]): { year: number; month: number } | null {
  let best: { year: number; month: number; day: number } | null = null
  for (const line of lines) {
    for (const m of line.matchAll(FULL_DATE)) {
      const iso = parseDate(m[0])
      const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
      if (!parts) continue
      const [year, month, day] = [+parts[1], +parts[2], +parts[3]]
      if (year < 1990 || year > 2100) continue
      if (!best || year * 10000 + month * 100 + day > best.year * 10000 + best.month * 100 + best.day) {
        best = { year, month, day }
      }
    }
  }
  return best && { year: best.year, month: best.month }
}

interface RawLine {
  dateToken: string
  description: string
  amounts: string[]
}

function splitLine(line: string): RawLine | null {
  const text = line.replace(/\s+/g, ' ').trim()
  const d = LEADING_DATE.exec(text)
  if (!d) return null
  let rest = text.slice(d[0].length)
  // Card statements often show transaction date then posting date.
  const second = SECOND_DATE.exec(rest)
  if (second) rest = rest.slice(second[0].length)
  const tokens = rest.trim().split(' ')
  const amounts: string[] = []
  while (tokens.length && MONEY.test(tokens[tokens.length - 1])) {
    let amount = tokens.pop()!
    // "$ 45.00", "- 45.00" and "- $ 45.00" arrive as separate tokens.
    if (tokens[tokens.length - 1] === '$') tokens.pop()
    if (tokens[tokens.length - 1] === '-' || tokens[tokens.length - 1] === '−') {
      tokens.pop()
      amount = `-${amount}`
    }
    amounts.unshift(amount)
  }
  const description = tokens.join(' ').trim()
  if (!amounts.length || !description || SKIP.test(description)) return null
  return { dateToken: d[0], description, amounts }
}

/** "01/05" -> "01/05/2026", "Jan 5" -> "Jan 5, 2026". */
function withYear(token: string, year: number): string {
  const t = token.replace(/\.$/, '')
  return /^\d/.test(t) ? `${t}/${year}` : `${t}, ${year}`
}

export function parseStatementLines(lines: string[], year?: number): StatementResult {
  const closing = guessClosingDate(lines)
  const fillYear = year ?? closing?.year ?? new Date().getFullYear()
  let usedYear = false

  const raw = lines.map(splitLine).filter((r): r is RawLine => r !== null)
  const rows: string[][] = []
  let prevBalance: number | null = null
  let balanceSigned = 0

  for (const r of raw) {
    let date: string
    if (hasYear(r.dateToken)) {
      date = parseDate(r.dateToken)
    } else {
      usedYear = true
      // A month after the closing month belongs to the year before
      // (a December purchase on a statement that closes in January).
      const month = +parseDate(withYear(r.dateToken, 2000)).slice(5, 7)
      const y = closing && month > closing.month ? fillYear - 1 : fillYear
      date = parseDate(withYear(r.dateToken, y))
    }

    let amount = parseAmount(r.amounts[0]) ?? 0
    if (r.amounts.length >= 2) {
      const balance = parseAmount(r.amounts[r.amounts.length - 1])
      if (balance !== null && prevBalance !== null) {
        const delta = Math.round((balance - prevBalance) * 100) / 100
        if (Math.abs(Math.abs(delta) - Math.abs(amount)) < 0.005) {
          amount = delta
          balanceSigned++
        }
      }
      prevBalance = balance
    }
    rows.push([date, r.description, amount.toFixed(2)])
  }

  const signedFromBalance = balanceSigned > 0 && balanceSigned >= rows.length / 2
  return {
    table: { headers: ['Date', 'Description', 'Amount'], rows, headerRow: 0 },
    usedYear,
    guessedYear: closing?.year ?? null,
    signedFromBalance,
  }
}
