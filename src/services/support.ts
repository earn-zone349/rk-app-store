import { supabase } from '@/lib/supabaseClient'

export interface SupportTicket {
  id: string
  subject: string
  status: 'open' | 'in_progress' | 'resolved'
  createdAt: string
  updatedAt: string
}

export interface TicketReply {
  id: string
  ticketId: string
  senderType: 'user' | 'admin'
  message: string
  createdAt: string
}

function mapTicket(row: Record<string, unknown>): SupportTicket {
  return {
    id: row.id as string,
    subject: row.subject as string,
    status: row.status as SupportTicket['status'],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function mapReply(row: Record<string, unknown>): TicketReply {
  return {
    id: row.id as string,
    ticketId: row.ticket_id as string,
    senderType: row.sender_type as TicketReply['senderType'],
    message: row.message as string,
    createdAt: row.created_at as string,
  }
}

export async function fetchMyTickets(): Promise<SupportTicket[]> {
  const { data, error } = await supabase.from('support_tickets').select('*').order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapTicket)
}

export async function fetchTicketReplies(ticketId: string): Promise<TicketReply[]> {
  const { data, error } = await supabase
    .from('support_ticket_replies')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapReply)
}

/** Opens a new ticket AND posts the first message as its opening reply, in one call — a ticket with no message isn't useful to anyone reading the queue. */
export async function openTicket(subject: string, message: string): Promise<SupportTicket> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('আগে লগইন করতে হবে।')

  const { data: ticket, error: ticketError } = await supabase
    .from('support_tickets')
    .insert({ user_id: user.id, subject })
    .select('*')
    .single()
  if (ticketError) throw ticketError

  const { error: replyError } = await supabase
    .from('support_ticket_replies')
    .insert({ ticket_id: ticket.id, sender_type: 'user', message })
  if (replyError) throw replyError

  notifyTicketActivity(ticket.id)
  return mapTicket(ticket)
}

export async function replyToTicketAsUser(ticketId: string, message: string): Promise<void> {
  const { error } = await supabase
    .from('support_ticket_replies')
    .insert({ ticket_id: ticketId, sender_type: 'user', message })
  if (error) throw error
  notifyTicketActivity(ticketId)
}

/**
 * Fire-and-forget push notification for a ticket reply — the in-app 🔔
 * bell is already guaranteed by the notify_on_support_reply DB trigger
 * (0019_support_notifications.sql) regardless of this call's outcome;
 * this only adds the OS-level push for someone not currently on the site.
 * Never awaited by callers, and any failure here is silently swallowed —
 * a flaky push notification should never make sending the actual message
 * look like it failed.
 */
function notifyTicketActivity(ticketId: string) {
  supabase.functions.invoke('support-notify', { body: { ticketId } }).catch(() => {})
}

export async function markTicketResolved(ticketId: string): Promise<void> {
  const { error } = await supabase.from('support_tickets').update({ status: 'resolved' }).eq('id', ticketId)
  if (error) throw error
}
