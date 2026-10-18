import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchReviews,
  fetchMyReview,
  fetchMyDisplayName,
  submitReview,
  deleteMyReview,
} from '@/services/community'
import { useAuth } from '@/context/AuthContext'
import type { Review } from '@/types'

const STARS = [1, 2, 3, 4, 5]

export default function ReviewSection({ appId }: { appId: string }) {
  const { session } = useAuth()
  const [reviews, setReviews] = useState<Review[]>([])
  const [myReview, setMyReview] = useState<Review | null>(null)
  const [loading, setLoading] = useState(true)

  const [editing, setEditing] = useState(false)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    Promise.all([
      fetchReviews(appId),
      session ? fetchMyReview(appId) : Promise.resolve(null),
      session ? fetchMyDisplayName() : Promise.resolve(null),
    ]).then(([allReviews, mine, name]) => {
      setReviews(allReviews)
      setMyReview(mine)
      // Always set (not just when `mine` exists) — AppDetails/ReviewSection
      // stays mounted across client-side navigation between two different
      // apps' pages (only the :slug param changes), so without this reset,
      // navigating from an app you'd rated 4★ with a comment to one you've
      // never reviewed left the form showing that old rating/comment as if
      // it applied to the new app.
      setRating(mine?.rating ?? 5)
      setComment(mine?.comment ?? '')
      setDisplayName(name ?? '')
      setLoading(false)
    })
  }

  // Same cross-app-navigation reasoning — an editing form left open on one
  // app shouldn't still be open when the slug changes underneath it.
  useEffect(() => setEditing(false), [appId])
  useEffect(load, [appId, session])

  async function handleSubmit() {
    setError(null)
    if (!displayName.trim()) {
      setError('তোমার নাম দাও — এটাই review-এর পাশে দেখানো হবে।')
      return
    }
    setSubmitting(true)
    try {
      await submitReview({ appId, rating, comment, displayName })
      setEditing(false)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review জমা দেওয়া যায়নি।')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    setSubmitting(true)
    try {
      await deleteMyReview(appId)
      setMyReview(null)
      setEditing(false)
      setComment('')
      setRating(5)
      load()
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <p className="text-sm text-ink/50">Review লোড হচ্ছে…</p>

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Reviews ({reviews.length})</h2>

      {!session && (
        <p className="mb-4 rounded-card border border-ink/10 bg-ink/[0.02] p-3 text-sm text-ink/60">
          <Link to="/login" state={{ from: window.location.pathname }} className="text-brand-600 underline">
            লগইন
          </Link>{' '}
          করে একটা review লিখো।
        </p>
      )}

      {session && !editing && (
        <div className="mb-4">
          {myReview ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-sm text-brand-600 underline"
            >
              তোমার review-টা এডিট করো
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-card bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              একটা review লিখো
            </button>
          )}
        </div>
      )}

      {session && editing && (
        <div className="mb-6 rounded-card border border-ink/10 bg-white p-4">
          <div className="mb-3 flex gap-1">
            {STARS.map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                className={`text-2xl ${star <= rating ? 'text-signal-amber' : 'text-ink/20'}`}
                aria-label={`${star} star`}
              >
                ★
              </button>
            ))}
          </div>

          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="তোমার নাম (review-এর পাশে দেখানো হবে)"
            className="mb-2 w-full rounded-card border border-ink/15 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="app-টা কেমন লাগলো লিখো (ঐচ্ছিক)"
            rows={3}
            className="mb-2 w-full rounded-card border border-ink/15 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />

          {error && <p className="mb-2 text-sm text-signal-red">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-card bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {submitting ? 'জমা হচ্ছে…' : 'জমা দাও'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-card border border-ink/15 px-4 py-2 text-sm text-ink/70"
            >
              বাতিল
            </button>
            {myReview && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitting}
                className="ml-auto text-sm text-signal-red underline disabled:opacity-50"
              >
                Review মুছে ফেলো
              </button>
            )}
          </div>
        </div>
      )}

      {reviews.length === 0 ? (
        <p className="text-sm text-ink/50">এখনো কোনো review নেই — প্রথম review তোমারই হতে পারে।</p>
      ) : (
        <div className="flex flex-col gap-3">
          {reviews.map((review) => (
            <div key={review.id} className="rounded-card border border-ink/10 bg-white p-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="font-medium">{review.userName}</p>
                <p className="text-xs text-ink/40">{new Date(review.createdAt).toLocaleDateString('bn-BD')}</p>
              </div>
              <p className="mb-1 text-signal-amber">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</p>
              {review.comment && <p className="text-sm text-ink/80">{review.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
