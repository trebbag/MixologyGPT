import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'

import { apiJson } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type StudioExport = {
  session: { id: string; status: string }
  constraints: Array<{ id: string; constraints: Record<string, unknown>; created_at?: string }>
  versions: Array<{ id: string; version: number; snapshot: Record<string, unknown>; created_at?: string }>
  prompts: Array<{ id: string; role: string; prompt_type: string; content: string; created_at: string }>
  analytics: {
    total_prompts: number
    total_versions: number
    total_constraints: number
    prompts_by_role: Record<string, number>
    prompts_by_type: Record<string, number>
    last_prompt_at?: string | null
  }
}

type StudioGuided = { steps: Array<{ label: string; seconds: number }> }

type StudioDiff = { from_version_id: string; to_version_id: string; diff: Record<string, unknown> }

const OFFLINE_MESSAGE = 'Network appears offline. Check your connection and try again.'

function isOfflineError(message: string): boolean {
  return message.toLowerCase().includes('offline')
}

export function StudioSessionView({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const [exportData, setExportData] = useState<StudioExport | null>(null)
  const [guided, setGuided] = useState<StudioGuided | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [template, setTemplate] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')

  const [constraintStyle, setConstraintStyle] = useState('')
  const [constraintAbv, setConstraintAbv] = useState('')
  const [constraintInclude, setConstraintInclude] = useState('')
  const [constraintExclude, setConstraintExclude] = useState('')
  const [constraintSweet, setConstraintSweet] = useState('')
  const [constraintAcid, setConstraintAcid] = useState('')
  const [constraintBitter, setConstraintBitter] = useState('')
  const [creatingConstraint, setCreatingConstraint] = useState(false)
  const [constraintError, setConstraintError] = useState('')

  const [fromVersionId, setFromVersionId] = useState('')
  const [toVersionId, setToVersionId] = useState('')
  const [diff, setDiff] = useState<StudioDiff | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState('')

  const [shareSlug, setShareSlug] = useState('')
  const [shareVersionId, setShareVersionId] = useState('')
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState('')
  const isOffline =
    isOfflineError(error) ||
    isOfflineError(generateError) ||
    isOfflineError(constraintError) ||
    isOfflineError(diffError) ||
    isOfflineError(shareError)

  const shareUrl = useMemo(() => {
    if (!shareSlug) return ''
    if (typeof window === 'undefined') return `/share/${shareSlug}`
    return `${window.location.origin}/share/${shareSlug}`
  }, [shareSlug])

  const load = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    setError('')
    try {
      const [exportRes, guidedRes] = await Promise.all([
        apiJson<StudioExport>(`/v1/studio/sessions/${sessionId}/export`),
        apiJson<StudioGuided>(`/v1/studio/sessions/${sessionId}/guided-making`).catch(() => ({ steps: [] })),
      ])
      setExportData(exportRes)
      setGuided(guidedRes)
      const versions = exportRes.versions || []
      if (versions.length >= 2) {
        const latest = versions[0]?.id ?? ''
        const prev = versions[1]?.id ?? ''
        setFromVersionId(prev)
        setToVersionId(latest)
      } else if (versions.length === 1) {
        setFromVersionId(versions[0].id)
        setToVersionId(versions[0].id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load studio session.')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void load()
  }, [load])

  const versions = exportData?.versions ?? []
  const latestVersion = versions.length ? versions[0] : null

  const snapshotRecipe = useMemo(() => {
    const snap = latestVersion?.snapshot ?? {}
    const recipe = (snap as any)?.recipe
    return recipe && typeof recipe === 'object' ? recipe : null
  }, [latestVersion?.snapshot])

  const createConstraint = async () => {
    setCreatingConstraint(true)
    setConstraintError('')
    try {
      const includeIngredients = constraintInclude
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
      const excludeIngredients = constraintExclude
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
      const constraints: Record<string, unknown> = {}
      if (constraintStyle.trim()) constraints.style = constraintStyle.trim()
      if (includeIngredients.length) constraints.include_ingredients = includeIngredients
      if (excludeIngredients.length) constraints.exclude_ingredients = excludeIngredients
      if (constraintAbv.trim()) constraints.abv_target = Number(constraintAbv)
      if (constraintSweet.trim()) constraints.sweetness_target = Number(constraintSweet)
      if (constraintAcid.trim()) constraints.acidity_target = Number(constraintAcid)
      if (constraintBitter.trim()) constraints.bitterness_target = Number(constraintBitter)

      await apiJson(`/v1/studio/sessions/${sessionId}/constraints`, {
        method: 'POST',
        body: JSON.stringify({ constraints }),
      })
      setConstraintStyle('')
      setConstraintInclude('')
      setConstraintExclude('')
      setConstraintAbv('')
      setConstraintSweet('')
      setConstraintAcid('')
      setConstraintBitter('')
      await load()
    } catch (err) {
      setConstraintError(err instanceof Error ? err.message : 'Failed to create constraint.')
    } finally {
      setCreatingConstraint(false)
    }
  }

  const generate = async () => {
    setGenerating(true)
    setGenerateError('')
    try {
      await apiJson(`/v1/studio/sessions/${sessionId}/generate`, {
        method: 'POST',
        body: JSON.stringify({ template: template.trim() || undefined }),
      })
      await load()
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed.')
    } finally {
      setGenerating(false)
    }
  }

  const loadDiff = async () => {
    setDiffLoading(true)
    setDiffError('')
    setDiff(null)
    try {
      if (!fromVersionId || !toVersionId) throw new Error('Choose two versions.')
      const url = `/v1/studio/sessions/${sessionId}/diff?from_version_id=${encodeURIComponent(fromVersionId)}&to_version_id=${encodeURIComponent(toVersionId)}`
      const payload = await apiJson<StudioDiff>(url)
      setDiff(payload)
    } catch (err) {
      setDiffError(err instanceof Error ? err.message : 'Failed to load diff.')
    } finally {
      setDiffLoading(false)
    }
  }

  const share = async () => {
    setSharing(true)
    setShareError('')
    setShareSlug('')
    try {
      const payload = await apiJson<{ slug: string }>(`/v1/studio/sessions/${sessionId}/share`, {
        method: 'POST',
        body: JSON.stringify({ version_id: shareVersionId || undefined }),
      })
      setShareSlug(payload.slug || '')
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Failed to create share link.')
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-white">Session</h2>
            <p className="text-sm text-gray-400 mt-1 break-all">id: {sessionId}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/studio')}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white"
            >
              Back
            </button>
            <button
              type="button"
              onClick={load}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white"
              disabled={loading || isOffline}
              data-testid="studio-session-refresh"
            >
              Refresh
            </button>
          </div>
        </div>

        {isOffline ? (
          <LoadState
            tone="error"
            title="Offline Mode"
            message={OFFLINE_MESSAGE}
            actionLabel="Retry"
            onAction={load}
            disabled={loading}
          />
        ) : null}
        {loading ? <LoadState tone="loading" title="Loading session" message="Fetching session export bundle." /> : null}
        {error && !isOffline ? <LoadState tone="error" title="Session error" message={error} actionLabel="Retry" onAction={load} /> : null}
        {isOffline ? <p className="text-sm text-gray-300">Session actions are disabled while offline.</p> : null}

        {!loading && !error && exportData ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
                <div className="flex items-start justify-between gap-6 flex-wrap">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Latest Draft</h3>
                    <p className="text-sm text-gray-400 mt-1">
                      Version {latestVersion?.version ?? '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      className="rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                      placeholder="Template (optional)"
                      value={template}
                      onChange={(event) => setTemplate(event.target.value)}
                    />
                    <button
                      type="button"
                      onClick={generate}
                      className="px-5 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium disabled:opacity-60"
                      disabled={generating || isOffline}
                      data-testid="studio-session-generate"
                    >
                      {generating ? 'Generating…' : 'Generate'}
                    </button>
                  </div>
                </div>

                {generateError && !isOffline ? (
                  <div className="mt-4 text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                    {generateError}
                  </div>
                ) : null}

                {snapshotRecipe ? (
                  <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                      <p className="text-sm text-gray-400">Name</p>
                      <p className="mt-1 text-white font-semibold text-lg">{String((snapshotRecipe as any).name || 'Untitled')}</p>
                      <div className="mt-4 flex items-center gap-2 flex-wrap text-xs text-gray-400">
                        {(snapshotRecipe as any).glassware ? (
                          <span className="px-2 py-1 rounded bg-white/10 border border-white/10">
                            glassware: {String((snapshotRecipe as any).glassware)}
                          </span>
                        ) : null}
                        {(snapshotRecipe as any).ice_style ? (
                          <span className="px-2 py-1 rounded bg-white/10 border border-white/10">
                            ice: {String((snapshotRecipe as any).ice_style)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                      <p className="text-sm text-gray-400">Ingredients</p>
                      <div className="mt-2 space-y-2">
                        {Array.isArray((snapshotRecipe as any).ingredients) && (snapshotRecipe as any).ingredients.length ? (
                          (snapshotRecipe as any).ingredients.slice(0, 10).map((ing: any, idx: number) => (
                            <div key={`${idx}`} className="text-sm text-gray-200">
                              {String(ing.quantity ?? '')} {String(ing.unit ?? '')} {String(ing.name ?? '')}
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-gray-500">No ingredient list in snapshot.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-5">
                    <LoadState tone="empty" title="No draft yet" message="Generate a version to create a first draft recipe." />
                  </div>
                )}

                <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
                  <p className="text-sm text-gray-400">Guided Making</p>
                  <div className="mt-2 space-y-2">
                    {(guided?.steps ?? []).length === 0 ? (
                      <p className="text-sm text-gray-500">No guided steps yet. Generate a draft to populate.</p>
                    ) : (
                      (guided?.steps ?? []).slice(0, 12).map((step, idx) => (
                        <div key={`${idx}`} className="flex items-center justify-between gap-4">
                          <p className="text-sm text-gray-200">{step.label}</p>
                          <p className="text-xs text-gray-500">{step.seconds}s</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
                <h3 className="text-lg font-semibold text-white">Version Diff</h3>
                <p className="text-sm text-gray-400 mt-1">Compare any two versions for review and revert decisions.</p>
                <div className="mt-4 flex items-center gap-3 flex-wrap">
                  <select
                    className="rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                    value={fromVersionId}
                    onChange={(event) => setFromVersionId(event.target.value)}
                  >
                    <option value="">From…</option>
                    {versions.map((v) => (
                      <option key={`from-${v.id}`} value={v.id}>
                        v{v.version}
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                    value={toVersionId}
                    onChange={(event) => setToVersionId(event.target.value)}
                  >
                    <option value="">To…</option>
                    {versions.map((v) => (
                      <option key={`to-${v.id}`} value={v.id}>
                        v{v.version}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={loadDiff}
                    className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white disabled:opacity-60"
                    disabled={diffLoading || !fromVersionId || !toVersionId || isOffline}
                    data-testid="studio-session-load-diff"
                  >
                    {diffLoading ? 'Loading…' : 'Load Diff'}
                  </button>
                </div>
                {diffError && !isOffline ? (
                  <div className="mt-4 text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                    {diffError}
                  </div>
                ) : null}
                {diff ? (
                  <pre className="mt-4 text-xs text-gray-200 bg-black/30 border border-white/10 rounded-xl p-4 overflow-auto">
                    {JSON.stringify(diff.diff, null, 2)}
                  </pre>
                ) : null}
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
                <h3 className="text-lg font-semibold text-white">Constraints</h3>
                <p className="text-sm text-gray-400 mt-1">Add constraints to steer generation.</p>
                <div className="mt-4 space-y-3">
                  <input
                    className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                    placeholder="Style (e.g., sour, negroni)"
                    value={constraintStyle}
                    onChange={(event) => setConstraintStyle(event.target.value)}
                  />
                  <input
                    className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                    placeholder="Include ingredients (comma separated)"
                    value={constraintInclude}
                    onChange={(event) => setConstraintInclude(event.target.value)}
                  />
                  <input
                    className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                    placeholder="Exclude ingredients (comma separated)"
                    value={constraintExclude}
                    onChange={(event) => setConstraintExclude(event.target.value)}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                      placeholder="ABV target (e.g., 18)"
                      value={constraintAbv}
                      onChange={(event) => setConstraintAbv(event.target.value)}
                    />
                    <input
                      className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                      placeholder="Sweetness (0-10)"
                      value={constraintSweet}
                      onChange={(event) => setConstraintSweet(event.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                      placeholder="Acidity (0-10)"
                      value={constraintAcid}
                      onChange={(event) => setConstraintAcid(event.target.value)}
                    />
                    <input
                      className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                      placeholder="Bitterness (0-10)"
                      value={constraintBitter}
                      onChange={(event) => setConstraintBitter(event.target.value)}
                    />
                  </div>
                  {constraintError && !isOffline ? (
                    <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                      {constraintError}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={createConstraint}
                    disabled={creatingConstraint || isOffline}
                    className="px-5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white disabled:opacity-60"
                    data-testid="studio-session-add-constraint"
                  >
                    {creatingConstraint ? 'Saving…' : 'Add Constraint'}
                  </button>
                </div>

                <div className="mt-6 space-y-2">
                  {(exportData.constraints ?? []).length === 0 ? (
                    <p className="text-xs text-gray-500">No constraints recorded yet.</p>
                  ) : (
                    exportData.constraints.slice(0, 8).map((c) => (
                      <div key={c.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <p className="text-[11px] text-gray-500 break-all">id: {c.id}</p>
                        <pre className="mt-2 text-xs text-gray-200 overflow-auto">
                          {JSON.stringify(c.constraints, null, 2)}
                        </pre>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
                <h3 className="text-lg font-semibold text-white">Share</h3>
                <p className="text-sm text-gray-400 mt-1">Generate a shareable snapshot link.</p>
                <div className="mt-4 space-y-3">
                  <select
                    className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                    value={shareVersionId}
                    onChange={(event) => setShareVersionId(event.target.value)}
                  >
                    <option value="">Latest version</option>
                    {versions.map((v) => (
                      <option key={`share-${v.id}`} value={v.id}>
                        v{v.version}
                      </option>
                    ))}
                  </select>
                  {shareError && !isOffline ? (
                    <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                      {shareError}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={share}
                    disabled={sharing || isOffline}
                    className="px-5 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium disabled:opacity-60"
                    data-testid="studio-session-create-share"
                  >
                    {sharing ? 'Creating…' : 'Create Share Link'}
                  </button>
                  {shareSlug ? (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs text-gray-400">Share URL</p>
                      <p className="mt-1 text-sm text-white break-all">{shareUrl}</p>
                      <button
                        type="button"
                        className="mt-3 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white"
                        onClick={async () => {
                          try {
                            if (!shareUrl) return
                            await navigator.clipboard.writeText(shareUrl)
                          } catch {
                            // ignore clipboard failures (browser permissions)
                          }
                        }}
                      >
                        Copy
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
                <h3 className="text-lg font-semibold text-white">Analytics</h3>
                <div className="mt-4 space-y-2 text-sm text-gray-300">
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-400">Prompts</span>
                    <span className="text-white font-semibold">{exportData.analytics.total_prompts}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-400">Versions</span>
                    <span className="text-white font-semibold">{exportData.analytics.total_versions}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-400">Constraints</span>
                    <span className="text-white font-semibold">{exportData.analytics.total_constraints}</span>
                  </div>
                  {exportData.analytics.last_prompt_at ? (
                    <p className="text-xs text-gray-500 mt-3">
                      Last prompt {new Date(exportData.analytics.last_prompt_at).toLocaleString()}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
