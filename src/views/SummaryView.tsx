import { Fragment, useMemo, useState } from 'react'
import { formShort } from '../lib/categories'
import { download, summaryCsv, transactionsCsv } from '../lib/export'
import { summarize, yearOf } from '../lib/summary'
import { GROUP_LABELS } from '../lib/taxCategories'
import type { Category, Transaction } from '../lib/types'
import { money, plural } from '../format'

interface Props {
  categories: Category[]
  transactions: Transaction[]
}

export function SummaryView({ categories, transactions }: Props) {
  const years = useMemo(() => [...new Set(transactions.map(yearOf))].sort().reverse(), [transactions])
  const [picked, setPicked] = useState<string | null>(null)
  // Default to the most recent year with data; "" means all years.
  const year = picked ?? years[0] ?? ''
  const summary = useMemo(() => summarize(transactions, categories, year || null), [transactions, categories, year])
  const inYear = useMemo(() => (year ? transactions.filter((t) => yearOf(t) === year) : transactions), [transactions, year])
  const suffix = year || 'all-years'

  if (!transactions.length) {
    return (
      <section>
        <h2>Summary</h2>
        <p className="empty">
          No data yet. <a href="#/import">Import a CSV</a> and categorize it to see totals by tax line.
        </p>
      </section>
    )
  }

  const totalFor = (group: string) => summary.groups.find((g) => g.group === group)

  return (
    <section>
      <div className="section-head">
        <h2>Summary</h2>
        <select value={year} onChange={(e) => setPicked(e.target.value)} aria-label="Tax year">
          {years.map((y) => (
            <option key={y} value={y}>
              {y === 'Unknown' ? 'Unknown date' : `Tax year ${y}`}
            </option>
          ))}
          <option value="">All years</option>
        </select>
      </div>

      {summary.uncategorized.count > 0 && (
        <p className="notice warn">
          {plural(summary.uncategorized.count, 'transaction')} ({money(summary.uncategorized.total)}) still need a
          category and are not in these totals. <a href="#/review">Review them</a>.
        </p>
      )}

      <div className="stats">
        <Stat label="Schedule C deductible" value={totalFor('Schedule C')?.deductible ?? 0} note="Business expenses" />
        <Stat label="Schedule A" value={totalFor('Schedule A')?.deductible ?? 0} note="Before AGI floors and caps" />
        <Stat label="Your categories (no tax line)" value={totalFor('Custom')?.total ?? 0} note="Tracking only" />
        <Stat label="Not deductible" value={totalFor('Other')?.total ?? 0} note="Personal spending" />
      </div>

      {summary.groups.map((g) => (
        <div key={g.group} className="group">
          <h3>{GROUP_LABELS[g.group]}</h3>
          <div className="table-wrap">
            <table className="summary">
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Category</th>
                  <th className="num">Count</th>
                  <th className="num">Total</th>
                  <th className="num">Deductible</th>
                </tr>
              </thead>
              <tbody>
                {g.lines.map((l) => {
                  const split = l.parts.length > 1 || l.parts[0].category.id !== l.target.id
                  return (
                    <Fragment key={l.target.id}>
                      <tr className={split ? 'parent' : ''}>
                        <td className="line">{l.target.line ? `${formShort(l.target.group)} ${l.target.line}` : ''}</td>
                        <td>{l.target.name}</td>
                        <td className="num">{l.count}</td>
                        <td className="num">{money(l.total)}</td>
                        <td className="num">{money(l.deductible)}</td>
                      </tr>
                      {split &&
                        l.parts.map((p) => (
                          <tr key={p.category.id} className="part">
                            <td />
                            <td>
                              {p.category.id === l.target.id ? 'Assigned directly' : p.category.name}
                              {p.category.deductiblePct !== l.target.deductiblePct && (
                                <span className="muted small"> at {p.category.deductiblePct}%</span>
                              )}
                            </td>
                            <td className="num">{p.count}</td>
                            <td className="num">{money(p.total)}</td>
                            <td className="num">{money(p.deductible)}</td>
                          </tr>
                        ))}
                    </Fragment>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td />
                  <td>Total</td>
                  <td className="num">{g.lines.reduce((s, l) => s + l.count, 0)}</td>
                  <td className="num">{money(g.total)}</td>
                  <td className="num">{money(g.deductible)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}

      {summary.excluded.count > 0 && (
        <p className="muted small">
          Left out of all totals: {plural(summary.excluded.count, 'transfer, payment or deposit', 'transfers, payments or deposits')} (
          {money(summary.excluded.total)} net).
        </p>
      )}

      <h3>Export</h3>
      <div className="row">
        <button onClick={() => download(`expenser-summary-${suffix}.csv`, summaryCsv(summary))}>Summary CSV</button>
        <button onClick={() => download(`expenser-transactions-${suffix}.csv`, transactionsCsv(inYear, categories))}>
          Transactions CSV ({inYear.length.toLocaleString()})
        </button>
      </div>

      <p className="disclaimer">
        This is a bookkeeping aid, not tax advice. Totals are before limits the IRS applies on the return, such as the
        7.5%-of-AGI floor for medical expenses, the cap on state and local taxes, and depreciation rules for equipment.
        Keep receipts, and check with a tax professional before filing.
      </p>
    </section>
  )
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{money(value)}</div>
      <div className="muted small">{note}</div>
    </div>
  )
}
