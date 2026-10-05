import { describe, expect, it } from 'vitest'
import { buildHistory, buildMatchers, keywordMatch, makeSuggester, merchantKey } from './suggest'
import { BUILTIN_CATEGORIES } from './taxCategories'
import type { Category, Transaction } from './types'

const txn = (over: Partial<Transaction>): Transaction => ({
  importId: 1,
  account: 'card',
  date: '2026-01-01',
  description: '',
  amount: 10,
  categoryId: null,
  suggestedId: null,
  suggestionSource: null,
  notes: '',
  merchantKey: merchantKey(over.description ?? ''),
  fingerprint: String(Math.random()),
  ...over,
})

describe('merchantKey', () => {
  it.each([
    ["SQ *JOE'S COFFEE #1234 SEATTLE WA", "joe's coffee seattle"],
    ['TST* JOES DINER 0042', 'joes diner'],
    ['PAYPAL *NETFLIX.COM', 'netflix com'],
    ['UBER *TRIP HELP.UBER.COM', 'uber trip help'],
    ['UBER *EATS', 'uber eats'],
    ['AMZN Mktp US*2K3AB1CD0', 'amzn mktp us'],
    ['PURCHASE AUTHORIZED ON 01/05 STARBUCKS STORE 123', 'starbucks store'],
    ['CHECKCARD 0105 SHELL OIL 57444', 'shell oil'],
  ])('%s -> %s', (input, expected) => {
    expect(merchantKey(input)).toBe(expected)
  })

  it('matches the same merchant across statements', () => {
    expect(merchantKey('STARBUCKS #8822 SEATTLE')).toBe(merchantKey('STARBUCKS #1001 SEATTLE'))
  })
})

describe('keywordMatch', () => {
  const matchers = buildMatchers(BUILTIN_CATEGORIES)

  it.each([
    ['GOOGLE ADS - CAMPAIGN #4521', 'sc-08'],
    ['SHELL GAS STATION #1234', 'sc-09'],
    ['STAPLES OFFICE SUPPLY', 'sc-18'],
    ['DELTA AIR LINES 0062', 'sc-24a'],
    ['UBER EATS', 'sc-24b'],
    ['UBER TRIP', 'sc-24a'],
    ['SOCAL GAS COMPANY', 'sc-25'],
    ['AT&T WIRELESS', 'sc-25'],
    ['NETFLIX.COM', 'personal'],
    ['PAYMENT THANK YOU - WEB', 'transfer'],
    ['CVS PHARMACY #123', 'sa-01'],
  ])('%s -> %s', (description, expected) => {
    expect(keywordMatch(description, matchers)).toBe(expected)
  })

  it('only matches whole words', () => {
    // "gas" must not match inside "VEGAS"; "rent" must not match "PARENT".
    expect(keywordMatch('LAS VEGAS SOUVENIRS', matchers)).toBeNull()
    expect(keywordMatch('PARENT TEACHER ASSOC', matchers)).toBeNull()
  })

  it('ignores hidden categories', () => {
    const cats = BUILTIN_CATEGORIES.map((c) => (c.id === 'personal' ? { ...c, hidden: true } : c))
    expect(keywordMatch('NETFLIX.COM', buildMatchers(cats))).toBeNull()
  })

  it('uses keywords on custom categories', () => {
    const custom: Category = {
      ...BUILTIN_CATEGORIES[0],
      id: 'custom-1',
      name: 'Podcast gear',
      group: 'Custom',
      line: null,
      builtin: false,
      keywords: ['sweetwater'],
    }
    expect(keywordMatch('SWEETWATER SOUND', buildMatchers([...BUILTIN_CATEGORIES, custom]))).toBe('custom-1')
  })
})

describe('history', () => {
  it('prefers what you picked before over keywords', () => {
    const past = [
      txn({ id: 1, description: 'STARBUCKS #1 SEATTLE', categoryId: 'personal' }),
      txn({ id: 2, description: 'STARBUCKS #2 SEATTLE', categoryId: 'personal' }),
    ]
    const suggest = makeSuggester(BUILTIN_CATEGORIES, past)
    expect(suggest(txn({ description: 'STARBUCKS #3 SEATTLE' }))).toEqual({ id: 'personal', source: 'history' })
    // A different merchant still falls back to keywords.
    expect(suggest(txn({ description: 'STARBUCKS PORTLAND' }))).toEqual({ id: 'sc-24b', source: 'keyword' })
  })

  it('picks the most common choice, latest breaking ties', () => {
    const h = buildHistory([
      txn({ id: 1, description: 'ACME', categoryId: 'sc-22' }),
      txn({ id: 2, description: 'ACME', categoryId: 'sc-18' }),
    ])
    expect(h.get('acme')).toBe('sc-18')
  })
})
