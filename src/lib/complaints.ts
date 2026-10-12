import { sampleComplaints, sampleUpdates } from '../data'
import type { Complaint, ComplaintStatus, NewComplaint, Severity, StatusUpdate, UserProfile } from '../types'
import { supabase } from './supabase'

const text = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback
const number = (value: unknown): number => typeof value === 'number' ? value : Number(value)
const statusValue = (value: unknown): ComplaintStatus => {
  const status = text(value)
  return ['Submitted', 'Under review', 'In progress', 'Resolved', 'Closed'].includes(status)
    ? status as ComplaintStatus
    : 'Submitted'
}
const severityValue = (value: unknown): Severity => {
  const severity = text(value)
  return ['Low', 'Medium', 'High', 'Critical'].includes(severity) ? severity as Severity : 'Low'
}

function mapComplaint(row: Record<string, unknown>): Complaint {
  return {
    id: text(row.id),
    title: text(row.title),
    description: text(row.description),
    category: text(row.category),
    status: statusValue(row.status),
    severity: severityValue(row.severity),
    latitude: number(row.latitude),
    longitude: number(row.longitude),
    location: text(row.location),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    userId: text(row.user_id) || null,
    reporter: text(row.reporter_name, 'Resident'),
    photoUrl: text(row.photo_url) || null,
    duplicateOf: text(row.duplicate_of) || null,
    resolutionDetails: text(row.resolution_details) || null,
  }
}

export async function loadComplaints(): Promise<Complaint[]> {
  if (!supabase) return [...sampleComplaints]
  const { data, error } = await supabase.from('complaints').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => mapComplaint(row as Record<string, unknown>))
}

export async function loadMyComplaints(userId: string): Promise<Complaint[]> {
  if (!supabase) return sampleComplaints.filter((complaint) => complaint.userId === userId)
  const { data, error } = await supabase.from('complaints').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => mapComplaint(row as Record<string, unknown>))
}

export async function loadUpdates(complaintId: string): Promise<StatusUpdate[]> {
  if (!supabase) return sampleUpdates.filter((update) => update.complaintId === complaintId)
  const { data, error } = await supabase.from('complaint_updates').select('*').eq('complaint_id', complaintId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>
    return {
      id: text(record.id),
      complaintId: text(record.complaint_id),
      status: statusValue(record.status),
      details: text(record.details) || null,
      createdAt: text(record.created_at),
      actorName: text(record.actor_name, 'City team'),
    }
  })
}

export async function loadProfile(userId: string): Promise<UserProfile | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('profiles').select('id, display_name, role').eq('id', userId).maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: text(data.id),
    displayName: text(data.display_name, 'Resident'),
    role: data.role === 'admin' ? 'admin' : 'citizen',
  }
}

export async function createComplaint(input: NewComplaint, user: UserProfile): Promise<Complaint> {
  if (!supabase) {
    const createdAt = new Date().toISOString()
    return {
      id: `DEMO-${Date.now()}`,
      title: input.title,
      description: input.description,
      category: input.category,
      status: 'Submitted',
      severity: input.severity,
      latitude: input.latitude,
      longitude: input.longitude,
      location: input.location,
      createdAt,
      updatedAt: createdAt,
      userId: user.id,
      reporter: user.displayName,
      photoUrl: input.photo ? URL.createObjectURL(input.photo) : null,
      duplicateOf: null,
      resolutionDetails: null,
    }
  }

  let photoUrl: string | null = null
  let photoPath: string | null = null
  if (input.photo) {
    const extension = input.photo.name.split('.').pop()?.toLowerCase() || 'jpg'
    photoPath = `${user.id}/${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await supabase.storage.from('complaint-photos').upload(photoPath, input.photo, {
      contentType: input.photo.type,
      upsert: false,
    })
    if (uploadError) throw uploadError
    const { data } = supabase.storage.from('complaint-photos').getPublicUrl(photoPath)
    photoUrl = data.publicUrl
  }

  const { data, error } = await supabase.from('complaints').insert({
    title: input.title,
    description: input.description,
    category: input.category,
    severity: input.severity,
    latitude: input.latitude,
    longitude: input.longitude,
    location: input.location,
    photo_url: photoUrl,
    reporter_name: user.displayName,
    user_id: user.id,
    status: 'Submitted',
  }).select('*').single()
  if (error) {
    if (photoPath) {
      const { error: cleanupError } = await supabase.storage.from('complaint-photos').remove([photoPath])
      if (cleanupError) {
        throw new Error(`Report creation failed: ${error.message}. Uploaded photo cleanup also failed: ${cleanupError.message}`)
      }
    }
    throw error
  }
  return mapComplaint(data as Record<string, unknown>)
}

export async function updateComplaint(
  id: string,
  status: ComplaintStatus,
  details: string,
  duplicateOf: string | null,
): Promise<void> {
  if (!supabase) throw new Error('Admin changes are disabled in demo mode.')
  const { error } = await supabase.rpc('admin_update_complaint', {
    p_complaint_id: id,
    p_status: status,
    p_details: details.trim() || null,
    p_duplicate_of: duplicateOf,
  })
  if (error) throw error
}
