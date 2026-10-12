export type ComplaintStatus =
  | 'Submitted'
  | 'Under review'
  | 'In progress'
  | 'Resolved'
  | 'Closed'

export type Severity = 'Low' | 'Medium' | 'High' | 'Critical'
export type UserRole = 'citizen' | 'admin'

export interface Complaint {
  id: string
  title: string
  description: string
  category: string
  status: ComplaintStatus
  severity: Severity
  latitude: number
  longitude: number
  location: string
  createdAt: string
  updatedAt: string
  userId: string | null
  reporter: string
  photoUrl: string | null
  duplicateOf: string | null
  resolutionDetails: string | null
}

export interface StatusUpdate {
  id: string
  complaintId: string
  status: ComplaintStatus
  details: string | null
  createdAt: string
  actorName: string
}

export interface UserProfile {
  id: string
  displayName: string
  role: UserRole
}

export interface NewComplaint {
  title: string
  description: string
  category: string
  severity: Severity
  latitude: number
  longitude: number
  location: string
  photo: File | null
}
