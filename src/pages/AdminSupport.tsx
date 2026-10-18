import { useEffect, useState } from 'react'
import {
  fetchAllTickets,
  replyToTicketAsAdmin,
  updateTicketStatus,
  type AdminTicketRow,
} from '@/services/admin'
import { fetchTicketReplies, type TicketReply } from '@/services/support'

const STATUS_LABEL: Record<AdminTicketRow['status'], { text: string; className: string }> = {
  open: { text: 'খোলা', className: 'bg-signal-amber/15 text-signal-amber' },
  in_progress: { text: 'দেখা হচ্ছে', className: 'bg-brand-100 text-brand-700' },
  resolved: { text: 'সমাধান হয়েছে', className: 'bg-signal-green/15 text-signal-green' },
}

export default function AdminSupport() {
  const [tickets, setTickets] = useState<AdminTicketRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showResolved, setShowResolved] = useState(false)

  function load() {
    setLoading(true)
    fetchAllTickets().then((rows) => {
      setTickets(rows)
      setLoading(false)
    })
  }

  useEffect(load, [])

  const selected = tickets.find((t) => t.id === selectedId)
  const visibleTickets = showResolved ? tickets : tickets.filter((t) => t.status !== 'resolved')

  if (loading) return <p className="text-sm text-ink/50">লোড হচ্ছে…</p>

  if (selected) {
    return (
      <AdminTicketThread
        ticket={selected}
        onBack={() => {
          setSelectedId(null)
          load()
        }}
      />
    )
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Support Tickets</h1>
        <label className="flex items-center gap-2 text-sm text-ink/60">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          সমাধান হওয়াগুলোও দেখাও
        </label>
      </div>
      <p className="mb-6 text-sm text-ink/50">সবচেয়ে সাম্প্রতিক কার্যক্রম প্রথমে।</p>

      {visibleTickets.length === 0 ? (
        <p className="rounded-card border border-ink/10 bg-ink/[0.02] p-6 text-center text-sm text-ink/50">
          কোনো খোলা ticket নেই — সব clear! 🎉
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {visibleTickets.map((ticket) => (
            <button
              key={ticket.id}
              onClick={() => setSelectedId(ticket.id)}
              className="flex items-center justify-between rounded-card border border-ink/10 bg-white p-3 text-left hover:border-brand-300"
            >
              <div>
                <p className="font-medium">{ticket.subject}</p>
                <p className="text-xs text-ink/40">
                  {ticket.userEmail} · {new Date(ticket.updatedAt).toLocaleString('bn-BD')}
                </p>
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

function AdminTicketThread({ ticket, onBack }: { ticket: AdminTicketRow; onBack: () => void }) {
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
      await replyToTicketAsAdmin(ticket.id, message)
      setMessage('')
      load()
    } finally {
      setSending(false)
    }
  }

  async function handleResolve() {
    await updateTicketStatus(ticket.id, 'resolved')
    onBack()
  }

  return (
    <div className="mx-auto max-w-lg">
      <button onClick={onBack} className="mb-4 text-sm text-ink/50 underline">
        ← সব Ticket
      </button>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-lg font-semibold">{ticket.subject}</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_LABEL[ticket.status].className}`}>
          {STATUS_LABEL[ticket.status].text}
        </span>
      </div>
      <p className="mb-4 text-xs text-ink/40">{ticket.userEmail}</p>

      {loading ? (
        <p className="text-sm text-ink/50">লোড হচ্ছে…</p>
      ) : (
        <div className="mb-4 flex flex-col gap-3">
          {replies.map((reply) => (
            <div
              key={reply.id}
              className={`max-w-[80%] rounded-card p-3 text-sm ${
                reply.senderType === 'admin' ? 'ml-auto bg-brand-100 text-brand-900' : 'bg-ink/5 text-ink/80'
              }`}
            >
              <p className="mb-1 text-xs font-medium opacity-60">
                {reply.senderType === 'admin' ? 'তুমি (admin)' : ticket.userEmail}
              </p>
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
            Resolved হিসেবে বন্ধ করো
          </button>
        </>
      )}
    </div>
  )
}
