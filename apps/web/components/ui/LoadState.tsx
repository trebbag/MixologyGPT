type LoadStateProps = {
  title: string
  message: string
  tone?: 'loading' | 'empty' | 'error' | 'success'
  actionLabel?: string
  onAction?: () => void
  disabled?: boolean
}

export function LoadState({
  title,
  message,
  tone = 'loading',
  actionLabel,
  onAction,
  disabled = false,
}: LoadStateProps) {
  const palette = (() => {
    if (tone === 'error') return { border: 'border-red-500/30', bg: 'bg-red-500/10', title: 'text-red-100' }
    if (tone === 'success') return { border: 'border-green-500/30', bg: 'bg-green-500/10', title: 'text-green-100' }
    if (tone === 'empty') return { border: 'border-white/10', bg: 'bg-white/5', title: 'text-white' }
    return { border: 'border-blue-500/30', bg: 'bg-blue-500/10', title: 'text-blue-100' }
  })()
  return (
    <div
      className={`rounded-xl border ${palette.border} ${palette.bg} backdrop-blur-xl p-5`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <h3 className={`text-base font-semibold ${palette.title}`}>{title}</h3>
      <p className="mt-1 text-sm text-gray-300">{message}</p>
      {actionLabel && onAction && (
        <button
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onAction}
          type="button"
          disabled={disabled}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
