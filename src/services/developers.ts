import { supabase } from '@/lib/supabaseClient'
import type { Developer } from '@/types'

interface DeveloperRow {
  id: string
  user_id: string
  developer_name: string
  logo_url: string | null
  description: string | null
  website: string | null
  support_email: string | null
  phone: string | null
  verified: boolean
  is_owner: boolean
  payment_status: 'unpaid' | 'paid'
  id_document_path: string | null
  id_document_uploaded_at: string | null
  created_at: string
}

function mapRow(row: DeveloperRow): Developer {
  return {
    id: row.id,
    userId: row.user_id,
    developerName: row.developer_name,
    logoUrl: row.logo_url ?? undefined,
    description: row.description ?? undefined,
    website: row.website ?? undefined,
    supportEmail: row.support_email ?? undefined,
    phone: row.phone ?? undefined,
    verified: row.verified,
    isOwner: row.is_owner,
    paymentStatus: row.payment_status,
    idDocumentPath: row.id_document_path ?? undefined,
    idDocumentUploadedAt: row.id_document_uploaded_at ?? undefined,
    createdAt: row.created_at,
  }
}

/** Returns the current user's developer profile, or null if they haven't registered as a developer yet. */
export async function fetchMyDeveloperProfile(): Promise<Developer | null> {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null

  const { data, error } = await supabase
    .from('developers')
    .select('*')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (error) throw error
  return data ? mapRow(data) : null
}

export async function registerDeveloper(input: {
  developerName: string
  website?: string
  supportEmail?: string
  phone?: string
  description?: string
}): Promise<Developer> {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('আগে লগইন করতে হবে।')

  const { data, error } = await supabase
    .from('developers')
    .insert({
      user_id: userData.user.id,
      developer_name: input.developerName,
      website: input.website || null,
      support_email: input.supportEmail || null,
      phone: input.phone || null,
      description: input.description || null,
    })
    .select('*')
    .single()

  if (error) throw error
  return mapRow(data)
}

export async function updateDeveloperProfile(
  id: string,
  input: Partial<{
    developerName: string
    website: string
    supportEmail: string
    description: string
    logoUrl: string
  }>,
): Promise<Developer> {
  const { data, error } = await supabase
    .from('developers')
    .update({
      ...(input.developerName !== undefined && { developer_name: input.developerName }),
      ...(input.website !== undefined && { website: input.website || null }),
      ...(input.supportEmail !== undefined && { support_email: input.supportEmail || null }),
      ...(input.description !== undefined && { description: input.description || null }),
      ...(input.logoUrl !== undefined && { logo_url: input.logoUrl || null }),
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return mapRow(data)
}

/**
 * #29 — optional ID/trade-license upload for stricter developer
 * verification. Uploaded to a private bucket (developer-ids), keyed by
 * the user's own auth id so the storage RLS policy
 * ((storage.foldername(name))[1] = auth.uid()::text) can enforce
 * "only you can read/write your own document" without needing to know
 * the developers.id row yet — this can be called right after signup,
 * before or after registerDeveloper().
 */
export async function uploadIdDocument(file: File, developerId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('আগে লগইন করতে হবে।')

  const extension = file.name.split('.').pop() || 'jpg'
  const path = `${userData.user.id}/document.${extension}`

  const { error: uploadError } = await supabase.storage
    .from('developer-ids')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (uploadError) throw uploadError

  const { error: updateError } = await supabase
    .from('developers')
    .update({ id_document_path: path, id_document_uploaded_at: new Date().toISOString() })
    .eq('id', developerId)
  if (updateError) throw updateError
}
