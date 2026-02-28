export function PlaceholderView({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-8">
      <div className="max-w-5xl mx-auto">
        <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-8">
          <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
          <p className="text-gray-400">{description}</p>
        </div>
      </div>
    </div>
  )
}

