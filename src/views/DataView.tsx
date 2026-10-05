import { useEffect, useRef, useState } from 'react'
import { clearAll, exportBackup, parseBackup, restoreBackup } from '../lib/db'
import { download } from '../lib/export'
import type { Transaction } from '../lib/types'
import { plural } from '../format'

interface Props {
  transactions: Transaction[]
}

export function DataView({ transactions }: Props) {
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null))
  }, [])

  async function backup() {
    const data = await exportBackup()
    const date = new Date().toISOString().slice(0, 10)
    download(`expenser-backup-${date}.json`, JSON.stringify(data, null, 2), 'application/json')
  }

  async function restore(file: File) {
    setError(null)
    setMessage(null)
    try {
      const data = parseBackup(await file.text())
      const when = new Date(data.exportedAt).toLocaleString()
      const ok = confirm(
        `Replace everything in this browser (${plural(transactions.length, 'transaction')}) with the backup from ${when} (${plural(data.transactions.length, 'transaction')})?`,
      )
      if (!ok) return
      await restoreBackup(data)
      setMessage(`Restored ${plural(data.transactions.length, 'transaction')} from ${file.name}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function wipe() {
    if (!confirm(`Delete all ${plural(transactions.length, 'transaction')}, imports and custom categories from this browser?`)) return
    if (!confirm('This cannot be undone. Did you download a backup first?')) return
    await clearAll()
    setMessage('All data deleted.')
  }

  async function requestPersist() {
    const ok = await navigator.storage?.persist?.()
    setPersisted(!!ok)
  }

  return (
    <section>
      <h2>Backup and data</h2>
      <div className="card">
        <h3>Where your data lives</h3>
        <p>
          Everything you import stays in this browser on this device (in IndexedDB). It is never uploaded, not even to
          GitHub. That also means it does not sync between devices or browsers, and clearing site data erases it.
          Download a backup now and then, and use it to move your data to another computer.
        </p>
        {persisted === false && (
          <p className="notice warn">
            Your browser may clear this data if the disk fills up.{' '}
            <button className="link" onClick={() => void requestPersist()}>
              Ask the browser to keep it
            </button>
          </p>
        )}
        {persisted && <p className="muted small">The browser has agreed to keep this data unless you clear it.</p>}
      </div>

      <div className="card">
        <h3>Backup</h3>
        <p className="muted">A JSON file with all transactions, categories and imports.</p>
        <div className="row">
          <button className="primary" onClick={() => void backup()}>
            Download backup
          </button>
          <button onClick={() => input.current?.click()}>Restore from backup…</button>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void restore(f)
              e.target.value = ''
            }}
          />
        </div>
        {message && <p className="notice success">{message}</p>}
        {error && <p className="notice error">{error}</p>}
      </div>

      <div className="card danger-zone">
        <h3>Delete everything</h3>
        <p className="muted">Removes all transactions, imports and custom categories from this browser.</p>
        <button className="danger" onClick={() => void wipe()}>
          Delete all data
        </button>
      </div>
    </section>
  )
}
