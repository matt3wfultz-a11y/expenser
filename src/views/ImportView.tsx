import { useEffect, useMemo, useRef, useState } from 'react'
import { type ColumnMapping, type CsvTable, type ParsedRow, type SignConvention, detectColumns, readCsv, toRows } from '../lib/csv'
import { countDuplicates, deleteImport, importRows } from '../lib/db'
import type { ImportRecord, Transaction } from '../lib/types'
import { money, plural } from '../format'

interface Pending {
  key: string
  fileName: string
  table: CsvTable
  mapping: ColumnMapping
  sign: SignConvention
  account: string
}

interface Props {
  imports: ImportRecord[]
  transactions: Transaction[]
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
        const table = readCsv(await file.text())
        if (!table.headers.length || !table.rows.length) throw new Error('no rows found')
        added.push({
          key: `${file.name}-${crypto.randomUUID()}`,
          fileName: file.name,
          table,
          mapping: detectColumns(table.headers),
          sign: 'auto',
          account: accountFromFileName(file.name),
        })
      } catch (e) {
        setError(`Could not read ${file.name}: ${e instanceof Error ? e.message : String(e)}`)
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
      <h2>Import a CSV</h2>
      <p className="muted">
        Download transactions from your bank or card as CSV, then add them here. Files are read in your browser and never
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
        <p>Drop CSV files here, or</p>
        <div className="row">
          <button className="primary" onClick={() => input.current?.click()}>
            Choose files…
          </button>
          <button onClick={() => void loadSample()}>Try sample data</button>
        </div>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv,.txt"
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
    countDuplicates(result.rows, account).then((n) => live && setDupCheck({ rows: result.rows, account, n }))
    return () => {
      live = false
    }
  }, [result.rows, account])
  // Null while the check for the current rows and account is still running.
  const duplicates = dupCheck && dupCheck.rows === result.rows && dupCheck.account === account ? dupCheck.n : null

  const fresh = duplicates === null ? null : result.rows.length - duplicates
  const totalOut = result.rows.reduce((s, r) => s + (r.amount > 0 ? r.amount : 0), 0)
  const totalIn = result.rows.reduce((s, r) => s + (r.amount < 0 ? -r.amount : 0), 0)

  async function doImport() {
    setBusy(true)
    setError(null)
    try {
      const rec = await importRows(pending.fileName, account.trim() || 'Account', result.rows)
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
        {columnSelect('date', 'Date column')}
        {columnSelect('description', 'Description column')}
        {columnSelect('amount', 'Amount column')}
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
            Preview: {money(totalOut)} spent, {money(totalIn)} received across {plural(result.rows.length, 'row')}.
            {result.skipped > 0 && ` ${plural(result.skipped, 'row')} without an amount will be skipped.`}
            {duplicates !== null && duplicates > 0 && ` ${plural(duplicates, 'row')} already imported for this account will be skipped.`}
          </p>
          <div className="table-wrap">
            <table className="compact">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th className="num">Spent</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.slice(0, 6).map((r, i) => (
                  <tr key={i}>
                    <td>{r.date}</td>
                    <td>{r.description}</td>
                    <td className={`num${r.amount < 0 ? ' credit' : ''}`}>{money(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">If spending shows as negative here, switch the "Amount signs" setting.</p>
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
