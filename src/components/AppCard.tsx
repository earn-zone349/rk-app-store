import { Link } from 'react-router-dom'
import type { AppListing } from '@/types'

export default function AppCard({ app }: { app: AppListing }) {
  return (
    <Link
      to={`/app/${app.slug}`}
      className="group flex flex-col gap-2 rounded-card border border-ink/10 bg-white p-3 transition hover:border-brand-500 hover:shadow-sm"
    >
      <div className="aspect-square w-full overflow-hidden rounded-card bg-ink/5">
        <img
          src={app.iconUrl}
          alt={`${app.name} icon`}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.visibility = 'hidden'
          }}
        />
      </div>
      <div>
        <h3 className="truncate font-medium text-ink group-hover:text-brand-700">
          {app.name}
        </h3>
        <p className="flex items-center gap-1 text-xs text-ink/60">
          <span>⭐ {app.rating.toFixed(1)}</span>
          <span aria-hidden>·</span>
          <span>{app.downloadCount.toLocaleString()} downloads</span>
        </p>
      </div>
    </Link>
  )
}
