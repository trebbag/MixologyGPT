import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle2, Clock3, RefreshCw, ShieldAlert, XCircle } from 'lucide-react'

import { apiJson } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type AuditRow = {
  id: string
  user_id: string
  user_email: string
  ingredient_id?: string | null
  inventory_item_id?: string | null
  inventory_lot_id?: string | null
  filename: string
  source_name: string
  canonical_name: string
  row_status: 'ready' | 'partial' | 'duplicate' | 'skipped'
  import_action: string
  import_result?: string | null
  confidence?: number | null
  missing_fields: string[]
  notes: string[]
  source_refs: Array<{ label: string; url?: string | null }>
  resolved: {
    canonical_name: string
    display_name?: string | null
    category?: string | null
    subcategory?: string | null
    description?: string | null
    abv?: number | null
    is_alcoholic: boolean
    is_perishable: boolean
    unit: string
    preferred_unit?: string | null
    quantity?: number | null
    lot_unit?: string | null
    location?: string | null
  }
  review_status: 'pending' | 'approved' | 'rejected'
  review_notes?: string | null
  reviewed_at?: string | null
  reviewed_by_user_id?: string | null
  created_at: string
}

type AuditResponse = {
  counts: Record<string, number>
  rows: AuditRow[]
}

const REVIEW_FILTERS: Array<{ value: 'all' | 'pending' | 'approved' | 'rejected'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

function badgeClasses(status: AuditRow['review_status']) {
  if (status === 'approved') return 'bg-emerald-500/15 border-emerald-400/30 text-emerald-100'
  if (status === 'rejected') return 'bg-red-500/15 border-red-400/30 text-red-100'
  return 'bg-amber-500/15 border-amber-400/30 text-amber-100'
}

export function InventoryOntologyAuditView() {
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')
  const [data, setData] = useState<AuditResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = filter === 'all' ? '' : `?review_status=${filter}`
      const response = await apiJson<AuditResponse>(`/v1/admin/inventory-batch-audits${query}`)
      setData(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ontology audit queue.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  const rows = useMemo(() => data?.rows ?? [], [data])

  const updateReview = useCallback(
    async (row: AuditRow, reviewStatus: 'approved' | 'rejected') => {
      const note =
        reviewStatus === 'rejected'
          ? window.prompt('Add a short rejection note for the uploader/admin trail:', row.review_notes ?? '') ?? ''
          : row.review_notes ?? ''
      setBusyId(row.id)
      setError('')
      try {
        await apiJson<AuditRow>(`/v1/admin/inventory-batch-audits/${row.id}/review`, {
          method: 'PATCH',
          body: JSON.stringify({
            review_status: reviewStatus,
            review_notes: note || undefined,
          }),
        })
        await load()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update review status.')
      } finally {
        setBusyId('')
      }
    },
    [load],
  )

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-white">Inventory Ontology Audit</h2>
            <p className="text-sm text-gray-400 mt-1">
              Review AI-assisted ingredient imports before they become trusted ontology entries.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white flex items-center gap-2"
            disabled={loading}
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Pending" value={data?.counts.pending ?? 0} icon={<Clock3 className="w-4 h-4 text-amber-200" />} />
          <MetricCard label="Approved" value={data?.counts.approved ?? 0} icon={<CheckCircle2 className="w-4 h-4 text-emerald-200" />} />
          <MetricCard label="Rejected" value={data?.counts.rejected ?? 0} icon={<XCircle className="w-4 h-4 text-red-200" />} />
          <MetricCard label="Visible Rows" value={rows.length} icon={<ShieldAlert className="w-4 h-4 text-cyan-200" />} />
        </div>

        <div className="flex gap-2 flex-wrap">
          {REVIEW_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={`px-3 py-2 rounded-lg border text-sm ${
                filter === option.value
                  ? 'border-purple-400/40 bg-purple-500/15 text-white'
                  : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {loading ? <LoadState tone="loading" title="Loading audit queue" message="Fetching imported ingredient reviews." /> : null}
        {error ? <LoadState tone="error" title="Ontology audit error" message={error} actionLabel="Retry" onAction={load} /> : null}

        {!loading && !error && rows.length === 0 ? (
          <LoadState
            tone="empty"
            title="No ontology reviews in this filter"
            message="Batch-uploaded ingredient changes will appear here when they need admin review."
          />
        ) : null}

        {rows.length ? (
          <div className="space-y-4">
            {rows.map((row) => (
              <div key={row.id} className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-semibold text-white">{row.canonical_name}</h3>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${badgeClasses(row.review_status)}`}>
                        {row.review_status}
                      </span>
                      {typeof row.confidence === 'number' ? (
                        <span className="text-xs text-gray-400">confidence {Math.round(row.confidence * 100)}%</span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-gray-400">
                      Uploaded by {row.user_email} from <span className="font-mono">{row.filename}</span> on{' '}
                      {new Date(row.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void updateReview(row, 'approved')}
                      disabled={busyId === row.id || row.review_status === 'approved'}
                      className="px-3 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 text-sm disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateReview(row, 'rejected')}
                      disabled={busyId === row.id || row.review_status === 'rejected'}
                      className="px-3 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-100 text-sm disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-4">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Resolved Details</p>
                      <p className="mt-2 text-white">
                        {row.resolved.category || 'Uncategorized'}
                        {row.resolved.subcategory ? ` · ${row.resolved.subcategory}` : ''}
                      </p>
                      <p className="text-sm text-gray-300 mt-1">
                        {row.resolved.is_alcoholic ? 'alcoholic' : 'non-alcoholic'}
                        {row.resolved.abv != null ? ` · ${row.resolved.abv}% ABV` : ''}
                        {row.resolved.is_perishable ? ' · perishable' : ''}
                        {` · unit ${row.resolved.unit}`}
                      </p>
                      {row.resolved.description ? <p className="mt-2 text-sm text-gray-400">{row.resolved.description}</p> : null}
                    </div>
                    {row.notes.length ? (
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Importer Notes</p>
                        <p className="mt-2 text-sm text-amber-100">{row.notes.join(' ')}</p>
                      </div>
                    ) : null}
                    {row.review_notes ? (
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Review Notes</p>
                        <p className="mt-2 text-sm text-gray-300">{row.review_notes}</p>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Import Trace</p>
                      <p className="mt-2 text-sm text-gray-300">source {row.source_name}</p>
                      <p className="text-sm text-gray-300">row status {row.row_status}</p>
                      <p className="text-sm text-gray-300">action {row.import_action.replaceAll('_', ' ')}</p>
                      {row.import_result ? <p className="text-sm text-emerald-100">result {row.import_result}</p> : null}
                      {row.missing_fields.length ? <p className="text-sm text-gray-400">missing {row.missing_fields.join(', ')}</p> : null}
                    </div>
                    {row.source_refs.length ? (
                      <div className="flex flex-wrap gap-2">
                        {row.source_refs.map((ref) => (
                          <a
                            key={`${row.id}-${ref.label}-${ref.url || 'label'}`}
                            href={ref.url || '#'}
                            target={ref.url ? '_blank' : undefined}
                            rel={ref.url ? 'noreferrer' : undefined}
                            className={`text-xs px-2 py-1 rounded border ${ref.url ? 'border-cyan-400/30 text-cyan-200 hover:bg-cyan-500/10' : 'border-white/10 text-gray-300'}`}
                          >
                            {ref.label}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function MetricCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.2em] text-gray-500">{label}</p>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  )
}
