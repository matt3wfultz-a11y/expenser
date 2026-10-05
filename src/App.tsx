import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useCategoryOptions } from './categoryOptions'
import { db, ensureBuiltins } from './lib/db'
import { CategoriesView } from './views/CategoriesView'
import { DataView } from './views/DataView'
import { ImportView } from './views/ImportView'
import { ReviewView } from './views/ReviewView'
import { SummaryView } from './views/SummaryView'

const TABS = [
  { id: 'import', label: 'Import' },
  { id: 'review', label: 'Review' },
  { id: 'categories', label: 'Categories' },
  { id: 'summary', label: 'Summary' },
  { id: 'data', label: 'Backup' },
] as const

type Tab = (typeof TABS)[number]['id']

// Hash routes (#/review) work on GitHub Pages without any server rewrites.
function readHash(): Tab | null {
  const h = window.location.hash.replace(/^#\/?/, '')
  return TABS.some((t) => t.id === h) ? (h as Tab) : null
}

export default function App() {
  const [tab, setTab] = useState<Tab | null>(readHash)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    const onHash = () => setTab(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    ensureBuiltins().catch((e: unknown) => setFailed(e instanceof Error ? e.message : String(e)))
  }, [])

  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const transactions = useLiveQuery(() => db.transactions.toArray(), [])
  const imports = useLiveQuery(() => db.imports.toArray(), [])
  const options = useCategoryOptions(categories ?? [])

  const loading = !categories || !transactions || !imports
  // With no tab in the URL, pick one once data has loaded: Review if there is
  // anything to review, otherwise Import. Decided once so importing a file
  // does not yank you off the Import tab.
  if (tab === null && !loading) setTab(transactions.length ? 'review' : 'import')
  const active: Tab = tab ?? 'import'
  const todo = transactions?.filter((t) => !t.categoryId).length ?? 0

  return (
    <div className="app">
      <header>
        <div className="brand">
          <h1>Expenser</h1>
          <p className="muted">Sort expenses into IRS tax categories. Your data never leaves this browser.</p>
        </div>
        <nav>
          {TABS.map((t) => (
            <a key={t.id} href={`#/${t.id}`} className={active === t.id ? 'active' : ''} aria-current={active === t.id ? 'page' : undefined}>
              {t.label}
              {t.id === 'review' && todo > 0 && <span className="badge">{todo.toLocaleString()}</span>}
            </a>
          ))}
        </nav>
      </header>

      <main>
        {failed ? (
          <p className="notice error">
            Could not open browser storage ({failed}). Private browsing windows and some privacy settings block it.
          </p>
        ) : loading ? (
          <p className="muted">Loading…</p>
        ) : active === 'import' ? (
          <ImportView imports={imports} transactions={transactions} />
        ) : active === 'review' ? (
          <ReviewView transactions={transactions} options={options} />
        ) : active === 'categories' ? (
          <CategoriesView categories={categories} transactions={transactions} />
        ) : active === 'summary' ? (
          <SummaryView categories={categories} transactions={transactions} />
        ) : (
          <DataView transactions={transactions} />
        )}
      </main>
    </div>
  )
}
