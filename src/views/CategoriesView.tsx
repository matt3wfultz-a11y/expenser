import { type FormEvent, useMemo, useState } from 'react'
import { lineRef, parseKeywords, rollupTargets, sortCategories, toMap } from '../lib/categories'
import { deleteCategory, newCategoryId, saveCategory } from '../lib/db'
import { GROUP_LABELS } from '../lib/taxCategories'
import type { Category, Transaction } from '../lib/types'
import { plural } from '../format'

interface Props {
  categories: Category[]
  transactions: Transaction[]
}

// Your own categories first: they are the ones you will edit most.
const PAGE_ORDER: Category['group'][] = ['Custom', 'Schedule C', 'Schedule A', 'Other']
const KEYWORDS_SHOWN = 8

const GROUP_HELP: Record<Category['group'], string> = {
  'Schedule C': 'Business expenses for sole proprietors, freelancers and single-member LLCs (Form 1040, Schedule C, Part II).',
  'Schedule A': 'Personal itemized deductions (Form 1040, Schedule A). Only useful if you itemize instead of taking the standard deduction.',
  Custom: 'Your own categories. Link one to an IRS line and its total is counted on that line in the summary.',
  Other: 'For spending that is not deductible, and money that should not count as spending at all.',
}

export function CategoriesView({ categories, transactions }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const map = useMemo(() => toMap(categories), [categories])
  const usage = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of transactions) if (t.categoryId) m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1)
    return m
  }, [transactions])
  const sorted = useMemo(() => sortCategories(categories), [categories])

  async function remove(c: Category) {
    const n = usage.get(c.id) ?? 0
    const extra = n ? ` Its ${plural(n, 'transaction')} will go back to "Needs category".` : ''
    if (!confirm(`Delete "${c.name}"?${extra}`)) return
    await deleteCategory(c.id)
  }

  return (
    <section>
      <div className="section-head">
        <h2>Categories</h2>
        {!adding && (
          <button className="primary" onClick={() => setAdding(true)}>
            New category
          </button>
        )}
      </div>

      {adding && (
        <div className="card">
          <h3>New category</h3>
          <CategoryEditor categories={categories} onDone={() => setAdding(false)} />
        </div>
      )}

      {PAGE_ORDER.map((group) => {
        const list = sorted.filter((c) => c.group === group)
        return (
          <div key={group} className="group">
            <h3>{GROUP_LABELS[group]}</h3>
            <p className="muted small">{GROUP_HELP[group]}</p>
            {list.length === 0 ? (
              <p className="empty small">
                No custom categories yet.{' '}
                <button className="link" onClick={() => setAdding(true)}>
                  Add one
                </button>
                , like "Client gifts" (counts toward Schedule C line 27a) or "Kids' activities" (just tracking).
              </p>
            ) : (
              <div className="table-wrap">
                <table className="categories">
                  <thead>
                    <tr>
                      <th>{group === 'Custom' ? 'Counts toward' : 'Line'}</th>
                      <th>Category</th>
                      <th className="num">Deductible</th>
                      <th>Suggest for</th>
                      <th className="num">Used</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((c) =>
                      editing === c.id ? (
                        <tr key={c.id} className="editing">
                          <td colSpan={6}>
                            <CategoryEditor categories={categories} category={c} onDone={() => setEditing(null)} />
                          </td>
                        </tr>
                      ) : (
                        <tr key={c.id} className={c.hidden ? 'hidden-cat' : ''}>
                          <td className="line">{c.group === 'Custom' ? lineRef(c, map) || 'No tax line' : (c.line ?? '')}</td>
                          <td>
                            <div>
                              {c.name}
                              {c.hidden && <span className="tag">hidden</span>}
                              {c.excluded && <span className="tag">not counted</span>}
                            </div>
                            {c.description && <div className="muted small">{c.description}</div>}
                          </td>
                          <td className="num">{c.excluded ? '' : `${c.deductiblePct}%`}</td>
                          <td className="keywords small" title={c.keywords.join(', ')}>
                            {c.keywords.length ? (
                              c.keywords.slice(0, KEYWORDS_SHOWN).join(', ') +
                              (c.keywords.length > KEYWORDS_SHOWN ? ` +${c.keywords.length - KEYWORDS_SHOWN} more` : '')
                            ) : (
                              <span className="muted">none</span>
                            )}
                          </td>
                          <td className="num">{usage.get(c.id) ?? 0}</td>
                          <td className="actions">
                            <button className="small" onClick={() => setEditing(c.id)}>
                              Edit
                            </button>
                            <button className="small" onClick={() => void saveCategory({ ...c, hidden: !c.hidden })}>
                              {c.hidden ? 'Show' : 'Hide'}
                            </button>
                            {!c.builtin && (
                              <button className="small danger" onClick={() => void remove(c)}>
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}

interface EditorProps {
  categories: Category[]
  /** Omit to create a new custom category. */
  category?: Category
  onDone: () => void
}

function CategoryEditor({ categories, category, onDone }: EditorProps) {
  const isNew = !category
  const builtin = category?.builtin ?? false
  const [name, setName] = useState(category?.name ?? '')
  const [parentId, setParentId] = useState<string | null>(category?.parentId ?? null)
  const [pct, setPct] = useState(String(category?.deductiblePct ?? 100))
  const [pctTouched, setPctTouched] = useState(!isNew)
  const [keywords, setKeywords] = useState((category?.keywords ?? []).join(', '))
  const [description, setDescription] = useState(category?.description ?? '')
  const [error, setError] = useState<string | null>(null)

  const targets = useMemo(() => rollupTargets(categories), [categories])
  const targetsC = targets.filter((c) => c.group === 'Schedule C')
  const targetsA = targets.filter((c) => c.group === 'Schedule A')

  function pickParent(id: string | null) {
    setParentId(id)
    // Default the deductible share to the line's (e.g. 50% for meals) until the user sets it.
    if (!pctTouched) setPct(String(id ? (categories.find((c) => c.id === id)?.deductiblePct ?? 100) : 100))
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const pctNum = Number(pct)
    if (!builtin && !name.trim()) return setError('Give the category a name.')
    if (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 100) return setError('Deductible share must be between 0 and 100.')
    const base: Category = category ?? {
      id: newCategoryId(),
      name: '',
      group: 'Custom',
      line: null,
      description: '',
      deductiblePct: 100,
      parentId: null,
      keywords: [],
      builtin: false,
      hidden: false,
      excluded: false,
    }
    try {
      await saveCategory({
        ...base,
        name: builtin ? base.name : name.trim(),
        description: builtin ? base.description : description.trim(),
        parentId: builtin ? null : parentId,
        deductiblePct: pctNum,
        keywords: parseKeywords(keywords),
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <form className="editor" onSubmit={(e) => void save(e)}>
      <div className="form-grid">
        {!builtin && (
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus={isNew} placeholder="e.g. Client gifts" />
          </label>
        )}
        {!builtin && (
          <label>
            Counts toward
            <select value={parentId ?? ''} onChange={(e) => pickParent(e.target.value || null)}>
              <option value="">No tax line (just tracking)</option>
              <optgroup label="Schedule C: business">
                {targetsC.map((c) => (
                  <option key={c.id} value={c.id}>
                    Line {c.line}: {c.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Schedule A: itemized">
                {targetsA.map((c) => (
                  <option key={c.id} value={c.id}>
                    Line {c.line}: {c.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
        )}
        <label>
          Deductible share (%)
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={pct}
            onChange={(e) => {
              setPct(e.target.value)
              setPctTouched(true)
            }}
          />
        </label>
        <label className="wide">
          Suggest for descriptions containing
          <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="comma separated, e.g. sweetwater, guitar center" />
          <small className="muted">Whole words, not case-sensitive. Longer matches win over shorter ones.</small>
        </label>
        {!builtin && (
          <label className="wide">
            Description
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional note to yourself" />
          </label>
        )}
      </div>
      {error && <p className="notice error">{error}</p>}
      <div className="row">
        <button type="submit" className="primary">
          {isNew ? 'Add category' : 'Save'}
        </button>
        <button type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  )
}
