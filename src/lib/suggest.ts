import type { Category, SuggestionSource, Transaction } from './types'

// Leading words banks add in front of the merchant name.
const NOISE = new Set([
  'pos', 'purchase', 'debit', 'credit', 'card', 'checkcard', 'check', 'authorized', 'on',
  'recurring', 'payment', 'visa', 'mastercard', 'ach', 'web', 'ppd', 'id',
  // Payment processors that prefix the real merchant ("SQ *", "TST*", "PAYPAL *").
  'sq', 'tst', 'paypal', 'pp', 'sp',
])

/**
 * Reduce a bank description to a stable merchant key so the same merchant
 * matches across statements: "SQ *JOE'S COFFEE #1234 SEATTLE WA" -> "joe's coffee seattle".
 */
export function merchantKey(description: string): string {
  const tokens = description
    .toLowerCase()
    .replace(/[^a-z&' ]+/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^'+|'+$/g, ''))
    .filter((t) => t.length > 1 || t === '&')
  while (tokens.length > 1 && NOISE.has(tokens[0])) tokens.shift()
  const key = tokens.slice(0, 3).join(' ')
  return key || description.trim().toLowerCase()
}

/**
 * For each merchant, the category the user picked most often (latest wins ties).
 * Only confirmed categorizations count, never suggestions.
 */
export function buildHistory(transactions: Transaction[]): Map<string, string> {
  const counts = new Map<string, Map<string, { n: number; last: number }>>()
  for (const t of transactions) {
    if (!t.categoryId) continue
    let byCat = counts.get(t.merchantKey)
    if (!byCat) counts.set(t.merchantKey, (byCat = new Map()))
    const entry = byCat.get(t.categoryId) ?? { n: 0, last: 0 }
    entry.n++
    entry.last = Math.max(entry.last, t.id ?? 0)
    byCat.set(t.categoryId, entry)
  }
  const history = new Map<string, string>()
  for (const [key, byCat] of counts) {
    let best: [string, { n: number; last: number }] | null = null
    for (const e of byCat) {
      if (!best || e[1].n > best[1].n || (e[1].n === best[1].n && e[1].last > best[1].last)) best = e
    }
    if (best) history.set(key, best[0])
  }
  return history
}

interface Matcher {
  categoryId: string
  keyword: string
  re: RegExp
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Compile whole-word keyword matchers, longest keyword first so specific ones win. */
export function buildMatchers(categories: Category[]): Matcher[] {
  const matchers: Matcher[] = []
  for (const c of categories) {
    if (c.hidden) continue
    for (const kw of c.keywords) {
      const k = kw.trim().toLowerCase()
      if (!k) continue
      matchers.push({ categoryId: c.id, keyword: k, re: new RegExp(`(^|[^a-z0-9])${escapeRegExp(k)}($|[^a-z0-9])`) })
    }
  }
  // Stable sort keeps category order for equal-length keywords.
  return matchers.sort((a, b) => b.keyword.length - a.keyword.length)
}

export function keywordMatch(description: string, matchers: Matcher[]): string | null {
  const d = description.toLowerCase()
  for (const m of matchers) if (m.re.test(d)) return m.categoryId
  return null
}

export interface Suggester {
  (t: Pick<Transaction, 'description' | 'merchantKey'>): { id: string; source: SuggestionSource } | null
}

export function makeSuggester(categories: Category[], transactions: Transaction[]): Suggester {
  const valid = new Set(categories.filter((c) => !c.hidden).map((c) => c.id))
  const history = buildHistory(transactions)
  const matchers = buildMatchers(categories)
  return (t) => {
    const fromHistory = history.get(t.merchantKey)
    if (fromHistory && valid.has(fromHistory)) return { id: fromHistory, source: 'history' }
    const fromKeyword = keywordMatch(t.description, matchers)
    if (fromKeyword) return { id: fromKeyword, source: 'keyword' }
    return null
  }
}
