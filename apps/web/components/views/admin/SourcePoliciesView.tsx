import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'

import { apiJson, apiVoid } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type SourcePolicy = {
  id: string
  name: string
  domain: string
  metric_type: 'ratings' | 'pervasiveness'
  min_rating_count: number
  min_rating_value: number
  review_policy: 'manual' | 'auto'
  is_active: boolean
  seed_urls: string[]
  crawl_depth: number
  max_pages: number
  max_recipes: number
  crawl_interval_minutes: number
  respect_robots: boolean
  parser_settings: Record<string, any>
  alert_settings: Record<string, any>
}

type CalibrationRecommendation = {
  domain: string
  status: string
  reason?: string
  min_jobs_required?: number
  total_jobs?: number
  observed?: Record<string, any>
  recommended_alert_settings?: Record<string, any>
}

type CalibrationResponse = {
  generated_at: string
  apply: boolean
  min_jobs: number
  buffer_multiplier: number
  updated_domains: string[]
  recommendations: CalibrationRecommendation[]
}

const DEFAULT_FORM: Omit<SourcePolicy, 'id'> = {
  name: '',
  domain: '',
  metric_type: 'ratings',
  min_rating_count: 10,
  min_rating_value: 4.0,
  review_policy: 'manual',
  is_active: true,
  seed_urls: [],
  crawl_depth: 2,
  max_pages: 40,
  max_recipes: 20,
  crawl_interval_minutes: 240,
  respect_robots: true,
  parser_settings: {},
  alert_settings: {},
}

function safeJsonParse(raw: string): { ok: true; value: any } | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: true, value: {} }
  try {
    return { ok: true, value: JSON.parse(trimmed) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON' }
  }
}

