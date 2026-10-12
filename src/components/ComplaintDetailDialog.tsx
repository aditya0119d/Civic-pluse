import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowUpRight, Check, Clock3, MapPin, ShieldCheck, X } from 'lucide-react'
import { loadUpdates } from '../lib/complaints'
import { formatAge, getPriorityScore } from '../lib/complaint-utils'
import type { Complaint, ComplaintStatus, StatusUpdate } from '../types'

interface ComplaintDetailDialogProps {
  complaint: Complaint
  admin: boolean
  duplicateCandidate: Complaint | null
  otherComplaints: Complaint[]
  onClose: () => void
  onAdminUpdate: (id: string, status: ComplaintStatus, details: string, duplicateOf: string | null) => Promise<void>
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(date))
}

export default function ComplaintDetailDialog({
  complaint,
  admin,
  duplicateCandidate,
  otherComplaints,
  onClose,
  onAdminUpdate,
}: ComplaintDetailDialogProps) {
  const [updates, setUpdates] = useState<StatusUpdate[]>([])
  const [status, setStatus] = useState<ComplaintStatus>(complaint.status)
  const [details, setDetails] = useState(complaint.resolutionDetails ?? '')
  const [duplicateOf, setDuplicateOf] = useState(complaint.duplicateOf ?? '')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let active = true
    loadUpdates(complaint.id)
      .then((result) => { if (active) setUpdates(result) })
      .catch((error: unknown) => {
        if (active) setErrorMessage(error instanceof Error ? `Could not load updates: ${error.message}` : 'Could not load report updates.')
      })
    return () => { active = false }
  }, [complaint.id])

  async function saveAdminUpdate() {
    setErrorMessage('')
    setIsSaving(true)
    try {
      await onAdminUpdate(complaint.id, status, details, duplicateOf || null)
      onClose()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not update this report.')
    } finally {
      setIsSaving(false)
    }
  }

  const requiresResolution = status === 'Resolved' || status === 'Closed'

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="dialog detail-dialog" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <header className="dialog-header">
          <div className="detail-title-wrap">
            <span className="eyebrow">{complaint.id} <span className="eyebrow-dot">·</span> {complaint.category}</span>
            <h2 id="detail-title">{complaint.title}</h2>
            <div className="detail-meta">
              <span className={`status-pill status-${complaint.status.toLowerCase().replaceAll(' ', '-')}`}>{complaint.status}</span>
              <span className={`severity-text severity-text-${complaint.severity.toLowerCase()}`}>{complaint.severity} severity</span>
              <span><Clock3 size={14} /> {formatAge(complaint.createdAt)}</span>
            </div>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close report details"><X size={20} /></button>
        </header>
        {complaint.photoUrl && <img className="detail-photo" src={complaint.photoUrl} alt={`Photo for ${complaint.title}`} />}
        <p className="detail-description">{complaint.description}</p>
        <div className="location-card"><MapPin size={17} /><div><strong>{complaint.location}</strong><span>{complaint.latitude.toFixed(5)}, {complaint.longitude.toFixed(5)}</span></div><ArrowUpRight size={16} /></div>
        <div className="report-facts">
          <div><span>Reported by</span><strong>{complaint.reporter}</strong></div>
          <div><span>Submitted</span><strong>{formatDate(complaint.createdAt)}</strong></div>
          <div><span>Priority score</span><strong className="priority-number">{getPriorityScore(complaint)}<small> / 100</small></strong></div>
        </div>
        {duplicateCandidate && !complaint.duplicateOf && (
          <div className="duplicate-suggestion"><AlertTriangle size={17} /><p><strong>Possible duplicate</strong><span>Similar report {duplicateCandidate.id} is nearby. Review before assigning.</span></p></div>
        )}
        {complaint.duplicateOf && (
          <div className="duplicate-suggestion"><AlertTriangle size={17} /><p><strong>Linked duplicate</strong><span>This report is linked to {complaint.duplicateOf}.</span></p></div>
        )}
        {complaint.resolutionDetails && (
          <div className="resolution-card"><ShieldCheck size={17} /><p><strong>Resolution details</strong><span>{complaint.resolutionDetails}</span></p></div>
        )}
        <section className="updates-section">
          <h3>Activity & updates</h3>
          {updates.length ? (
            <ol className="timeline">
              {updates.map((update) => (
                <li key={update.id}><span className="timeline-dot" /><div><strong>{update.status}</strong><span>{update.details || 'Status updated by the city team.'}</span><small>{update.actorName} · {formatDate(update.createdAt)}</small></div></li>
              ))}
            </ol>
          ) : (
            <p className="empty-updates">No updates yet. We’ll show progress here as it happens.</p>
          )}
        </section>
        {admin && (
          <section className="admin-edit">
            <h3>Admin actions</h3>
            <label className="form-field"><span>Update status</span><select value={status} onChange={(event) => setStatus(event.target.value as ComplaintStatus)}>
              {(['Submitted', 'Under review', 'In progress', 'Resolved', 'Closed'] as const).map((item) => <option key={item}>{item}</option>)}
            </select></label>
            {(requiresResolution || details) && (
              <label className="form-field"><span>Resolution / update details {requiresResolution && <b aria-hidden="true">*</b>}</span><textarea rows={3} maxLength={1000} required={requiresResolution} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Describe the action taken or next steps." /></label>
            )}
            <label className="form-field"><span>Duplicate of</span><select value={duplicateOf} onChange={(event) => setDuplicateOf(event.target.value)}>
              <option value="">Not a duplicate</option>
              {otherComplaints.filter((item) => item.id !== complaint.id).map((item) => <option key={item.id} value={item.id}>{item.id} — {item.title}</option>)}
            </select></label>
            {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
            <button className="button button-primary button-full" type="button" onClick={saveAdminUpdate} disabled={isSaving || (requiresResolution && !details.trim())}>
              {isSaving ? 'Saving update…' : <><Check size={16} /> Save changes</>}
            </button>
          </section>
        )}
        {!admin && errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
      </section>
    </div>
  )
}
