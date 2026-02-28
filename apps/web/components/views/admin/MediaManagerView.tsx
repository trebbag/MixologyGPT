import { useCallback, useEffect, useMemo, useState } from 'react'

import { API_BASE_URL, apiFetch, apiJson } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type MediaAsset = {
  id: string
  url: string
  media_type: string
  metadata?: Record<string, any> | null
}

function filenameFor(asset: MediaAsset): string {
  const meta = asset.metadata ?? {}
  const raw = typeof meta.filename === 'string' ? meta.filename : ''
  if (raw.trim()) return raw
  return `${asset.id}`
}

export function MediaManagerView() {
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [file, setFile] = useState<File | null>(null)
  const [mediaType, setMediaType] = useState('image')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const [previewId, setPreviewId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiJson<MediaAsset[]>('/v1/media')
      setAssets(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load media assets.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const revokePreview = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setPreviewId(null)
  }, [previewUrl])

  useEffect(() => {
    return () => revokePreview()
  }, [revokePreview])

  const upload = async () => {
    setUploading(true)
    setUploadError('')
    try {
      if (!file) throw new Error('Choose a file to upload.')
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('Failed to read file.'))
        reader.onload = () => {
          const value = typeof reader.result === 'string' ? reader.result : ''
          const idx = value.indexOf('base64,')
          if (idx === -1) {
            reject(new Error('Unexpected FileReader result.'))
            return
          }
          resolve(value.slice(idx + 'base64,'.length))
        }
        reader.readAsDataURL(file)
      })

      await apiJson('/v1/media/upload', {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type || 'application/octet-stream',
          data_base64: dataBase64,
          media_type: mediaType,
        }),
      })
      setFile(null)
      await load()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const download = async (asset: MediaAsset) => {
    const res = await apiFetch(asset.url, { method: 'GET' })
    if (!res.ok) throw new Error('Download failed.')
    const blob = await res.blob()
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = filenameFor(asset)
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(href)
  }

  const preview = async (asset: MediaAsset) => {
    setPreviewError('')
    revokePreview()
    try {
      const res = await apiFetch(asset.url, { method: 'GET' })
      if (!res.ok) throw new Error('Preview fetch failed.')
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      setPreviewUrl(href)
      setPreviewId(asset.id)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Preview failed.')
    }
  }

  const baseUrl = useMemo(() => API_BASE_URL.replace(/\/$/, ''), [])

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-white">Media Manager</h2>
            <p className="text-sm text-gray-400 mt-1">
              Upload images or assets used in recipes, studio sessions, and share cards.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white"
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        {loading ? <LoadState tone="loading" title="Loading media" message="Fetching media assets." /> : null}
        {error ? <LoadState tone="error" title="Media error" message={error} actionLabel="Retry" onAction={load} /> : null}
        {uploadError ? <LoadState tone="error" title="Upload error" message={uploadError} /> : null}
        {previewError ? <LoadState tone="error" title="Preview error" message={previewError} /> : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Upload</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-300 mb-2">Media Type</label>
                <select
                  className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                  value={mediaType}
                  onChange={(e) => setMediaType(e.target.value)}
                >
                  <option value="image">image</option>
                  <option value="file">file</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">File</label>
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-300 file:mr-4 file:rounded-lg file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-white/20"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Uploaded files are stored server-side. Preview and download are proxied through authenticated API calls.
                </p>
              </div>
              <button
                type="button"
                onClick={upload}
                className="px-5 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium disabled:opacity-60"
                disabled={uploading || !file}
              >
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </div>

          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Preview</h3>
            {!previewUrl ? (
              <LoadState
                tone="empty"
                title="No preview"
                message="Select an asset and click Preview to render it here."
              />
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-gray-300 break-all">asset: {previewId}</p>
                  <button
                    type="button"
                    onClick={revokePreview}
                    className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white"
                  >
                    Close
                  </button>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="asset preview" className="max-h-[340px] w-auto mx-auto rounded-lg" />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white">Assets</h3>
          {!loading && !error && assets.length === 0 ? (
            <LoadState tone="empty" title="No assets yet" message="Upload an image or file to get started." />
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {assets.map((asset) => {
              const meta = asset.metadata ?? {}
              const sizeBytes = typeof meta.size_bytes === 'number' ? meta.size_bytes : null
              const contentType = typeof meta.content_type === 'string' ? meta.content_type : ''
              return (
                <div key={asset.id} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                  <div>
                    <p className="text-white font-semibold break-all">{filenameFor(asset)}</p>
                    <p className="text-xs text-gray-500 break-all">{asset.id}</p>
                  </div>
                  <div className="text-xs text-gray-400 space-y-1">
                    <div>type: {asset.media_type}</div>
                    <div>content-type: {contentType || '—'}</div>
                    <div>url: {baseUrl}{asset.url}</div>
                    {sizeBytes != null ? <div>size: {Math.round(sizeBytes / 1024)} KB</div> : null}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => preview(asset)}
                      className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white"
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => void download(asset)}
                      className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white"
                    >
                      Download
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
