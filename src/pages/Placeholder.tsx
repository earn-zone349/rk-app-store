/**
 * Generic placeholder for pages scheduled in later phases of the roadmap
 * (developer dashboard, admin panel, legal pages, etc.). Swap each route
 * for a real page as that phase is built — this keeps every link in the
 * app working from day one instead of 404ing.
 */
export default function Placeholder({ title, note }: { title: string; note?: string }) {
  return (
    <div className="rounded-card border border-dashed border-ink/20 p-8 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-ink/50">
        {note ?? 'This section is planned for a later development phase.'}
      </p>
    </div>
  )
}
