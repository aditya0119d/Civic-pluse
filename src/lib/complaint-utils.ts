import type { Complaint } from '../types'

const priorityBase = { Low: 20, Medium: 42, High: 68, Critical: 88 }

export function getPriorityScore(complaint: Complaint): number {
  const waitingDays = Math.max(0, Math.floor((Date.now() - new Date(complaint.createdAt).getTime()) / 86_400_000))
  return Math.min(100, priorityBase[complaint.severity] + Math.min(32, waitingDays * 2))
}

export function formatAge(date: string): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000))
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}
