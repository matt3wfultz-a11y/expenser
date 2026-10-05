import { describe, expect, it } from 'vitest'
import { detectColumns, detectSign, parseAmount, parseDate, readCsv, toRows } from './csv'

describe('parseAmount', () => {
  it.each([
    ['-450.00', -450],
    ['52.30', 52.3],
    ['($34.50)', -34.5],
    ['$127.89', 127.89],
    ['1,234.56', 1234.56],
    ['$-45.00', -45],
    ['-$45.00', -45],
    ['500.00CR', 500],
    ['500.00 DR', -500],
    ['  -22.50  ', -22.5],
    ['+12', 12],
  ])('%s -> %d', (input, expected) => {
    expect(parseAmount(input)).toBe(expected)
  })

  it.each(['', 'abc', 'N/A', '--'])('returns null for %j', (input) => {
    expect(parseAmount(input)).toBeNull()
  })
})

describe('parseDate', () => {
  it.each([
    ['2026-01-02', '2026-01-02'],
    ['2026-01-02T10:15:00Z', '2026-01-02'],
    ['01/02/2026', '2026-01-02'],
    ['1/2/26', '2026-01-02'],
    ['12-31-2025', '2025-12-31'],
    ['20260102', '2026-01-02'],
    ['Jan 2, 2026', '2026-01-02'],
    ['January 2 2026', '2026-01-02'],
    ['Sept 9, 2026', '2026-09-09'],
    ['2 Jan 2026', '2026-01-02'],
    ['02-Jan-26', '2026-01-02'],
    // Day-first is only used when the first number cannot be a month.
    ['25/01/2026', '2026-01-25'],
  ])('%s -> %s', (input, expected) => {
    expect(parseDate(input)).toBe(expected)
  })

  it('passes through unparseable text', () => {
    expect(parseDate('pending')).toBe('pending')
    expect(parseDate('13/13/2026')).toBe('13/13/2026')
  })
})

describe('detectColumns', () => {
  it('finds standard headers', () => {
    expect(detectColumns(['Date', 'Description', 'Amount'])).toEqual({
      date: 0,
      description: 1,
      amount: 2,
      debit: null,
      credit: null,
    })
  })

  it('finds debit/credit layouts (Capital One style)', () => {
    const m = detectColumns(['Transaction Date', 'Posted Date', 'Card No.', 'Description', 'Category', 'Debit', 'Credit'])
    expect(m).toMatchObject({ date: 0, description: 3, amount: null, debit: 5, credit: 6 })
  })
})

describe('readCsv', () => {
  it('skips summary lines above the header', () => {
    const text = [
      'Description,,Summary Amt.',
      'Beginning balance as of 01/01/2026,,"1,000.00"',
      '',
      'Date,Description,Amount,Running Bal.',
      '01/02/2026,"STARBUCKS #12, SEATTLE",-5.75,994.25',
    ].join('\n')
    const table = readCsv(text)
    expect(table.headerRow).toBe(2) // two non-empty summary lines skipped
    expect(table.headers).toEqual(['Date', 'Description', 'Amount', 'Running Bal.'])
    expect(table.rows).toEqual([['01/02/2026', 'STARBUCKS #12, SEATTLE', '-5.75', '994.25']])
  })

  it('strips a byte-order mark', () => {
    expect(readCsv('﻿Date,Description,Amount\n2026-01-01,X,1').headers[0]).toBe('Date')
  })
})

describe('toRows', () => {
  const bank = readCsv('Date,Description,Amount\n2026-01-02,GOOGLE ADS,-450.00\n2026-01-03,REFUND,25.00\n2026-01-04,SHELL,-52.30')
  const card = readCsv('Date,Description,Amount\n2026-01-02,GOOGLE ADS,450.00\n2026-01-03,PAYMENT THANK YOU,-500\n2026-01-04,SHELL,52.30')

  it('auto-detects bank style (negative = money out) and stores expenses as positive', () => {
    const r = toRows(bank, detectColumns(bank.headers), 'auto')
    expect(r.convention).toBe('negative-is-expense')
    expect(r.rows.map((x) => x.amount)).toEqual([450, -25, 52.3])
  })

  it('auto-detects card style (positive = charge)', () => {
    const r = toRows(card, detectColumns(card.headers), 'auto')
    expect(r.convention).toBe('positive-is-expense')
    expect(r.rows.map((x) => x.amount)).toEqual([450, -500, 52.3])
  })

  it('respects a manual override', () => {
    const r = toRows(bank, detectColumns(bank.headers), 'positive-is-expense')
    expect(r.rows[0].amount).toBe(-450)
  })

  it('handles separate debit and credit columns', () => {
    const t = readCsv('Posted Date,Payee,Debit,Credit\n01/05/2026,GAS STATION,52.30,\n01/06/2026,REFUND,,10.00')
    const r = toRows(t, detectColumns(t.headers), 'auto')
    expect(r.convention).toBe('debit-credit')
    expect(r.rows).toEqual([
      { date: '2026-01-05', description: 'GAS STATION', amount: 52.3 },
      { date: '2026-01-06', description: 'REFUND', amount: -10 },
    ])
  })

  it('counts rows without an amount as skipped', () => {
    const t = readCsv('Date,Description,Amount\n2026-01-01,PENDING,\n2026-01-02,OK,-1')
    const r = toRows(t, detectColumns(t.headers), 'auto')
    expect(r.rows).toHaveLength(1)
    expect(r.skipped).toBe(1)
  })
})

describe('detectSign', () => {
  it('treats a tie as bank style', () => {
    expect(detectSign([-1, 1])).toBe('negative-is-expense')
  })
})
