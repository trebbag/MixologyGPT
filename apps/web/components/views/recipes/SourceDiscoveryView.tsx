import { useMemo, useState } from 'react'
import { CheckCircle, ExternalLink, Plus, XCircle } from 'lucide-react'

import { apiJson } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type DiscoveryResponse = {
  allowed: string[]
  blocked: Array<{ url: string; reason: string }>
}

type AutoHarvestResponse = {
  status: string
  parsed_count: number
  queued_job_ids: string[]
  errors?: string[]
}

function domainFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return (parsed.hostname || '').replace(/^www\\./, '')
  } catch {
    return ''
  }
}

export function SourceDiscoveryView() {
  const [urlInput, setUrlInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<DiscoveryResponse | null>(null)

  const [harvestLoadingByUrl, setHarvestLoadingByUrl] = useState<Record<string, boolean>>({})
  const [harvestResultByUrl, setHarvestResultByUrl] = useState<Record<string, AutoHarvestResponse | null>>({})
  const [harvestErrorByUrl, setHarvestErrorByUrl] = useState<Record<string, string>>({})

  const urls = useMemo(
    () =>
      urlInput
        .split('\\n')
        .map((line) => line.trim())
        .filter(Boolean),
    [urlInput],
  )

  const submit = async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await apiJson<DiscoveryResponse>('/v1/recipes/harvest/discover', {
        method: 'POST',
        body: JSON.stringify({ urls }),
      })
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Source discovery failed.')
    } finally {
      setLoading(false)
    }
  }

  const harvest = async (url: string) => {
    setHarvestErrorByUrl((prev) => ({ ...prev, [url]: '' }))
    setHarvestResultByUrl((prev) => ({ ...prev, [url]: null }))
    setHarvestLoadingByUrl((prev) => ({ ...prev, [url]: true }))
    try {
      const res = await apiJson<AutoHarvestResponse>('/v1/recipes/harvest/auto', {
        method: 'POST',
        body: JSON.stringify({ source_url: url, source_type: 'web', max_links: 12, enqueue: true }),
      })
      setHarvestResultByUrl((prev) => ({ ...prev, [url]: res }))
    } catch (err) {
      setHarvestErrorByUrl((prev) => ({ ...prev, [url]: err instanceof Error ? err.message : 'Harvest failed.' }))
    } finally {
      setHarvestLoadingByUrl((prev) => ({ ...prev, [url]: false }))
    }
  }

  const allowedCount = result?.allowed?.length ?? 0
  const blockedCount = result?.blocked?.length ?? 0

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Source Discovery</h2>
          <p className="text-gray-400">Check URL allowlist and policy status</p>
        </div>

        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="bg-black/40 backdrop-blur-xl rounded-xl border border-white/10 p-6">
            <p className="text-sm text-gray-400 mb-1">Total</p>
            <p className="text-3xl font-bold text-white">{allowedCount + blockedCount}</p>
          </div>
          <div className="bg-black/40 backdrop-blur-xl rounded-xl border border-green-500/30 p-6">
            <p className="text-sm text-gray-400 mb-1">Allowed</p>
            <p className="text-3xl font-bold text-green-400">{allowedCount}</p>
          </div>
          <div className="bg-black/40 backdrop-blur-xl rounded-xl border border-red-500/30 p-6">
            <p className="text-sm text-gray-400 mb-1">Blocked</p>
            <p className="text-3xl font-bold text-red-400">{blockedCount}</p>
          </div>
        </div>

        <div className="mb-8 bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
          <h3 className="text-lg font-bold text-white mb-4">Check URLs</h3>
          <textarea
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            rows={5}
            placeholder={'Paste URLs (one per line)\\nhttps://example.com/recipe1\\nhttps://example.com/recipe2'}
            className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:border-purple-500/50 focus:outline-none resize-none mb-4"
          />
          <button
            type="button"
            onClick={submit}
            disabled={urls.length === 0 || loading}
            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium flex items-center space-x-2"
          >
            <Plus className="w-5 h-5" aria-hidden="true" />
            <span>{loading ? 'Checking…' : 'Check URLs'}</span>
          </button>
        </div>

        {error && <LoadState tone="error" title="Discovery error" message={error} actionLabel="Retry" onAction={submit} />}

        {result && (
          <div className="space-y-3">
            {result.allowed.map((url) => {
              const domain = domainFromUrl(url)
              const harvestLoading = harvestLoadingByUrl[url] ?? false
              const harvestResult = harvestResultByUrl[url]
              const harvestError = harvestErrorByUrl[url]
              return (
                <div key={url} className="p-6 rounded-xl border border-green-500/30 bg-green-500/10 backdrop-blur-xl">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <CheckCircle className="w-5 h-5 text-green-400" aria-hidden="true" />
                        <h3 className="text-lg font-bold text-white">{domain}</h3>
                        <span className="px-3 py-1 rounded-full text-xs font-medium uppercase bg-green-500/20 text-green-400">
                          allowed
                        </span>
                      </div>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-300 hover:text-blue-200 text-sm flex items-center space-x-1 break-all"
                      >
                        <span className="truncate max-w-xl">{url}</span>
                        <ExternalLink className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                      </a>
                      {harvestError ? (
                        <div className="mt-3">
                          <LoadState tone="error" title="Harvest error" message={harvestError} />
                        </div>
                      ) : null}
                      {harvestResult ? (
                        <div className="mt-3 p-3 bg-black/30 border border-white/10 rounded-lg text-sm text-gray-200">
                          Parsed {harvestResult.parsed_count} · Queued {harvestResult.queued_job_ids.length}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => harvest(url)}
                      disabled={harvestLoading}
                      className="ml-4 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-green-200 text-sm font-medium"
                    >
                      {harvestLoading ? 'Harvesting…' : 'Harvest'}
                    </button>
                  </div>
                </div>
              )
            })}

            {result.blocked.map((entry) => {
              const domain = domainFromUrl(entry.url)
              return (
                <div key={entry.url} className="p-6 rounded-xl border border-red-500/30 bg-red-500/10 backdrop-blur-xl">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <XCircle className="w-5 h-5 text-red-400" aria-hidden="true" />
                        <h3 className="text-lg font-bold text-white">{domain || entry.url}</h3>
                        <span className="px-3 py-1 rounded-full text-xs font-medium uppercase bg-red-500/20 text-red-400">
                          blocked
                        </span>
                      </div>
                      <p className="text-sm text-gray-200">{entry.reason}</p>
                    </div>
                  </div>
                </div>
              )
            })}

            {result.allowed.length === 0 && result.blocked.length === 0 && (
              <LoadState tone="empty" title="No results" message="Paste URLs above to check policy allowlist." />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

