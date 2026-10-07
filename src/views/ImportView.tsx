import { useEffect, useMemo, useRef, useState } from 'react'
import { type ColumnMapping, type CsvTable, type ParsedRow, type SignConvention, detectColumns, readCsv, toRows } from '../lib/csv'
import { countDuplicates, deleteImport, importRows } from '../lib/db'
import { extractPdfLines, PdfTextError } from '../lib/pdfText'
import { parseStatementLines } from '../lib/statement'
import type { ImportRecord, Transaction } from '../lib/types'
import { money, plural } from '../format'

interface Pending {
  key: string
  fileName: string
  table: CsvTable
  mapping: ColumnMapping
  sign: SignConvention
  account: string
  /** Set for PDF statements: the extracted text, re-parsed when the year changes. */
  pdf?: { lines: string[]; year: number | null; usedYear: boolean }
}

interface Props {
  imports: ImportRecord[]
  transactions: Transaction[]
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

function accountFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Account'
}

export function ImportView({ imports, transactions }: Props) {
  const [pending, setPending] = useState<Pending[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const accounts = useMemo(() => [...new Set(imports.map((i) => i.account))].sort(), [imports])
  const countsByImport = useMemo(() => {
    const m = new Map<number, number>()
    for (const t of transactions) m.set(t.importId, (m.get(t.importId) ?? 0) + 1)
    return m
  }, [transactions])

  async function addFiles(files: Iterable<File>) {
    setError(null)
    setMessage(null)
    const added: Pending[] = []
    for (const file of files) {
      try {
        const base = { key: `${file.name}-${crypto.randomUUID()}`, fileName: file.name, account: accountFromFileName(file.name) }
        if (isPdf(file)) {
          const lines = await extractPdfLines(await file.arrayBuffer())
          const result = parseStatementLines(lines)
          if (!result.table.rows.length) {
            throw new Error(
              'no transactions were recognized in this PDF. Lines need to start with a date and end with an amount. Try the CSV download from your bank instead.',
            )
          }
          added.push({
            ...base,
            table: result.table,
            mapping: detectColumns(result.table.headers),
            // Running balances give bank-style signs (money out negative).
            sign: result.signedFromBalance ? 'negative-is-expense' : 'auto',
            pdf: { lines, year: result.guessedYear, usedYear: result.usedYear },
          })
        } else {
          const table = readCsv(await file.text())
          if (!table.headers.length || !table.rows.length) throw new Error('no rows found')
          added.push({ ...base, table, mapping: detectColumns(table.headers), sign: 'auto' })
        }
      } catch (e) {
        const reason = e instanceof PdfTextError ? e.message : `Could not read it: ${e instanceof Error ? e.message : String(e)}`
        setError(`${file.name}: ${reason}`)
      }
    }
    setPending((p) => [...p, ...added])
  }

  async function loadSample() {
    const res = await fetch(`${import.meta.env.BASE_URL}sample-transactions.csv`)
    const blob = await res.blob()
    await addFiles([new File([blob], 'Sample card.csv', { type: 'text/csv' })])
  }

  function update(key: string, patch: Partial<Pending>) {
    setPending((p) => p.map((x) => (x.key === key ? { ...x, ...patch } : x)))
  }

  async function remove(rec: ImportRecord) {
    const n = countsByImport.get(rec.id!) ?? 0
    if (!confirm(`Delete "${rec.fileName}" and its ${plural(n, 'transaction')}? Categories you assigned to them will be lost.`)) return
    await deleteImport(rec.id!)
  }

  return (
    <section>
      <h2>Import transactions</h2>
      <p className="muted">
        Download transactions from your bank or card as CSV (best) or a PDF statement, then add them here. Files are read in your browser and never
        uploaded anywhere.
      </p>

      <div
        className={`dropzone${dragging ? ' dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void addFiles(e.dataTransfer.files)
        }}
      >
        <p>Drop CSV or PDF files here, or</p>
        <div className="row">
          <button className="primary" onClick={() => input.current?.click()}>
            Choose files…
          </button>
          <button onClick={() => void loadSample()}>Try sample data</button>
        </div>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv,.txt,.pdf,application/pdf"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {error && <p className="notice error">{error}</p>}
      {message && (
        <p className="notice success">
          {message} <a href="#/review">Start reviewing</a>
        </p>
      )}

      <datalist id="accounts">
        {accounts.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>

      {pending.map((p) => (
        <PendingCard
          key={p.key}
          pending={p}
          onChange={(patch) => update(p.key, patch)}
          onCancel={() => setPending((all) => all.filter((x) => x.key !== p.key))}
          onDone={(text) => {
            setPending((all) => all.filter((x) => x.key !== p.key))
            setMessage(text)
          }}
        />
      ))}

      {imports.length > 0 && (
        <>
          <h3>Imported files</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Account</th>
                  <th>Imported</th>
                  <th className="num">Transactions</th>
                  <th className="num">Duplicates skipped</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...imports].reverse().map((i) => (
                  <tr key={i.id}>
                    <td>{i.fileName}</td>
                    <td>{i.account}</td>
                    <td>{new Date(i.importedAt).toLocaleString()}</td>
                    <td className="num">{countsByImport.get(i.id!) ?? 0}</td>
                    <td className="num">{i.duplicates}</td>
                    <td className="actions">
                      <button className="small danger" onClick={() => void remove(i)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

interface CardProps {
  pending: Pending
  onChange: (patch: Partial<Pending>) => void
  onCancel: () => void
  onDone: (message: string) => void
}

function PendingCard({ pending, onChange, onCancel, onDone }: CardProps) {
  const { table, mapping, sign, account } = pending
  const result = useMemo(() => toRows(table, mapping, sign), [table, mapping, sign])
  // Rows unticked in the preview, for this exact parse (any change re-includes everything).
  const [exclusion, setExclusion] = useState<{ rows: ParsedRow[]; skip: Set<number> } | null>(null)
  const skip = useMemo(
    () => (exclusion?.rows === result.rows ? exclusion.skip : new Set<number>()),
    [exclusion, result.rows],
  )
  const included = useMemo(() => result.rows.filter((_, i) => !skip.has(i)), [result.rows, skip])
  const [showAll, setShowAll] = useState(false)
  const [dupCheck, setDupCheck] = useState<{ rows: ParsedRow[]; account: string; n: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const usesDebitCredit = mapping.amount === null && (mapping.debit !== null || mapping.credit !== null)
  const problem =
    mapping.description === null
      ? 'Pick the column that holds the description.'
      : mapping.amount === null && mapping.debit === null && mapping.credit === null
        ? 'Pick the amount column, or the debit and credit columns.'
        : result.rows.length === 0
          ? 'No rows with an amount were found with these columns.'
          : null

  useEffect(() => {
    let live = true
    countDuplicates(included, account).then((n) => live && setDupCheck({ rows: included, account, n }))
    return () => {
      live = false
    }
  }, [included, account])
  // Null while the check for the current rows and account is still running.
  const duplicates = dupCheck && dupCheck.rows === included && dupCheck.account === account ? dupCheck.n : null

  const fresh = duplicates === null ? null : included.length - duplicates
  const totalOut = included.reduce((s, r) => s + (r.amount > 0 ? r.amount : 0), 0)
  const totalIn = included.reduce((s, r) => s + (r.amount < 0 ? -r.amount : 0), 0)

  async function doImport() {
    setBusy(true)
    setError(null)
    try {
      const rec = await importRows(pending.fileName, account.trim() || 'Account', included)
      // Ask the browser not to evict our data under storage pressure.
      void navigator.storage?.persist?.()
      onDone(
        `Imported ${plural(rec.added, 'transaction')} from ${pending.fileName}` +
          (rec.duplicates ? ` (${plural(rec.duplicates, 'duplicate')} skipped).` : '.'),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const columnSelect = (field: keyof ColumnMapping, label: string) => (
    <label>
      {label}
      <select
        value={mapping[field] ?? ''}
        onChange={(e) => onChange({ mapping: { ...mapping, [field]: e.target.value === '' ? null : Number(e.target.value) } })}
      >
        <option value="">None</option>
        {table.headers.map((h, i) => (
          <option key={i} value={i}>
            {h || `Column ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="card">
      <div className="card-head">
        <h3>{pending.fileName}</h3>
        <span className="muted">
          {plural(table.rows.length, 'row')}
          {table.headerRow > 0 && `, skipped ${plural(table.headerRow, 'line')} above the header`}
        </span>
      </div>

      <div className="form-grid">
        <label>
          Account name
          <input list="accounts" value={account} onChange={(e) => onChange({ account: e.target.value })} />
          <small className="muted">Use the same name each time for the same card so duplicates are caught.</small>
        </label>
        {pending.pdf?.usedYear && (
          <label>
            Statement year
            <input
              type="number"
              min={1990}
              max={2100}
              value={pending.pdf.year ?? ''}
              onChange={(e) => {
                const year = e.target.value ? Number(e.target.value) : null
                const pdf = { ...pending.pdf!, year }
                onChange({ pdf, table: parseStatementLines(pdf.lines, year ?? undefined).table })
              }}
            />
            <small className="muted">Dates on this statement have no year. December dates on a January statement use the year before.</small>
          </label>
        )}
        {!pending.pdf && columnSelect('date', 'Date column')}
        {!pending.pdf && columnSelect('description', 'Description column')}
        {!pending.pdf && columnSelect('amount', 'Amount column')}
        {mapping.amount === null && columnSelect('debit', 'Debit (money out) column')}
        {mapping.amount === null && columnSelect('credit', 'Credit (money in) column')}
        {!usesDebitCredit && (
          <label>
            Amount signs
            <select value={sign} onChange={(e) => onChange({ sign: e.target.value as SignConvention })}>
              <option value="auto">
                Detect automatically
                {sign === 'auto' && result.convention !== 'debit-credit'
                  ? ` (spending is ${result.convention === 'negative-is-expense' ? 'negative' : 'positive'})`
                  : ''}
              </option>
              <option value="negative-is-expense">Spending is negative (most banks)</option>
              <option value="positive-is-expense">Spending is positive (most cards)</option>
            </select>
          </label>
        )}
      </div>

      {problem ? (
        <p className="notice error">{problem}</p>
      ) : (
        <>
          <p className="muted">
            Preview: {money(totalOut)} spent, {money(totalIn)} received across {plural(included.length, 'row')}.
            {result.skipped > 0 && ` ${plural(result.skipped, 'row')} without an amount will be skipped.`}
            {duplicates !== null && duplicates > 0 && ` ${plural(duplicates, 'row')} already imported for this account will be skipped.`}
          </p>
          <div className="table-wrap">
            <table className="compact">
              <thead>
                <tr>
                  <th className="check" title="Include">
                    <span className="sr-only">Include</span>
                  </th>
                  <th>Date</th>
                  <th>Description</th>
                  <th className="num">Spent</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.slice(0, showAll ? undefined : 6).map((r, i) => (
                  <tr key={i} className={skip.has(i) ? 'excluded' : ''}>
                    <td className="check">
                      <input
                        type="checkbox"
                        checked={!skip.has(i)}
                        aria-label={`Include ${r.description}`}
                        onChange={() => {
                          const next = new Set(skip)
                          if (next.has(i)) next.delete(i)
                          else next.add(i)
                          setExclusion({ rows: result.rows, skip: next })
                        }}
                      />
                    </td>
                    <td>{r.date}</td>
                    <td>{r.description}</td>
                    <td className={`num${r.amount < 0 ? ' credit' : ''}`}>{money(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.rows.length > 6 && (
            <button className="link small" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show fewer rows' : `Show all ${result.rows.length.toLocaleString()} rows`}
            </button>
          )}
          <p className="muted small">
            {pending.pdf &&
              'Read from the PDF text: compare these rows with your statement, and untick anything that is not a transaction. '}
            If spending shows as negative here, switch the "Amount signs" setting.
          </p>
        </>
      )}

      {error && <p className="notice error">{error}</p>}
      <div className="row">
        <button className="primary" disabled={!!problem || busy || fresh === 0} onClick={() => void doImport()}>
          {fresh === 0 ? 'Everything here is already imported' : `Import ${fresh === null ? '' : plural(fresh, 'transaction')}`}
        </button>
        <button onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  )
}
