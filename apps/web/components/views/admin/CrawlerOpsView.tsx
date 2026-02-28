import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'

import { apiJson } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type SourcePolicy = {
  id: string
  domain: string
}

type RecoverySuggestion = {
  policy_id: string
  domain: string
  parse_failure: string
  source_url: string
  actions: string[]
  changed_keys: string[]
  patch: Record<string, any>
  applied: boolean
}

type Telemetry = {
  generated_at: string
  global: {
    total_jobs: number
    failed_jobs: number
    retryable_jobs: number
    max_attempts: number
    fallback_class_totals?: Record<string, number>
    parse_failure_totals?: Record<string, number>
  }
  domains: Array<{
    domain: string
    total_jobs: number
    pending: number
    running: number
    succeeded: number
    failed: number
    retryable: number
    failure_rate: number
    compliance_rejections: number
    avg_attempt_count: number
    avg_retry_delay_seconds: number
    parser_fallback_rate: number
    parse_failure_rate: number
    parser_strategies: Record<string, number>
    fallback_class_counts: Record<string, number>
    recovery_strategy_counts?: Record<string, number>
    parse_failure_counts: Record<string, number>
    top_failure_reasons?: Array<[string, number]>
    top_parse_failure_classes?: Array<[string, number]>
    triage_hints?: string[]
    latest_failures?: Array<{
      job_id: string
      source_url: string
      attempt_count: number
      next_retry_at?: string | null
      error?: string | null
      compliance_reasons?: string[]
    }>
    alert_thresholds: Record<string, number>
  }>
  alerts: Array<{
    domain: string
    severity: string
    metric: string
    actual: number
    threshold: number
    message: string
  }>
}

const RECOVERY_SUPPORTED_FAILURES = new Set([
  'domain-selector-mismatch',
  'domain-ingredients-sparse',
  'domain-instructions-sparse',
  'instruction-structure-mismatch',
  'jsonld-parse-failed',
  'jsonld-incomplete',
  'microdata-parse-failed',
  'microdata-incomplete',
  'low-confidence-parse',
  'missing-recipe-markers',
  'insufficient-page-content',
])

