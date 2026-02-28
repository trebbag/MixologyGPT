import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, Search } from 'lucide-react'

import { apiJson } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type KnowledgeSearchResult = {
  document_id: string
  chunk_id: string
  title?: string | null
  source_url?: string | null
  source_type?: string | null
  license?: string | null
  content: string
  citations?: any[] | null
  score?: number | null
}

type KnowledgeSearchResponse = { results: KnowledgeSearchResult[] }

type KnowledgeIngestResponse = { document_id: string; chunks: number }

type LicenseReport = { by_license: Record<string, number>; missing: number }

const OFFLINE_MESSAGE = 'Network appears offline. Check your connection and try again.'

function isOfflineError(message: string): boolean {
  return message.toLowerCase().includes('offline')
}

function safeParseJson(text: string): { ok: true; value: any } | { ok: false; error: string } {
  const trimmed = text.trim()
  if (!trimmed) return { ok: true, value: null }
  try {
    return { ok: true, value: JSON.parse(trimmed) }
  } catch {
    return { ok: false, error: 'Must be valid JSON.' }
  }
}

export function KnowledgeView() {
  const [tab, setTab] = useState<'search' | 'ingest' | 'licenses'>('search')

  // Search
  const [query, setQuery] = useState('')
  const [sourceType, setSourceType] = useState('')
  const [license, setLicense] = useState('')
  const [limit, setLimit] = useState('8')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>([])

  // Ingest
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [ingestSourceUrl, setIngestSourceUrl] = useState('')
  const [ingestSourceType, setIngestSourceType] = useState('web')
  const [ingestLicense, setIngestLicense] = useState('internal')
  const [citationsJson, setCitationsJson] = useState('')
  const [metadataJson, setMetadataJson] = useState('')
  const [chunkSize, setChunkSize] = useState('600')
  const [chunkOverlap, setChunkOverlap] = useState('80')
  const [ingestLoading, setIngestLoading] = useState(false)
  const [ingestError, setIngestError] = useState('')
  const [ingestResult, setIngestResult] = useState<KnowledgeIngestResponse | null>(null)

  // Licenses
  const [licenseLoading, setLicenseLoading] = useState(false)
  const [licenseError, setLicenseError] = useState('')
  const [licenseReport, setLicenseReport] = useState<LicenseReport | null>(null)
  const isOffline = isOfflineError(searchError) || isOfflineError(ingestError) || isOfflineError(licenseError)

  const runSearch = useCallback(async () => {
    setSearchLoading(true)
    setSearchError('')
    setSearchResults([])
    try {
      const lim = Math.min(Math.max(Number(limit) || 8, 1), 50)
      const payload = {
        query: query.trim(),
        source_type: sourceType.trim() || undefined,
        license: license.trim() || undefined,
        limit: lim,
      }
      const res = await apiJson<KnowledgeSearchResponse>('/v1/knowledge/search', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setSearchResults(res.results || [])
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed.')
    } finally {
      setSearchLoading(false)
    }
  }, [license, limit, query, sourceType])

  const citationsParse = useMemo(() => safeParseJson(citationsJson), [citationsJson])
  const metadataParse = useMemo(() => safeParseJson(metadataJson), [metadataJson])

  const ingestDisabledReason = useMemo(() => {
    if (!title.trim()) return 'Title is required.'
    if (!content.trim()) return 'Content is required.'
    if (ingestSourceUrl.trim() && !citationsJson.trim()) return 'Citations are required when source_url is provided.'
    if (citationsParse.ok && citationsParse.value !== null && !Array.isArray(citationsParse.value)) return 'Citations must be a JSON array.'
    if (!citationsParse.ok) return citationsParse.error
    if (!metadataParse.ok) return metadataParse.error
    const cs = Number(chunkSize)
    const co = Number(chunkOverlap)
    if (!Number.isFinite(cs) || cs <= 0) return 'chunk_size must be a positive number.'
    if (!Number.isFinite(co) || co < 0) return 'chunk_overlap must be >= 0.'
    if (co >= cs) return 'chunk_overlap must be smaller than chunk_size.'
    return ''
  }, [chunkOverlap, chunkSize, citationsJson, citationsParse, content, ingestSourceUrl, metadataParse, title])

  const runIngest = useCallback(async () => {
    setIngestLoading(true)
    setIngestError('')
    setIngestResult(null)
    try {
      if (ingestDisabledReason) throw new Error(ingestDisabledReason)
      const payload = {
        title: title.trim(),
        content: content,
        source_url: ingestSourceUrl.trim() || undefined,
        source_type: ingestSourceType.trim() || undefined,
        license: ingestLicense.trim() || undefined,
        citations: citationsJson.trim() ? citationsParse.ok ? citationsParse.value : undefined : undefined,
        metadata: metadataJson.trim() ? (metadataParse.ok ? metadataParse.value : undefined) : undefined,
        chunk_size: Number(chunkSize),
        chunk_overlap: Number(chunkOverlap),
      }
      const res = await apiJson<KnowledgeIngestResponse>('/v1/knowledge/ingest', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setIngestResult(res)
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : 'Ingest failed.')
    } finally {
      setIngestLoading(false)
    }
  }, [chunkOverlap, chunkSize, citationsJson, citationsParse, content, ingestDisabledReason, ingestLicense, ingestSourceType, ingestSourceUrl, metadataJson, metadataParse, title])

  const loadLicenseReport = useCallback(async () => {
    setLicenseLoading(true)
    setLicenseError('')
    setLicenseReport(null)
    try {
      const res = await apiJson<LicenseReport>('/v1/knowledge/licenses/report')
      setLicenseReport(res)
    } catch (err) {
      setLicenseError(err instanceof Error ? err.message : 'Failed to load license report.')
    } finally {
      setLicenseLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'licenses') void loadLicenseReport()
  }, [loadLicenseReport, tab])

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-white">Knowledge</h2>
            <p className="text-sm text-gray-400 mt-1">Search and ingest licensed content for RAG-backed Studio guidance.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('search')}
              className={[
                'px-4 py-2 rounded-lg text-sm border',
                tab === 'search' ? 'bg-purple-500/20 border-purple-500/40 text-purple-100' : 'bg-white/5 border-white/10 text-white hover:bg-white/10',
              ].join(' ')}
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => setTab('ingest')}
              className={[
                'px-4 py-2 rounded-lg text-sm border',
                tab === 'ingest' ? 'bg-purple-500/20 border-purple-500/40 text-purple-100' : 'bg-white/5 border-white/10 text-white hover:bg-white/10',
              ].join(' ')}
            >
              Ingest
            </button>
            <button
              type="button"
              onClick={() => setTab('licenses')}
              className={[
                'px-4 py-2 rounded-lg text-sm border',
                tab === 'licenses' ? 'bg-purple-500/20 border-purple-500/40 text-purple-100' : 'bg-white/5 border-white/10 text-white hover:bg-white/10',
              ].join(' ')}
            >
              Licenses
            </button>
          </div>
        </div>

        {isOffline ? (
          <LoadState
            tone="error"
            title="Offline Mode"
            message={OFFLINE_MESSAGE}
            actionLabel="Retry"
            onAction={() => {
              if (tab === 'search' && query.trim()) {
                void runSearch()
              } else if (tab === 'licenses') {
                void loadLicenseReport()
              }
            }}
            disabled={tab === 'search' ? !query.trim() : false}
          />
        ) : null}

        {tab === 'search' ? (
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[260px]">
                <label className="text-xs text-gray-400">Query</label>
                <input
                  className="mt-1 w-full rounded-xl bg-white/10 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-purple-500/40"
                  placeholder="e.g. Daiquiri balance, shaking technique, acid adjustment"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="min-w-[180px]">
                <label className="text-xs text-gray-400">Source type</label>
                <input
                  className="mt-1 w-full rounded-xl bg-white/10 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-gray-500 outline-none"
                  placeholder="(optional)"
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value)}
                />
              </div>
              <div className="min-w-[180px]">
                <label className="text-xs text-gray-400">License</label>
                <input
                  className="mt-1 w-full rounded-xl bg-white/10 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-gray-500 outline-none"
                  placeholder="(optional)"
                  value={license}
                  onChange={(e) => setLicense(e.target.value)}
                />
              </div>
              <div className="min-w-[120px]">
                <label className="text-xs text-gray-400">Limit</label>
                <input
                  className="mt-1 w-full rounded-xl bg-white/10 border border-white/10 px-4 py-3 text-sm text-white outline-none"
                  inputMode="numeric"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={runSearch}
                disabled={searchLoading || !query.trim() || isOffline}
                className="px-5 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium disabled:opacity-60 flex items-center gap-2"
                data-testid="knowledge-search-button"
              >
                <Search className="w-4 h-4" aria-hidden="true" />
                {searchLoading ? 'Searching…' : 'Search'}
              </button>
            </div>

            {isOffline ? <p className="mt-4 text-sm text-gray-300">Knowledge actions are disabled while offline.</p> : null}
            {searchError && !isOffline ? <div className="mt-4"><LoadState tone="error" title="Search error" message={searchError} /></div> : null}
            {searchLoading ? <div className="mt-4"><LoadState tone="loading" title="Searching" message="Querying vector index." /></div> : null}
            {!searchLoading && !searchError && query.trim() && searchResults.length === 0 ? (
              <div className="mt-4">
                <LoadState tone="empty" title="No results" message="Try a different query, or ingest more knowledge first." />
              </div>
            ) : null}

            {!searchLoading && !searchError && searchResults.length ? (
              <div className="mt-6 space-y-3">
                {searchResults.map((r) => (
                  <div key={r.chunk_id} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-white font-semibold truncate">{r.title || 'Untitled'}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {[
                            r.source_type ? `type:${r.source_type}` : null,
                            r.license ? `license:${r.license}` : null,
                            typeof r.score === 'number' ? `score:${r.score.toFixed(2)}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      {r.source_url ? (
                        <a
                          href={r.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-purple-300 hover:text-purple-200"
                        >
                          Open source
                        </a>
                      ) : null}
                    </div>
                    <p className="mt-3 text-sm text-gray-200 whitespace-pre-wrap">{r.content}</p>
                    {r.citations ? (
                      <details className="mt-3">
                        <summary className="text-xs text-gray-300 cursor-pointer">Citations</summary>
                        <pre className="mt-2 text-xs text-gray-200 bg-black/40 border border-white/10 rounded-xl p-3 overflow-auto">
                          {JSON.stringify(r.citations, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'ingest' ? (
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-purple-300" aria-hidden="true" />
              <h3 className="text-lg font-semibold text-white">Ingest document</h3>
            </div>
            <p className="text-sm text-gray-400">
              Ingest content you have rights to use. If you provide a `source_url`, you must provide citations.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400">Title</label>
                  <input
                    className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Citrus balancing notes"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Source URL (optional)</label>
                  <input
                    className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                    value={ingestSourceUrl}
                    onChange={(e) => setIngestSourceUrl(e.target.value)}
                    placeholder="https://example.com/article"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400">Source type</label>
                    <input
                      className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                      value={ingestSourceType}
                      onChange={(e) => setIngestSourceType(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">License</label>
                    <input
                      className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                      value={ingestLicense}
                      onChange={(e) => setIngestLicense(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400">Chunk size</label>
                    <input
                      className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                      inputMode="numeric"
                      value={chunkSize}
                      onChange={(e) => setChunkSize(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Chunk overlap</label>
                    <input
                      className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                      inputMode="numeric"
                      value={chunkOverlap}
                      onChange={(e) => setChunkOverlap(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Content</label>
                  <textarea
                    className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500 min-h-[220px]"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Paste the licensed content here."
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400">Citations JSON (required if source_url provided)</label>
                  <textarea
                    className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-xs text-white placeholder:text-gray-500 min-h-[170px] font-mono"
                    value={citationsJson}
                    onChange={(e) => setCitationsJson(e.target.value)}
                    placeholder='[{"label":"...", "url":"...", "quote":"..."}]'
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Metadata JSON (optional)</label>
                  <textarea
                    className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-xs text-white placeholder:text-gray-500 min-h-[140px] font-mono"
                    value={metadataJson}
                    onChange={(e) => setMetadataJson(e.target.value)}
                    placeholder='{"author":"...", "edition":"..."}'
                  />
                </div>

                {ingestDisabledReason ? (
                  <div className="text-xs text-gray-400 bg-white/5 border border-white/10 rounded-xl p-3">{ingestDisabledReason}</div>
                ) : null}

                {ingestError && !isOffline ? (
                  <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-xl p-3">{ingestError}</div>
                ) : null}

                {ingestResult ? (
                  <div className="text-sm text-green-200 bg-green-500/10 border border-green-500/30 rounded-xl p-3">
                    Ingested {ingestResult.chunks} chunks. Document ID: {ingestResult.document_id}
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={runIngest}
                  disabled={ingestLoading || !!ingestDisabledReason || isOffline}
                  className="w-full px-5 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium disabled:opacity-60"
                  data-testid="knowledge-ingest-button"
                >
                  {ingestLoading ? 'Ingesting…' : 'Ingest'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'licenses' ? (
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-lg font-semibold text-white">License report</h3>
                <p className="text-sm text-gray-400 mt-1">Ensure every ingested chunk is properly labeled.</p>
              </div>
              <button
                type="button"
                onClick={loadLicenseReport}
                disabled={licenseLoading || isOffline}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white disabled:opacity-60"
                data-testid="knowledge-license-refresh"
              >
                Refresh
              </button>
            </div>

            {licenseLoading ? <div className="mt-4"><LoadState tone="loading" title="Loading license report" message="Aggregating by license." /></div> : null}
            {licenseError && !isOffline ? <div className="mt-4"><LoadState tone="error" title="License report error" message={licenseError} actionLabel="Retry" onAction={loadLicenseReport} /></div> : null}
            {!licenseLoading && !licenseError && licenseReport ? (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-white font-semibold">By license</p>
                  <div className="mt-3 space-y-2">
                    {Object.entries(licenseReport.by_license || {}).length === 0 ? (
                      <p className="text-sm text-gray-400">No labeled content yet.</p>
                    ) : null}
                    {Object.entries(licenseReport.by_license || {}).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-4">
                        <p className="text-sm text-gray-200">{k}</p>
                        <p className="text-xs text-gray-400">{v}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-white font-semibold">Missing license</p>
                  <p className="text-3xl font-bold text-pink-300 mt-2">{licenseReport.missing}</p>
                  <p className="text-sm text-gray-400 mt-2">Chunks without a license label.</p>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