export function SourcePoliciesView() {
  const [policies, setPolicies] = useState<SourcePolicy[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<Omit<SourcePolicy, 'id'>>(DEFAULT_FORM)
  const [parserJson, setParserJson] = useState('{}')
  const [alertJson, setAlertJson] = useState('{}')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [calibration, setCalibration] = useState<CalibrationResponse | null>(null)
  const [calibrating, setCalibrating] = useState(false)
  const [calibrationError, setCalibrationError] = useState('')

  const selected = useMemo(() => policies.find((p) => p.id === selectedId) ?? null, [policies, selectedId])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiJson<SourcePolicy[]>('/v1/admin/source-policies')
      setPolicies(data)
      setSelectedId((prev) => prev ?? (data.length > 0 ? data[0].id : null))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load source policies.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!selected) return
    setForm({ ...selected, id: undefined } as any)
    setParserJson(JSON.stringify(selected.parser_settings ?? {}, null, 2))
    setAlertJson(JSON.stringify(selected.alert_settings ?? {}, null, 2))
    setSaveError('')
  }, [selected])

  const save = async () => {
    setSaving(true)
    setSaveError('')
    try {
      const parserParsed = safeJsonParse(parserJson)
      if (!parserParsed.ok) throw new Error(`parser_settings JSON error: ${parserParsed.error}`)
      const alertParsed = safeJsonParse(alertJson)
      if (!alertParsed.ok) throw new Error(`alert_settings JSON error: ${alertParsed.error}`)

      const payload = {
        ...form,
        domain: form.domain.trim().toLowerCase(),
        name: form.name.trim(),
        seed_urls: form.seed_urls.filter((u) => u.trim()),
        parser_settings: parserParsed.value,
        alert_settings: alertParsed.value,
      }
      if (!selectedId) {
        const created = await apiJson<SourcePolicy>('/v1/admin/source-policies', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        setPolicies((prev) => [created, ...prev])
        setSelectedId(created.id)
      } else {
        const updated = await apiJson<SourcePolicy>(`/v1/admin/source-policies/${selectedId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        setPolicies((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const deletePolicy = async () => {
    if (!selected) return
    const ok = window.confirm(`Delete source policy for ${selected.domain}? This cannot be undone.`)
    if (!ok) return
    setSaving(true)
    setSaveError('')
    try {
      await apiVoid(`/v1/admin/source-policies/${selected.id}`, { method: 'DELETE' })
      setPolicies((prev) => prev.filter((p) => p.id !== selected.id))
      setSelectedId(null)
      setForm(DEFAULT_FORM)
      setParserJson('{}')
      setAlertJson('{}')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setSaving(false)
    }
  }

  const runCalibration = async (apply: boolean) => {
    setCalibrating(true)
    setCalibrationError('')
    try {
      const res = await apiJson<CalibrationResponse>(
        `/v1/admin/source-policies/calibrate-alerts?apply=${apply ? 'true' : 'false'}&min_jobs=20&buffer_multiplier=1.25`,
        { method: 'POST' },
      )
      setCalibration(res)
      if (apply) {
        await load()
      }
    } catch (err) {
      setCalibrationError(err instanceof Error ? err.message : 'Calibration failed.')
    } finally {
      setCalibrating(false)
    }
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Source Policies</h2>
            <p className="text-gray-400">Approve domains, tune parser settings, and calibrate alerts.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSelectedId(null)
                setForm(DEFAULT_FORM)
                setParserJson('{}')
                setAlertJson('{}')
              }}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white font-medium transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Add Source
            </button>
            <button
              type="button"
              onClick={load}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white font-medium transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Refresh
            </button>
          </div>
        </div>

        {loading && <LoadState tone="loading" title="Loading policies" message="Fetching source policy configuration." />}
        {error && <LoadState tone="error" title="Policy error" message={error} actionLabel="Retry" onAction={load} />}

        {!loading && !error && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
              <div className="p-4 border-b border-white/10">
                <h3 className="text-sm font-semibold text-white">Domains</h3>
              </div>
              <div className="divide-y divide-white/5">
                {policies.map((policy) => (
                  <button
                    key={policy.id}
                    type="button"
                    onClick={() => setSelectedId(policy.id)}
                    className={`w-full text-left p-4 hover:bg-white/5 transition-colors ${
                      selectedId === policy.id ? 'bg-purple-500/10' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-medium">{policy.domain}</p>
                        <p className="text-xs text-gray-400">{policy.name}</p>
                      </div>
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          policy.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-300'
                        }`}
                      >
                        {policy.is_active ? 'active' : 'paused'}
                      </span>
                    </div>
                  </button>
                ))}
                {policies.length === 0 && (
                  <div className="p-6 text-sm text-gray-400">No policies yet. Add your first approved domain.</div>
                )}
              </div>
            </div>

            <div className="lg:col-span-2 bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">{selected ? 'Edit Policy' : 'New Policy'}</h3>
                {selected && (
                  <button
                    type="button"
                    onClick={deletePolicy}
                    className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded-lg text-red-200 text-sm font-medium flex items-center gap-2"
                    disabled={saving}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                    Delete
                  </button>
                )}
              </div>

              {saveError && (
                <div className="mb-4">
                  <LoadState tone="error" title="Save error" message={saveError} />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Name</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white"
                    placeholder="Premium Publisher"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Domain</label>
                  <input
                    value={form.domain}
                    onChange={(e) => setForm((prev) => ({ ...prev, domain: e.target.value }))}
                    className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white"
                    placeholder="punchdrink.com"
                    disabled={Boolean(selected)}
                  />
                  {selected ? <p className="mt-1 text-xs text-gray-500">Domain is immutable once created.</p> : null}
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Metric Type</label>
                  <select
                    value={form.metric_type}
                    onChange={(e) => setForm((prev) => ({ ...prev, metric_type: e.target.value as any }))}
                    className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white"
                  >
                    <option value="ratings">Ratings/Shares</option>
                    <option value="pervasiveness">Pervasiveness</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Review Policy</label>
                  <select
                    value={form.review_policy}
                    onChange={(e) => setForm((prev) => ({ ...prev, review_policy: e.target.value as any }))}
                    className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white"
                  >
                    <option value="manual">Manual</option>
                    <option value="auto">Auto-approve (meets thresholds)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Min Rating Count</label>
                  <input
                    type="number"
                    value={form.min_rating_count}
                    onChange={(e) => setForm((prev) => ({ ...prev, min_rating_count: Number(e.target.value) }))}
                    className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Min Rating Value</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.min_rating_value}
                    onChange={(e) => setForm((prev) => ({ ...prev, min_rating_value: Number(e.target.value) }))}
                    className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="mt-6">
                <label className="block text-sm text-gray-300 mb-2">Seed URLs (one per line)</label>
                <textarea
                  value={(form.seed_urls || []).join('\n')}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      seed_urls: e.target.value.split('\n').map((line) => line.trim()).filter(Boolean),
                    }))
                  }
                  rows={4}
                  className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500/50 resize-none"
                  placeholder="https://punchdrink.com/recipes/"
                />
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Parser Settings (JSON)</label>
                  <textarea
                    value={parserJson}
                    onChange={(e) => setParserJson(e.target.value)}
                    rows={10}
                    className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-lg text-white font-mono text-xs placeholder-gray-400 focus:outline-none focus:border-purple-500/50 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Alert Settings (JSON)</label>
                  <textarea
                    value={alertJson}
                    onChange={(e) => setAlertJson(e.target.value)}
                    rows={10}
                    className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-lg text-white font-mono text-xs placeholder-gray-400 focus:outline-none focus:border-purple-500/50 resize-none"
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                  />
                  Active
                </label>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || !form.name.trim() || !form.domain.trim()}
                  className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium"
                >
                  {saving ? 'Saving…' : selected ? 'Save Changes' : 'Create Policy'}
                </button>
              </div>

              <div className="mt-10 pt-8 border-t border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-bold text-white">Alert Calibration (MIN_JOBS ≥ 20)</h3>
                    <p className="text-sm text-gray-400">
                      Generates per-domain thresholds from crawler telemetry. Apply persists into policy `alert_settings`.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => runCalibration(false)}
                      disabled={calibrating}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-sm font-medium"
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => runCalibration(true)}
                      disabled={calibrating}
                      className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-green-200 text-sm font-medium"
                    >
                      Apply
                    </button>
                  </div>
                </div>

                {calibrationError && <LoadState tone="error" title="Calibration error" message={calibrationError} />}
                {calibrating && (
                  <LoadState tone="loading" title="Calibrating" message="Computing recommended thresholds from telemetry." />
                )}
                {calibration && !calibrating && (
                  <div className="mt-4 space-y-3">
                    {calibration.recommendations.slice(0, 10).map((rec) => (
                      <div key={rec.domain} className="p-4 bg-white/5 rounded-xl border border-white/10">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-white font-medium">{rec.domain}</p>
                            <p className="text-xs text-gray-400">
                              {rec.status}
                              {rec.reason ? ` · ${rec.reason}` : ''}
                            </p>
                          </div>
                          {rec.total_jobs ? (
                            <span className="text-xs text-gray-300">{rec.total_jobs} jobs</span>
                          ) : null}
                        </div>
                        {rec.recommended_alert_settings ? (
                          <pre className="mt-3 text-xs text-gray-200 bg-black/30 border border-white/10 rounded-lg p-3 overflow-auto">
{JSON.stringify(rec.recommended_alert_settings, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    ))}
                    {calibration.recommendations.length > 10 ? (
                      <p className="text-xs text-gray-400">Showing first 10 recommendations.</p>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
