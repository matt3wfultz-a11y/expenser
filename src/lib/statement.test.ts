import { describe, expect, it } from 'vitest'
import { detectColumns, toRows } from './csv'
import { itemsToLines } from './pdfText'
import { guessClosingDate, parseStatementLines } from './statement'

const CARD = [
  'ACME BANK VISA SIGNATURE',
  'Opening/Closing Date 12/15/25 - 01/14/26',
  'Payment Due Date: 02/10/26',
  'Previous Balance $1,234.56',
  'Trans Date Post Date Description Amount',
  '12/18 12/19 STARBUCKS #1234 SEATTLE WA 5.75',
  '12/30 12/31 DELTA AIR LINES 0062 289.00',
  '01/02 01/03 PAYMENT THANK YOU - 500.00',
  '01/05 01/06 SHELL OIL 57444 $52.30',
  '01/07 01/08 AMAZON MKTP US*2K3 REFUND (24.99)',
  '01/09 STAPLES 00123 127.89',
  'Total fees charged this period $0.00',
  'New Balance $1,182.51',
]

describe('parseStatementLines (card statement, dates without a year)', () => {
  const r = parseStatementLines(CARD)

  it('finds only transaction lines', () => {
    expect(r.table.rows.map((row) => row[1])).toEqual([
      'STARBUCKS #1234 SEATTLE WA',
      'DELTA AIR LINES 0062',
      'PAYMENT THANK YOU',
      'SHELL OIL 57444',
      'AMAZON MKTP US*2K3 REFUND',
      'STAPLES 00123',
    ])
  })

  it('fills in the year from the closing date, wrapping December into the year before', () => {
    expect(r.guessedYear).toBe(2026)
    expect(r.usedYear).toBe(true)
    expect(r.table.rows.map((row) => row[0])).toEqual([
      '2025-12-18',
      '2025-12-30',
      '2026-01-02',
      '2026-01-05',
      '2026-01-07',
      '2026-01-09',
    ])
  })

  it('keeps the statement signs, which the importer then normalizes', () => {
    expect(r.signedFromBalance).toBe(false)
    const rows = toRows(r.table, detectColumns(r.table.headers), 'auto')
    expect(rows.convention).toBe('positive-is-expense')
    expect(rows.rows.map((x) => x.amount)).toEqual([5.75, 289, -500, 52.3, -24.99, 127.89])
  })

  it('uses a year you enter instead of the guess', () => {
    const custom = parseStatementLines(CARD, 2024)
    expect(custom.table.rows[0][0]).toBe('2023-12-18')
    expect(custom.table.rows[5][0]).toBe('2024-01-09')
  })
})

describe('parseStatementLines (bank statement with running balance)', () => {
  const BANK = [
    'Statement period: March 1, 2026 through March 31, 2026',
    'Date Description Withdrawals Deposits Balance',
    'Mar 1 Beginning balance 2,000.00',
    'Mar 2 ACH DEPOSIT ACME CORP PAYROLL 1,200.00 3,200.00',
    'Mar 3 CHECKCARD 0303 WHOLE FOODS 84.12 3,115.88',
    'Mar 15 ONLINE TRANSFER TO SAVINGS 500.00 2,615.88',
    'Mar 20 INTEREST PAYMENT 0.42 2,616.30',
  ]
  const r = parseStatementLines(BANK)

  it('signs amounts from the change in balance (money in positive)', () => {
    expect(r.signedFromBalance).toBe(true)
    expect(r.table.rows.map((row) => [row[0], row[2]])).toEqual([
      ['2026-03-02', '1200.00'],
      ['2026-03-03', '-84.12'],
      ['2026-03-15', '-500.00'],
      ['2026-03-20', '0.42'],
    ])
    const rows = toRows(r.table, detectColumns(r.table.headers), 'negative-is-expense')
    expect(rows.rows.map((x) => x.amount)).toEqual([-1200, 84.12, 500, -0.42])
  })

  it('skips the beginning balance line', () => {
    expect(r.table.rows.some((row) => /balance/i.test(row[1]))).toBe(false)
  })
})

describe('parseStatementLines (full dates)', () => {
  it('handles dates with years and "- $" amounts', () => {
    const r = parseStatementLines(['01/05/2026 GOOGLE ADS 4521 - $ 450.00', '2026-01-06 ADOBE CREATIVE CLOUD 59.99'])
    expect(r.usedYear).toBe(false)
    expect(r.table.rows).toEqual([
      ['2026-01-05', 'GOOGLE ADS 4521', '-450.00'],
      ['2026-01-06', 'ADOBE CREATIVE CLOUD', '59.99'],
    ])
  })

  it('ignores numbers without cents, like store numbers', () => {
    expect(parseStatementLines(['01/05/2026 STORE 1234']).table.rows).toEqual([])
  })
})

describe('guessClosingDate', () => {
  it('picks the latest full date', () => {
    expect(guessClosingDate(['12/15/25 - 01/14/26', 'Due 02/10/2026'])).toEqual({ year: 2026, month: 2 })
    expect(guessClosingDate(['no dates here'])).toBeNull()
  })
})

describe('itemsToLines', () => {
  const item = (str: string, x: number, y: number, width = str.length * 5) => ({ str, transform: [1, 0, 0, 1, x, y], width })

  it('groups items on the same baseline, top to bottom, left to right', () => {
    const lines = itemsToLines([
      item('5.75', 400, 700),
      item('01/05', 50, 701),
      item('STARBUCKS', 100, 700),
      item('Header', 50, 750),
      item('   ', 10, 600),
    ])
    expect(lines).toEqual(['Header', '01/05 STARBUCKS 5.75'])
  })

  it('does not insert spaces inside words split into pieces', () => {
    expect(itemsToLines([item('STAR', 100, 700, 20), item('BUCKS', 120, 700)])).toEqual(['STARBUCKS'])
  })
})
