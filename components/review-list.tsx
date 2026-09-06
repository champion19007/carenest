'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Star } from 'lucide-react'
import { submitReview, type ReviewState } from '@/app/actions/care'
import type { ReviewDoc } from '@/lib/db/docs'

export function ReviewList({
  doctorSlug,
  doctorName,
  reviews,
  canReview,
}: {
  doctorSlug: string
  doctorName: string
  reviews: ReviewDoc[]
  canReview: boolean
}) {
  const [state, action] = useActionState(submitReview, {} as ReviewState)
  const [rating, setRating] = useState(0)
  const [open, setOpen] = useState(false)

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl">Patient reviews</h2>
        {canReview && !state.ok && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="inline-flex min-h-10 items-center rounded-lg border border-border px-4 text-sm font-semibold hover:border-primary"
          >
            {open ? 'Cancel' : 'Write a review'}
          </button>
        )}
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        Reviews are only accepted from signed-in patients, and each person can review a doctor
        once. Providers cannot edit or remove them.
      </p>

      {!canReview && (
        <p className="mt-4 rounded-lg bg-soft px-4 py-3 text-sm text-primary">
          <Link href={`/sign-in?next=/doctor/${doctorSlug}`} className="font-semibold underline">
            Log in
          </Link>{' '}
          to leave a review for {doctorName}.
        </p>
      )}

      {state.ok && (
        <p role="status" className="mt-4 rounded-lg bg-success/10 px-4 py-3 text-sm text-success">
          Thank you — your review has been published.
        </p>
      )}

      {open && canReview && !state.ok && (
        <form action={action} className="mt-5 space-y-4 rounded-lg border border-border p-5">
          <input type="hidden" name="slug" value={doctorSlug} />
          <input type="hidden" name="rating" value={rating} />

          <fieldset>
            <legend className="font-semibold">Your rating</legend>
            <div className="mt-2 flex gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  aria-label={`${value} out of 5`}
                  aria-pressed={rating === value}
                  className="rounded p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={`size-7 ${
                      value <= rating ? 'fill-accent text-accent' : 'text-muted-foreground'
                    }`}
                  />
                </button>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="font-semibold">What was your experience?</span>
            <textarea
              name="comment"
              rows={4}
              required
              minLength={10}
              maxLength={1000}
              placeholder="Was the doctor easy to understand? Did the appointment start near its time?"
              className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          {state.error && (
            <p role="alert" className="rounded-lg bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
              {state.error}
            </p>
          )}

          <Submit />
        </form>
      )}

      <div className="mt-6 divide-y divide-border">
        {reviews.map((review) => (
          <article key={review._id} className="py-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold">{review.authorName}</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-accent/15 px-2 py-0.5 text-sm font-bold text-warning">
                <Star className="size-3.5 fill-current" />
                {review.rating}
              </span>
              {review.createdAt && (
                <span className="text-sm text-muted-foreground">
                  {new Date(review.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              )}
            </div>
            <p className="mt-2 leading-7 text-muted-foreground">{review.comment}</p>
          </article>
        ))}

        {reviews.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">
            No reviews yet. If you have seen {doctorName}, yours would be the first.
          </p>
        )}
      </div>
    </section>
  )
}

function Submit() {
  const status = useFormStatus()
  return (
    <button
      type="submit"
      disabled={status.pending}
      className="min-h-12 rounded-lg bg-cta px-6 font-semibold text-cta-foreground disabled:opacity-60"
    >
      {status.pending ? 'Publishing…' : 'Publish review'}
    </button>
  )
}
