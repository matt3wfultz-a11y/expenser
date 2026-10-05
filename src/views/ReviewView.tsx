import { useMemo, useState } from 'react'
import type { CategoryOptions } from '../categoryOptions'
import { CategorySelect } from '../components/CategorySelect'
import { money, plural } from '../format'
import { acceptSuggestions, setCategory, setNotes } from '../lib/db'
import { yearOf } from '../lib/summary'
import type { Transaction } from '../lib/types'

type Status = 'todo' | 'suggested' | 'done' | 'all'
type Sort = 'date' | 'merchant' | 'amount'

const PAGE_SIZE = 50

interface Filters {
  status: Status
  search: string
  account: string
  year: string
  categoryFilter: string | null
  sort: Sort
}

const INITIAL_FILTERS: Filters = { status: 'todo', search: '', account: '', year: '', categoryFilter: null, sort: 'date' }

interface Props {
  transactions: Transaction[]
  options: CategoryOptions
}

export function ReviewView({ transactions, options }: Props) {
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS)
  const { status, search, account, year, categoryFilter, sort } = filters
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkCategory, setBulkCategory] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const accounts = useMemo(() => [...new Set(transactions.map((t) => t.account))].sort(), [transactions])
  const years = useMemo(() => [...new Set(transactions.map(yearOf))].sort().reverse(), [transactions])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = transactions.filter((t) => {
      if (status === 'todo' && t.categoryId) return false
      if (status === 'suggested' && (t.categoryId || !t.suggestedId)) return false
      if (status === 'done' && !t.categoryId) return false
      if (account && t.account !== account) return false
      if (year && yearOf(t) !== year) return false
      if (categoryFilter && t.categoryId !== categoryFilter && t.suggestedId !== categoryFilter) return false
      if (q) {
        const hay = `${t.description} ${t.account} ${t.notes} ${t.amount.toFixed(2)}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    const byId = (a: Transaction, b: Transaction) => (a.id ?? 0) - (b.id ?? 0)
    if (sort === 'date') list.sort((a, b) => a.date.localeCompare(b.date) || byId(a, b))
    if (sort === 'merchant') list.sort((a, b) => a.merchantKey.localeCompare(b.merchantKey) || a.date.localeCompare(b.date) || byId(a, b))
    if (sort === 'amount') list.sort((a, b) => b.amount - a.amount || byId(a, b))
    return list
  }, [transactions, status, search, account, year, categoryFilter, sort])

  function setFilter(patch: Partial<Filters>) {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(0)
  }

  // Stay in range as categorized rows leave the list.
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const visible = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  // Only rows still in the list count as selected.
  const filteredIds = useMemo(() => new Set(filtered.map((t) => t.id!)), [filtered])
  const selectedIds = [...selected].filter((id) => filteredIds.has(id))
  const targetRows = selectedIds.length ? filtered.filter((t) => selected.has(t.id!)) : filtered
  const withSuggestion = targetRows.filter((t) => !t.categoryId && t.suggestedId)

  const pageAllSelected = visible.length > 0 && visible.every((t) => selected.has(t.id!))
  const remaining = transactions.filter((t) => !t.categoryId).length

  function toggle(id: number) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function togglePage() {
    setSelected((s) => {
      const next = new Set(s)
      for (const t of visible) {
        if (pageAllSelected) next.delete(t.id!)
        else next.add(t.id!)
      }
      return next
    })
  }

  async function applyBulk() {
    await setCategory(selectedIds, bulkCategory)
    setFlash(
      `${bulkCategory ? `Set ${plural(selectedIds.length, 'transaction')} to ${options.labels.get(bulkCategory)}` : `Cleared ${plural(selectedIds.length, 'transaction')}`}.`,
    )
    setSelected(new Set())
  }

  async function acceptAll() {
    const n = await acceptSuggestions(withSuggestion.map((t) => t.id!))
    setFlash(`Accepted ${plural(n, 'suggestion')}.`)
    setSelected(new Set())
  }

  if (!transactions.length) {
    return (
      <section>
        <h2>Review</h2>
        <p className="empty">
          Nothing to review yet. <a href="#/import">Import a CSV</a> to get started.
        </p>
      </section>
    )
  }

  return (
    <section>
      <div className="section-head">
        <h2>Review</h2>
        <span className="muted">
          {remaining ? `${plural(remaining, 'transaction')} still need a category` : 'Everything has a category'}
        </span>
      </div>

      <div className="filters">
        <div className="segmented" role="group" aria-label="Status">
          {(
            [
              ['todo', 'Needs category'],
              ['suggested', 'Has suggestion'],
              ['done', 'Categorized'],
              ['all', 'All'],
            ] as const
          ).map(([value, label]) => (
            <button key={value} className={status === value ? 'active' : ''} onClick={() => setFilter({ status: value })}>
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search description, notes, amount…"
          value={search}
          onChange={(e) => setFilter({ search: e.target.value })}
          aria-label="Search"
        />
        <select value={account} onChange={(e) => setFilter({ account: e.target.value })} aria-label="Account">
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select value={year} onChange={(e) => setFilter({ year: e.target.value })} aria-label="Year">
          <option value="">All years</option>
          {years.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
        <CategorySelect
          options={options}
          value={categoryFilter}
          onChange={(id) => setFilter({ categoryFilter: id })}
          emptyLabel="Any category"
          aria-label="Category filter"
        />
        <select value={sort} onChange={(e) => setFilter({ sort: e.target.value as Sort })} aria-label="Sort">
          <option value="date">Sort by date</option>
          <option value="merchant">Group by merchant</option>
          <option value="amount">Largest first</option>
        </select>
      </div>

      <div className="bulk">
        <span className="muted">
          {selectedIds.length ? `${plural(selectedIds.length, 'row')} selected` : `${plural(filtered.length, 'row')} in this list`}
        </span>
        <CategorySelect
          options={options}
          value={bulkCategory}
          onChange={setBulkCategory}
          emptyLabel="Uncategorized (clear)"
          aria-label="Category for selected rows"
          disabled={!selectedIds.length}
        />
        <button disabled={!selectedIds.length} onClick={() => void applyBulk()}>
          Set category for selected
        </button>
        <button className="primary" disabled={!withSuggestion.length} onClick={() => void acceptAll()}>
          Accept {plural(withSuggestion.length, 'suggestion')}
          {selectedIds.length ? ' for selected' : ''}
        </button>
        {selectedIds.length > 0 && (
          <button className="link" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        )}
        {selectedIds.length < filtered.length && filtered.length > visible.length && (
          <button className="link" onClick={() => setSelected(new Set(filtered.map((t) => t.id!)))}>
            Select all {filtered.length.toLocaleString()}
          </button>
        )}
      </div>
      {flash && (
        <p key={flash} className="notice success flash" onAnimationEnd={() => setFlash(null)}>
          {flash}
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="empty">
          {status === 'todo' && !search && !account && !year && !categoryFilter
            ? 'All caught up. Every transaction has a category.'
            : 'No transactions match these filters.'}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="review">
            <thead>
              <tr>
                <th className="check">
                  <input type="checkbox" checked={pageAllSelected} onChange={togglePage} aria-label="Select page" />
                </th>
                <th>Date</th>
                <th>Description</th>
                <th className="num">Amount</th>
                <th>Category</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <Row key={t.id} t={t} options={options} selected={selected.has(t.id!)} onToggle={() => toggle(t.id!)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="pager">
          <button disabled={current === 0} onClick={() => setPage(current - 1)}>
            Previous
          </button>
          <span>
            Page {current + 1} of {pages}
          </span>
          <button disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            Next
          </button>
        </div>
      )}
    </section>
  )
}

interface RowProps {
  t: Transaction
  options: CategoryOptions
  selected: boolean
  onToggle: () => void
}

function Row({ t, options, selected, onToggle }: RowProps) {
  return (
    <tr className={selected ? 'selected' : ''}>
      <td className="check">
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${t.description}`} />
      </td>
      <td className="date">{t.date}</td>
      <td>
        <div>{t.description}</div>
        <div className="muted small">{t.account}</div>
      </td>
      <td className={`num${t.amount < 0 ? ' credit' : ''}`} title={t.amount < 0 ? 'Money in (refund or credit)' : undefined}>
        {money(t.amount)}
      </td>
      <td className="category">
        <CategorySelect
          options={options}
          value={t.categoryId}
          onChange={(id) => void setCategory([t.id!], id)}
          aria-label={`Category for ${t.description}`}
        />
        {!t.categoryId && t.suggestedId && (
          <button
            className="suggestion"
            onClick={() => void setCategory([t.id!], t.suggestedId)}
            title={t.suggestionSource === 'history' ? 'Based on what you picked for this merchant before' : 'Keyword match'}
          >
            <span aria-hidden>✓</span> {options.labels.get(t.suggestedId) ?? t.suggestedId}
            <span className="source">{t.suggestionSource === 'history' ? 'your past pick' : 'keyword'}</span>
          </button>
        )}
      </td>
      <td>
        <input
          // Remount when notes change elsewhere (e.g. a restored backup).
          key={t.notes}
          className="notes"
          defaultValue={t.notes}
          placeholder="Business purpose…"
          onBlur={(e) => e.target.value !== t.notes && void setNotes(t.id!, e.target.value)}
          aria-label={`Notes for ${t.description}`}
        />
      </td>
    </tr>
  )
}
