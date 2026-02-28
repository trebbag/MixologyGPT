import type { GetServerSideProps } from 'next'
import Link from 'next/link'

type SharedPayload = {
  slug: string
  payload: {
    recipe?: {
      name?: string
      ingredients?: Array<{ name: string; quantity: number; unit: string }>
      instructions?: string[]
      glassware?: string
      ice_style?: string
    }
    metrics?: Record<string, number>
    version?: number
    [key: string]: unknown
  }
}

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

type SharePageProps = {
  data: SharedPayload | null
  error: string | null
}

export const getServerSideProps: GetServerSideProps<SharePageProps> = async (ctx) => {
  const slug = typeof ctx.params?.slug === 'string' ? ctx.params.slug : ''
  if (!slug) {
    return { props: { data: null, error: 'Share not found.' } }
  }

  try {
    const res = await fetch(`${apiUrl}/v1/studio/share/${encodeURIComponent(slug)}`, {
      headers: { accept: 'application/json' },
    })
    if (!res.ok) {
      return { props: { data: null, error: 'Share not found.' } }
    }
    const payload = (await res.json()) as SharedPayload
    return { props: { data: payload, error: null } }
  } catch {
    return { props: { data: null, error: 'Unable to reach the server.' } }
  }
}

export default function ShareView({ data, error }: SharePageProps) {
  const recipe = data?.payload?.recipe
  const ingredients = recipe?.ingredients ?? []
  const instructions = recipe?.instructions ?? []

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between gap-6 flex-wrap">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">BartenderAI</p>
            <h1 className="text-2xl font-bold text-white">Shared Studio Snapshot</h1>
          </div>
          <Link href="/" className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white">
            Open App
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {error ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 backdrop-blur-xl p-6">
            <p className="text-red-100 font-semibold">Not available</p>
            <p className="text-red-200 text-sm mt-1">{error}</p>
          </div>
        ) : null}

        {!error && data ? (
          <>
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-8">
              <p className="text-xs text-gray-400">Share id</p>
              <p className="text-sm text-gray-300 break-all">{data.slug}</p>
              <h2 className="mt-4 text-3xl font-bold text-white">
                {recipe?.name || 'Untitled Recipe'}
              </h2>
              <div className="mt-4 flex items-center gap-2 flex-wrap text-xs text-gray-300">
                {data.payload.version ? (
                  <span className="px-2 py-1 rounded bg-white/10 border border-white/10">v{data.payload.version}</span>
                ) : null}
                {recipe?.glassware ? (
                  <span className="px-2 py-1 rounded bg-white/10 border border-white/10">glassware: {recipe.glassware}</span>
                ) : null}
                {recipe?.ice_style ? (
                  <span className="px-2 py-1 rounded bg-white/10 border border-white/10">ice: {recipe.ice_style}</span>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
                <h3 className="text-lg font-semibold text-white">Ingredients</h3>
                <div className="mt-4 space-y-2">
                  {ingredients.length === 0 ? (
                    <p className="text-sm text-gray-400">No ingredient list in this snapshot.</p>
                  ) : (
                    ingredients.map((ing, idx) => (
                      <div key={`${idx}`} className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <p className="text-white font-medium">
                          {ing.quantity} {ing.unit} {ing.name}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
                <h3 className="text-lg font-semibold text-white">Instructions</h3>
                <div className="mt-4 space-y-3">
                  {instructions.length === 0 ? (
                    <p className="text-sm text-gray-400">No instructions in this snapshot.</p>
                  ) : (
                    <ol className="space-y-2 list-decimal list-inside text-gray-200">
                      {instructions.map((step, idx) => (
                        <li key={`${idx}`} className="rounded-xl border border-white/10 bg-white/5 p-4">
                          {step}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
              <h3 className="text-lg font-semibold text-white">Balance Metrics</h3>
              <div className="mt-4">
                {!data.payload.metrics ? (
                  <p className="text-sm text-gray-400">No metrics available for this snapshot.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.entries(data.payload.metrics).map(([key, value]) => (
                      <div key={key} className="rounded-xl border border-white/10 bg-white/5 p-4 flex items-center justify-between">
                        <p className="text-sm text-gray-300">{key}</p>
                        <p className="text-sm text-white font-semibold">{Number(value).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <details className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
              <summary className="text-white font-semibold cursor-pointer">Raw Snapshot</summary>
              <pre className="mt-4 text-xs text-gray-200 bg-black/30 border border-white/10 rounded-xl p-4 overflow-auto">
                {JSON.stringify(data.payload, null, 2)}
              </pre>
            </details>
          </>
        ) : null}
      </main>
    </div>
  )
}