export function CrawlerOpsView() {
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null)
  const [policyByDomain, setPolicyByDomain] = useState<Record<string, SourcePolicy>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [recoveryByDomain, setRecoveryByDomain] = useState<
    Record<
      string,
      {
        loading: boolean
        error: string
        suggestion: RecoverySuggestion | null
        selectedFailure: string
        sourceUrl: string
      }
    >
  >({})

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [telemetryData, policies] = await Promise.all([
        apiJson<Telemetry>('/v1/admin/crawler-ops/telemetry'),
        apiJson<SourcePolicy[]>('/v1/admin/source-policies'),
      ])
      setTelemetry(telemetryData)
      const map: Record<string, SourcePolicy> = {}
      for (const policy of policies) {
        const domain = (policy.domain || '').toLowerCase()
        if (!domain) continue
        map[domain] = policy
      }
      setPolicyByDomain(map)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load crawler telemetry.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const alerts = telemetry?.alerts ?? []
  const global = telemetry?.global

  const sortedDomains = useMemo(() => {
    const domains = telemetry?.domains ?? []
    return [...domains].sort((a, b) => (b.failure_rate || 0) - (a.failure_rate || 0))
  }, [telemetry?.domains])

  const suggestRecovery = useCallback(
    async (domain: string, parseFailure: string, sourceUrl: string) => {
      const key = (domain || '').toLowerCase()
      const policy = policyByDomain[key]
      if (!policy) {
        setRecoveryByDomain((prev) => ({
          ...prev,
          [key]: {
            loading: false,
            error: 'No source policy exists for this domain. Create one first in Source Policies.',
            suggestion: null,
            selectedFailure: parseFailure,
            sourceUrl,
          },
        }))
        return
      }

      setRecoveryByDomain((prev) => ({
        ...prev,
        [key]: {
          loading: true,
          error: '',
          suggestion: null,
          selectedFailure: parseFailure,
          sourceUrl,
        },
      }))

      try {
        const suggestion = await apiJson<RecoverySuggestion>(
          `/v1/admin/source-policies/${policy.id}/parser-settings/suggest-recovery?apply=false`,
          {
            method: 'POST',
            body: JSON.stringify({ parse_failure: parseFailure, source_url: sourceUrl }),
          },
        )
        setRecoveryByDomain((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            loading: false,
            error: '',
            suggestion,
          },
        }))
      } catch (err) {
        setRecoveryByDomain((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            loading: false,
            suggestion: null,
            error: err instanceof Error ? err.message : 'Failed to generate recovery suggestion.',
          },
        }))
      }
    },
    [policyByDomain],
  )

  const applyRecovery = useCallback(
    async (domain: string) => {
      const key = (domain || '').toLowerCase()
      const state = recoveryByDomain[key]
      const policy = policyByDomain[key]
      if (!state || !policy) return
      if (!state.selectedFailure) return
      const ok = window.confirm(
        `Apply recovery parser settings for ${key} (failure class: ${state.selectedFailure})?\\n\\nThis updates parser_settings in Source Policies.`,
      )
      if (!ok) return

      setRecoveryByDomain((prev) => ({
        ...prev,
        [key]: { ...prev[key], loading: true, error: '' },
      }))

      try {
        const suggestion = await apiJson<RecoverySuggestion>(
          `/v1/admin/source-policies/${policy.id}/parser-settings/suggest-recovery?apply=true`,
          {
            method: 'POST',
            body: JSON.stringify({ parse_failure: state.selectedFailure, source_url: state.sourceUrl }),
          },
        )
        setRecoveryByDomain((prev) => ({
          ...prev,
          [key]: { ...prev[key], loading: false, error: '', suggestion },
        }))
      } catch (err) {
        setRecoveryByDomain((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            loading: false,
            suggestion: prev[key]?.suggestion ?? null,
            error: err instanceof Error ? err.message : 'Failed to apply recovery patch.',
          },
        }))
      }
    },
    [policyByDomain, recoveryByDomain],
  )

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Crawler Ops</h2>
            <p className="text-gray-400">Telemetry, failure classes, and triage hints by domain.</p>
          </div>
          <button
            type="button"
            onClick={load}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white font-medium transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Refresh
          </button>
        </div>

        {loading && <LoadState tone="loading" title="Loading telemetry" message="Aggregating harvest job metrics." />}
        {error && <LoadState tone="error" title="Telemetry error" message={error} actionLabel="Retry" onAction={load} />}

        {!loading && !error && telemetry && global && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-black/40 backdrop-blur-xl rounded-xl border border-white/10 p-6">
                <p className="text-sm text-gray-400 mb-1">Total Jobs</p>
                <p className="text-3xl font-bold text-white">{global.total_jobs}</p>
              </div>
              <div className="bg-black/40 backdrop-blur-xl rounded-xl border border-red-500/30 p-6">
                <p className="text-sm text-gray-400 mb-1">Failed</p>
                <p className="text-3xl font-bold text-red-400">{global.failed_jobs}</p>
              </div>
              <div className="bg-black/40 backdrop-blur-xl rounded-xl border border-orange-500/30 p-6">
                <p className="text-sm text-gray-400 mb-1">Retryable</p>
                <p className="text-3xl font-bold text-orange-400">{global.retryable_jobs}</p>
              </div>
              <div className="bg-black/40 backdrop-blur-xl rounded-xl border border-purple-500/30 p-6">
                <p className="text-sm text-gray-400 mb-1">Max Attempts</p>
                <p className="text-3xl font-bold text-purple-400">{global.max_attempts}</p>
              </div>
            </div>

            {alerts.length > 0 && (
              <div className="mb-8 bg-red-500/10 border border-red-500/30 rounded-2xl p-6 backdrop-blur-xl">
                <div className="flex items-center gap-3 mb-3">
                  <TriangleAlert className="w-5 h-5 text-red-300" aria-hidden="true" />
                  <h3 className="text-lg font-bold text-white">Active Alerts</h3>
                </div>
                <div className="space-y-2">
                  {alerts.map((alert, idx) => (
                    <div key={`${alert.domain}-${alert.metric}-${idx}`} className="text-sm text-gray-200">
                      <span className="font-semibold text-white">{alert.domain}</span>
                      <span className="text-gray-400"> · {alert.metric}</span>
                      <span className="text-gray-400">
                        {' '}
                        ({alert.actual.toFixed(3)} &gt; {alert.threshold})
                      </span>
                      <span className="text-gray-300"> · {alert.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              {sortedDomains.map((domain) => (
                <div key={domain.domain} className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-white">{domain.domain}</h3>
                      <p className="text-sm text-gray-400">
                        Jobs: {domain.total_jobs} · Failure rate: {(domain.failure_rate * 100).toFixed(1)}% · Fallback:{' '}
                        {(domain.parser_fallback_rate * 100).toFixed(1)}% · Parse fail:{' '}
                        {(domain.parse_failure_rate * 100).toFixed(1)}% · Compliance: {domain.compliance_rejections}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Avg attempts</p>
                      <p className="text-lg font-semibold text-white">{domain.avg_attempt_count.toFixed(2)}</p>
                    </div>
                  </div>

                  {domain.triage_hints && domain.triage_hints.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs text-gray-400 mb-2">Triage hints</p>
                      <ul className="space-y-1 text-sm text-gray-200 list-disc pl-5">
                        {domain.triage_hints.map((hint) => (
                          <li key={hint}>{hint}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {domain.latest_failures && domain.latest_failures.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs text-gray-400 mb-2">Latest failures</p>
                      <div className="space-y-2">
                        {domain.latest_failures.slice(0, 4).map((failure) => (
                          <div key={failure.job_id} className="p-3 bg-white/5 rounded-lg border border-white/10">
                            <p className="text-xs text-gray-300 break-all">{failure.source_url}</p>
                            <p className="text-xs text-gray-400">
                              attempt {failure.attempt_count}
                              {failure.next_retry_at ? ` · retry @ ${failure.next_retry_at}` : ''}
                            </p>
                            {failure.compliance_reasons && failure.compliance_reasons.length > 0 && (
                              <p className="mt-1 text-xs text-orange-200">
                                compliance: {failure.compliance_reasons.join(', ')}
                              </p>
                            )}
                            {failure.error ? <p className="mt-1 text-xs text-red-200">{failure.error}</p> : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-5">
                    <p className="text-xs text-gray-400 mb-2">Recovery promotion</p>
                    {(() => {
                      const key = (domain.domain || '').toLowerCase()
                      const policy = policyByDomain[key]
                      const recoveryState = recoveryByDomain[key]
                      const sampleUrl =
                        domain.latest_failures && domain.latest_failures.length > 0
                          ? domain.latest_failures[0]?.source_url
                          : `https://${key}/`
                      const parseFailureCandidates = (domain.top_parse_failure_classes ?? [])
                        .filter(([failureClass]) => RECOVERY_SUPPORTED_FAILURES.has(failureClass))
                        .map(([failureClass, count]) => ({
                          failureClass,
                          count: Number(count) || 0,
                          source: 'parse_failed' as const,
                        }))

                      const fallbackCandidates = Object.entries(domain.fallback_class_counts ?? {})
                        .map(([failureClass, count]) => ({
                          failureClass,
                          count: Number(count) || 0,
                          source: 'dom_fallback' as const,
                        }))
                        .filter((entry) => RECOVERY_SUPPORTED_FAILURES.has(entry.failureClass))

                      const recoveryCandidates = Object.entries(domain.recovery_strategy_counts ?? {})
                        .map(([failureClass, count]) => ({
                          failureClass,
                          count: Number(count) || 0,
                          source: 'recovery' as const,
                        }))
                        .filter((entry) => RECOVERY_SUPPORTED_FAILURES.has(entry.failureClass))

                      const mergedCandidates = (() => {
                        const bestByClass = new Map<
                          string,
                          { failureClass: string; count: number; source: 'parse_failed' | 'dom_fallback' | 'recovery' }
                        >()
                        for (const entry of [...parseFailureCandidates, ...fallbackCandidates, ...recoveryCandidates]) {
                          const existing = bestByClass.get(entry.failureClass)
                          if (!existing || entry.count > existing.count) bestByClass.set(entry.failureClass, entry)
                        }
                        return Array.from(bestByClass.values())
                          .sort((a, b) => (b.count || 0) - (a.count || 0))
                          .slice(0, 8)
                      })()

                      return (
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                          {!policy ? (
                            <p className="text-sm text-gray-300">
                              No source policy found for this domain. Create one in Admin → Source Policies before applying parser
                              patches.
                            </p>
                          ) : mergedCandidates.length === 0 ? (
                            <p className="text-sm text-gray-300">
                              No supported failure classes seen yet. Increase staging crawl volume and verify telemetry is collecting
                              fallback/parse-failure classes for this domain.
                            </p>
                          ) : (
                            <>
                              <p className="text-sm text-gray-200">
                                Choose a failure class (fallback/parse/recovery) to generate a suggested `parser_settings` patch (preview
                                first, then apply).
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {mergedCandidates.map((entry) => (
                                  <button
                                    key={`${key}-${entry.source}-${entry.failureClass}`}
                                    type="button"
                                    disabled={Boolean(recoveryState?.loading)}
                                    onClick={() => suggestRecovery(key, entry.failureClass, sampleUrl)}
                                    className="px-3 py-2 rounded-lg bg-black/30 border border-white/10 hover:bg-black/40 disabled:opacity-50 disabled:cursor-not-allowed text-xs text-gray-200"
                                    title={`Generate patch for ${entry.failureClass}`}
                                  >
                                    {entry.source === 'dom_fallback'
                                      ? `fallback:${entry.failureClass}`
                                      : entry.source === 'recovery'
                                        ? `recovery:${entry.failureClass}`
                                        : entry.failureClass}{' '}
                                    · {entry.count}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}

                          {recoveryState?.loading ? (
                            <div className="mt-4">
                              <LoadState
                                tone="loading"
                                title="Generating recovery patch"
                                message="Building suggested parser settings from recovery heuristics."
                              />
                            </div>
                          ) : null}

                          {recoveryState?.error ? (
                            <div className="mt-4">
                              <LoadState tone="error" title="Recovery suggestion error" message={recoveryState.error} />
                            </div>
                          ) : null}

                          {recoveryState?.suggestion ? (
                            <div className="mt-4">
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div>
                                  <p className="text-sm font-semibold text-white">
                                    Suggested patch: <span className="text-purple-200">{recoveryState.suggestion.parse_failure}</span>
                                  </p>
                                  <p className="text-xs text-gray-400">
                                    actions: {recoveryState.suggestion.actions.length ? recoveryState.suggestion.actions.join(', ') : 'none'}
                                    {recoveryState.suggestion.changed_keys.length
                                      ? ` · keys: ${recoveryState.suggestion.changed_keys.join(', ')}`
                                      : ''}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  disabled={
                                    Boolean(recoveryState.loading) ||
                                    recoveryState.suggestion.applied ||
                                    recoveryState.suggestion.actions.length === 0 ||
                                    recoveryState.suggestion.changed_keys.length === 0
                                  }
                                  onClick={() => applyRecovery(key)}
                                  className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-green-200 text-sm font-medium"
                                >
                                  {recoveryState.suggestion.applied ? 'Applied' : 'Apply patch'}
                                </button>
                              </div>

                              <pre className="mt-3 text-xs text-gray-200 bg-black/30 border border-white/10 rounded-lg p-3 overflow-auto">
{JSON.stringify(recoveryState.suggestion.patch, null, 2)}
                              </pre>

                              <p className="mt-2 text-xs text-gray-400">
                                This is a recovery heuristic patch. Promote only after reviewing the domain HTML and confirming it does not
                                weaken compliance requirements.
                              </p>
                            </div>
                          ) : null}
                        </div>
                      )
                    })()}
                  </div>

                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm text-purple-300 hover:text-purple-200">
                      Show raw counters
                    </summary>
                    <pre className="mt-2 text-xs text-gray-200 bg-black/30 border border-white/10 rounded-lg p-3 overflow-auto">
{JSON.stringify(
  {
    parser_strategies: domain.parser_strategies,
    fallback_class_counts: domain.fallback_class_counts,
    recovery_strategy_counts: domain.recovery_strategy_counts,
    parse_failure_counts: domain.parse_failure_counts,
    alert_thresholds: domain.alert_thresholds,
  },
  null,
  2,
)}
                    </pre>
                  </details>
                </div>
              ))}

              {sortedDomains.length === 0 && (
                <LoadState
                  tone="empty"
                  title="No telemetry yet"
                  message="Run harvest jobs in staging to populate crawler ops metrics."
                />
              )}
            </div>
          </>
        )}

        {!loading && !error && !telemetry && (
          <LoadState tone="empty" title="No telemetry yet" message="Run harvest jobs to populate crawler ops metrics." />
        )}
      </div>
    </div>
  )
}
