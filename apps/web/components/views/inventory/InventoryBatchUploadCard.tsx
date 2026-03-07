import { useMemo, useState } from 'react'

import { apiJson } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type BatchUploadResponse = {
  filename: string
  applied: boolean
  summary: {
    total_rows: number
    ready_rows: number
    partial_rows: number
    duplicate_rows: number
    importable_rows: number
    skipped_rows: number
    pending_review_rows: number
    created_ingredients: number
    reused_ingredients: number
    created_items: number
    reused_items: number
    created_lots: number
  }
  lookup_telemetry: {
    cache_hits: number
    cache_misses: number
    cocktaildb_requests: number
    cocktaildb_failures: number
    openai_requests: number
    openai_failures: number
    openai_input_tokens: number
    openai_output_tokens: number
    openai_total_tokens: number
  }
  rows: Array<{
    row_number: number
    source_name: string
    status: 'ready' | 'partial' | 'duplicate' | 'skipped'
    import_action: string
    confidence?: number | null
    notes: string[]
    missing_fields: string[]
    import_result?: string | null
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
  }>
}

type InventoryBatchUploadCardProps = {
  disabled?: boolean
  onImported?: () => Promise<void> | void
}

const STATUS_STYLES: Record<string, string> = {
  ready: 'bg-emerald-500/15 border-emerald-400/30 text-emerald-100',
  partial: 'bg-amber-500/15 border-amber-400/30 text-amber-100',
  duplicate: 'bg-white/10 border-white/10 text-gray-100',
  skipped: 'bg-red-500/15 border-red-400/30 text-red-100',
}

