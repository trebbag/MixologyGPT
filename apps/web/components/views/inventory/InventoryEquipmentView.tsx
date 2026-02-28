import { useCallback, useEffect, useState } from 'react'

import { apiJson } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type Equipment = {
  id: string
  name: string
  type?: string | null
  notes?: string | null
}

export function InventoryEquipmentView() {
  const [rows, setRows] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiJson<Equipment[]>('/v1/inventory/equipment')
      setRows(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load equipment.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const create = useCallback(async () => {
    setSaving(true)
    setSaveError('')
    try {
      if (!name.trim()) throw new Error('Name is required.')
      await apiJson('/v1/inventory/equipment', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          type: type.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      })
      setName('')
      setType('')
      setNotes('')
      await load()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to create equipment.')
    } finally {
      setSaving(false)
    }
  }, [load, name, notes, type])

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-white">Equipment</h2>
            <p className="text-sm text-gray-400 mt-1">Track tools you have (or need) for recipes and studio guidance.</p>
          </div>
          <button
            type="button"
            onClick={load}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white disabled:opacity-60"
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        {loading ? <LoadState tone="loading" title="Loading equipment" message="Fetching your equipment list." /> : null}
        {error ? <LoadState tone="error" title="Equipment error" message={error} actionLabel="Retry" onAction={load} /> : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Add Equipment</h3>
              <p className="text-sm text-gray-400 mt-1">Create a new equipment entry.</p>
            </div>
            <div className="space-y-3">
              <input
                className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                placeholder="Name (e.g. Hawthorne strainer)"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <input
                className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                placeholder="Type (optional, e.g. strainer)"
                value={type}
                onChange={(event) => setType(event.target.value)}
              />
              <textarea
                className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500 min-h-[88px]"
                placeholder="Notes (optional)"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
              {saveError ? (
                <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-xl p-3">{saveError}</div>
              ) : null}
              <button
                type="button"
                onClick={create}
                disabled={saving || !name.trim()}
                className="px-5 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Add'}
              </button>
            </div>
          </div>

          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
            <div className="flex items-baseline justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Your Equipment</h3>
                <p className="text-sm text-gray-400 mt-1">Used for recipe guidance and studio constraints.</p>
              </div>
              <p className="text-sm text-gray-300">{rows.length}</p>
            </div>
            <div className="mt-4 space-y-3">
              {!loading && !error && rows.length === 0 ? (
                <LoadState tone="empty" title="No equipment" message="Add tools you own to improve guidance and constraints." />
              ) : null}
              {rows.map((row) => (
                <div key={row.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-white font-semibold">{row.name}</p>
                      <p className="text-xs text-gray-400">{row.type || 'Uncategorized'}</p>
                    </div>
                    <p className="text-[11px] text-gray-500 break-all">{row.id.slice(0, 12)}</p>
                  </div>
                  {row.notes ? <p className="mt-2 text-sm text-gray-300">{row.notes}</p> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

