import { useEffect, useState, type FormEvent } from 'react'
import {
  fetchMyTickets,
  fetchTicketReplies,
  openTicket,
  replyToTicketAsUser,
  markTicketResolved,
  type SupportTicket,
  type TicketReply,
} from '@/services/support'

const STATUS_LABEL: Record<SupportTicket['status'], { text: string; className: string }> = {
  open: { text: 'খোলা', className: 'bg-signal-amber/15 text-signal-amber' },
  in_progress: { text: 'দেখা হচ্ছে', className: 'bg-brand-100 text-brand-700' },
  resolved: { text: 'সমাধান হয়েছে', className: 'bg-signal-green/15 text-signal-green' },
}

export default function Support() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  function load() {
    setLoading(true)
    fetchMyTickets().then((rows) => {
      setTickets(rows)
      setLoading(false)
    })
  }

  useEffect(load, [])

  const selected = tickets.find((t) => t.id === selectedId)

  if (loading) return <p className="text-sm text-ink/50">লোড হচ্ছে…</p>

  if (selected) {
    return (
      <TicketThread
        ticket={selected}
        onBack={() => {
          setSelectedId(null)
          load()
        }}
      />
    )
  }

  if (creating) {
    return (
      <NewTicketForm
        onCreated={(ticket) => {
          setCreating(false)
          setTickets((prev) => [ticket, ...prev])
          setSelectedId(ticket.id)
        }}
        onCancel={() => setCreating(false)}
      />
    )
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Support</h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-card bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          নতুন Ticket
        </button>
      </div>

      {tickets.length === 0 ? (
        <p className="rounded-card border border-ink/10 bg-ink/[0.02] p-6 text-center text-sm text-ink/50">
          এখনো কোনো ticket নেই। কোনো সমস্যা হলে "নতুন Ticket" চাপো।
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {tickets.map((ticket) => (
            <button
              key={ticket.id}
              onClick={() => setSelectedId(ticket.id)}
              className="flex items-center justify-between rounded-card border border-ink/10 bg-white p-3 text-left hover:border-brand-300"
            >
              <div>
                <p className="font-medium">{ticket.subject}</p>
                <p className="text-xs text-ink/40">{new Date(ticket.updatedAt).toLocaleString('bn-BD')}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_LABEL[ticket.status].className}`}>
                {STATUS_LABEL[ticket.status].text}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function NewTicketForm({ onCreated, onCancel }: { onCreated: (t: SupportTicket) => void; onCancel: () => void }) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const ticket = await openTicket(subject, message)
      onCreated(ticket)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ticket খোলা যায়নি।')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-xl font-semibold">নতুন Support Ticket</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm text-ink/70">বিষয় *</label>
          <input
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-card border border-ink/15 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-ink/70">বিস্তারিত লেখো *</label>
          <textarea
            required
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full rounded-card border border-ink/15 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
        {error && <p className="text-sm text-signal-red">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-card bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {submitting ? 'পাঠানো হচ্ছে…' : 'জমা দাও'}
          </button>
          <button type="button" onClick={onCancel} className="text-sm text-ink/50 underline">
            বাতিল
          </button>
        </div>
      </form>
    </div>
  )
}

function TicketThread({ ticket, onBack }: { ticket: SupportTicket; onBack: () => void }) {
  const [replies, setReplies] = useState<TicketReply[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  function load() {
    fetchTicketReplies(ticket.id).then((rows) => {
      setReplies(rows)
      setLoading(false)
    })
  }

  useEffect(load, [ticket.id])

  async function handleSend() {
    if (!message.trim()) return
    setSending(true)
    try {
      await replyToTicketAsUser(ticket.id, message)
      setMessage('')
      load()
    } finally {
      setSending(false)
    }
  }

  async function handleResolve() {
    await markTicketResolved(ticket.id)
    onBack()
  }

  return (
    <div className="mx-auto max-w-lg">
      <button onClick={onBack} className="mb-4 text-sm text-ink/50 underline">
        ← সব Ticket
      </button>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">{ticket.subject}</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_LABEL[ticket.status].className}`}>
          {STATUS_LABEL[ticket.status].text}
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-ink/50">লোড হচ্ছে…</p>
      ) : (
        <div className="mb-4 flex flex-col gap-3">
          {replies.map((reply) => (
            <div
              key={reply.id}
              className={`max-w-[80%] rounded-card p-3 text-sm ${
                reply.senderType === 'admin' ? 'bg-brand-100 text-brand-900' : 'ml-auto bg-ink/5 text-ink/80'
              }`}
            >
              <p className="mb-1 text-xs font-medium opacity-60">{reply.senderType === 'admin' ? 'Support' : 'তুমি'}</p>
              <p className="whitespace-pre-wrap">{reply.message}</p>
              <p className="mt-1 text-xs opacity-40">{new Date(reply.createdAt).toLocaleString('bn-BD')}</p>
            </div>
          ))}
        </div>
      )}

      {ticket.status !== 'resolved' && (
        <>
          <div className="flex gap-2">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              placeholder="উত্তর লেখো…"
              className="flex-1 rounded-card border border-ink/15 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !message.trim()}
              className="rounded-card bg-brand-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              পাঠাও
            </button>
          </div>
          <button type="button" onClick={handleResolve} className="mt-3 text-sm text-ink/50 underline">
            এই সমস্যা সমাধান হয়ে গেছে, বন্ধ করো
          </button>
        </>
      )}
    </div>
  )
}