export function InventoryBatchUploadCard({ disabled = false, onImported }: InventoryBatchUploadCardProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [pastedContent, setPastedContent] = useState('')
  const [preview, setPreview] = useState<BatchUploadResponse | null>(null)
  const [requestPayload, setRequestPayload] = useState<{ filename: string; content: string } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const importableCount = preview?.summary.importable_rows ?? 0
  const helperCopy = useMemo(() => {
    if (selectedFile) return `Ready to process ${selectedFile.name}.`
    if (pastedContent.trim()) return 'Ready to process pasted ingredient text.'
    return 'Upload a CSV/TSV/TXT file or paste one ingredient per line.'
  }, [pastedContent, selectedFile])

  const buildPayload = async (): Promise<{ filename: string; content: string }> => {
    if (selectedFile) {
      return { filename: selectedFile.name, content: await selectedFile.text() }
    }
    const trimmed = pastedContent.trim()
    if (!trimmed) throw new Error('Choose a file or paste ingredient lines before previewing.')
    return { filename: 'pasted-ingredients.txt', content: trimmed }
  }

  const previewUpload = async () => {
    setPreviewing(true)
    setError('')
    setSuccess('')
    try {
      const payload = await buildPayload()
      setRequestPayload(payload)
      const response = await apiJson<BatchUploadResponse>('/v1/inventory/batch-upload/preview', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setPreview(response)
    } catch (err) {
      setPreview(null)
      setRequestPayload(null)
      setError(err instanceof Error ? err.message : 'Failed to preview the batch upload.')
    } finally {
      setPreviewing(false)
    }
  }

  const importUpload = async () => {
    if (!requestPayload) {
      setError('Preview the upload before importing it.')
      return
    }
    setImporting(true)
    setError('')
    setSuccess('')
    try {
      const response = await apiJson<BatchUploadResponse>('/v1/inventory/batch-upload/import', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })
      setPreview(response)
      const pendingReviewCopy = response.summary.pending_review_rows
        ? ` ${response.summary.pending_review_rows} row(s) were queued for admin ontology review.`
        : ''
      setSuccess(`Imported ${response.summary.created_items} new inventory item(s) and ${response.summary.created_lots} lot(s).${pendingReviewCopy}`)
      if (onImported) await onImported()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import the batch upload.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-white">AI Batch Upload</h3>
          <p className="text-sm text-gray-400 mt-1">
            Upload an ingredient list and let BartenderAI fill missing inventory details from approved online sources before import.
          </p>
        </div>
        <div className="text-xs text-gray-500 max-w-sm">Supports headered CSV/TSV plus plain-text lists with one ingredient per line.</div>
      </div>

      <div className="mt-5 grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-6">
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <label className="block text-sm font-medium text-white">Upload file</label>
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/plain,text/csv"
              className="mt-3 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-200 file:mr-4 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:text-white hover:file:bg-white/20"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              disabled={disabled || previewing || importing}
            />
            <p className="mt-3 text-xs text-gray-500">{helperCopy}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <label className="block text-sm font-medium text-white">Or paste list</label>
            <textarea
              className="mt-3 min-h-[150px] w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white placeholder:text-gray-500"
              placeholder={'Example:\nLondon Dry Gin\nCampari\nFresh Lime Juice'}
              value={pastedContent}
              onChange={(event) => setPastedContent(event.target.value)}
              disabled={disabled || previewing || importing}
            />
            <p className="mt-3 text-xs text-gray-500">
              Use headers like <span className="font-mono">name,category,unit,quantity</span> when you want to pre-fill fields.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={previewUpload}
              disabled={disabled || previewing || importing}
              className="px-5 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-medium disabled:opacity-60"
            >
              {previewing ? 'Previewing…' : 'Preview Upload'}
            </button>
            <button
              type="button"
              onClick={importUpload}
              disabled={disabled || previewing || importing || !preview || importableCount === 0}
              className="px-5 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium disabled:opacity-60"
            >
              {importing ? 'Importing…' : `Import ${importableCount || ''}`.trim()}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedFile(null)
                setPastedContent('')
                setPreview(null)
                setRequestPayload(null)
                setError('')
                setSuccess('')
              }}
              disabled={previewing || importing}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white disabled:opacity-60"
            >
              Clear
            </button>
          </div>

          {previewing ? (
            <LoadState tone="loading" title="Previewing upload" message="Parsing rows and filling missing ingredient details." />
          ) : null}
          {error ? <LoadState tone="error" title="Batch upload error" message={error} /> : null}
          {success ? <LoadState tone="success" title="Batch upload complete" message={success} /> : null}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-white">What happens on import</h4>
          <ul className="space-y-2 text-sm text-gray-300 list-disc pl-5">
            <li>Existing ingredients are reused and lightly backfilled when safe.</li>
            <li>Missing metadata is filled from TheCocktailDB first, then AI web lookup if still incomplete.</li>
            <li>Existing inventory items are reused when the upload matches one you already track.</li>
            <li>Rows with quantity create lots; rows without quantity create or reuse the base inventory item only.</li>
          </ul>
          <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-gray-400">
            To keep the flow reviewable, each preview is capped at 25 rows and 50k characters.
          </div>
        </div>
      </div>

      {preview ? (
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <SummaryCard label="Rows" value={preview.summary.total_rows} />
            <SummaryCard label="Ready" value={preview.summary.ready_rows} />
            <SummaryCard label="Partial" value={preview.summary.partial_rows} />
            <SummaryCard label="Duplicates" value={preview.summary.duplicate_rows} />
            <SummaryCard label="Importable" value={preview.summary.importable_rows} />
            <SummaryCard label="Pending Review" value={preview.summary.pending_review_rows} muted={preview.summary.pending_review_rows === 0} />
            <SummaryCard label="Lots" value={preview.summary.created_lots} muted={!preview.applied} />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Lookup Telemetry</p>
                <p className="mt-2 text-sm text-gray-300">
                  cache {preview.lookup_telemetry.cache_hits} hit / {preview.lookup_telemetry.cache_misses} miss · CocktailDB {preview.lookup_telemetry.cocktaildb_requests} request
                  {preview.lookup_telemetry.cocktaildb_requests === 1 ? '' : 's'} · OpenAI {preview.lookup_telemetry.openai_requests} request
                  {preview.lookup_telemetry.openai_requests === 1 ? '' : 's'}
                </p>
              </div>
              <div className="text-sm text-gray-400">
                tokens {preview.lookup_telemetry.openai_total_tokens}
                {preview.lookup_telemetry.openai_failures || preview.lookup_telemetry.cocktaildb_failures
                  ? ` · failures ${preview.lookup_telemetry.openai_failures + preview.lookup_telemetry.cocktaildb_failures}`
                  : ''}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 overflow-hidden">
            <div className="grid grid-cols-[72px_1.3fr_1.2fr_0.8fr] gap-4 px-4 py-3 bg-white/5 text-xs uppercase tracking-[0.2em] text-gray-400">
              <div>Row</div>
              <div>Source / Resolved</div>
              <div>Details</div>
              <div>Status</div>
            </div>
            <div className="divide-y divide-white/10 max-h-[520px] overflow-y-auto">
              {preview.rows.map((row) => (
                <div key={`${row.row_number}-${row.source_name}`} className="grid grid-cols-[72px_1.3fr_1.2fr_0.8fr] gap-4 px-4 py-4 bg-black/20">
                  <div className="text-sm text-gray-400">#{row.row_number}</div>
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Source</p>
                      <p className="text-sm text-gray-300">{row.source_name}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Resolved</p>
                      <p className="text-base font-semibold text-white">{row.resolved.canonical_name}</p>
                      {row.resolved.display_name ? <p className="text-xs text-gray-500">Display: {row.resolved.display_name}</p> : null}
                    </div>
                    {row.source_refs.length ? (
                      <div className="flex flex-wrap gap-2">
                        {row.source_refs.slice(0, 3).map((ref) => (
                          <a
                            key={`${row.row_number}-${ref.label}-${ref.url || 'label'}`}
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
                  <div className="space-y-2 text-sm text-gray-300">
                    <p>
                      {row.resolved.category || 'Uncategorized'}
                      {row.resolved.subcategory ? ` · ${row.resolved.subcategory}` : ''}
                    </p>
                    <p>
                      unit <span className="text-white font-medium">{row.resolved.unit}</span>
                      {row.resolved.quantity != null ? ` · qty ${row.resolved.quantity} ${row.resolved.lot_unit || row.resolved.unit}` : ''}
                    </p>
                    <p>
                      {row.resolved.is_alcoholic ? 'alcoholic' : 'non-alcoholic'}
                      {row.resolved.abv != null ? ` · ${row.resolved.abv}% ABV` : ''}
                      {row.resolved.is_perishable ? ' · perishable' : ''}
                    </p>
                    {row.resolved.description ? <p className="text-xs text-gray-500">{row.resolved.description}</p> : null}
                    {row.notes.length ? <p className="text-xs text-amber-100">{row.notes.join(' ')}</p> : null}
                    {row.missing_fields.length ? (
                      <p className="text-xs text-gray-500">Still missing: {row.missing_fields.join(', ')}</p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[row.status] || STATUS_STYLES.partial}`}>
                      {row.status}
                    </span>
                    <p className="text-xs text-gray-400">{row.import_action.replaceAll('_', ' ')}</p>
                    {typeof row.confidence === 'number' ? (
                      <p className="text-xs text-gray-500">confidence {Math.round(row.confidence * 100)}%</p>
                    ) : null}
                    {row.import_result ? <p className="text-xs text-emerald-200">{row.import_result}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SummaryCard({ label, value, muted = false }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.2em] text-gray-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${muted ? 'text-gray-500' : 'text-white'}`}>{value}</p>
    </div>
  )
}
