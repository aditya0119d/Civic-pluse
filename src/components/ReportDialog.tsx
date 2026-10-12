import { useState, type FormEvent } from 'react'
import { Camera, Check, Crosshair, MapPin, Upload, X } from 'lucide-react'
import { categories } from '../data'
import MapPanel from './MapPanel'
import type { NewComplaint, Severity } from '../types'

interface ReportDialogProps {
  onClose: () => void
  onSubmit: (report: NewComplaint) => Promise<void>
}

export default function ReportDialog({ onClose, onSubmit }: ReportDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState(categories[0])
  const [severity, setSeverity] = useState<Severity>('Medium')
  const [location, setLocation] = useState('')
  const [latitude, setLatitude] = useState('22.7196')
  const [longitude, setLongitude] = useState('75.8577')
  const [showMap, setShowMap] = useState(false)
  const [photo, setPhoto] = useState<File | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        category,
        severity,
        latitude: Number(latitude),
        longitude: Number(longitude),
        location: location.trim(),
        photo,
      })
      onClose()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'We could not submit your report. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handlePhoto(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Choose an image file such as JPG, PNG, or WebP.')
    } else if (file.size > 8 * 1024 * 1024) {
      setErrorMessage('Photos must be 8 MB or smaller.')
    } else {
      setErrorMessage('')
      setPhoto(file)
    }
  }

  const pickedPosition: [number, number] = [Number(latitude), Number(longitude)]

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="dialog report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <header className="dialog-header">
          <div>
            <span className="eyebrow">MAKE A DIFFERENCE</span>
            <h2 id="report-title">Report an issue</h2>
            <p className="muted">The more detail you share, the faster we can help.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close report form"><X size={20} /></button>
        </header>
        <form onSubmit={handleSubmit} className="stack-form report-form">
          <label className="form-field">
            <span>Issue title <b aria-hidden="true">*</b></span>
            <input required maxLength={120} placeholder="e.g. Pothole on Oak Street" value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="form-field">
            <span>Description <b aria-hidden="true">*</b></span>
            <textarea required minLength={12} maxLength={1500} rows={4} placeholder="Describe what happened, where, and who may be affected." value={description} onChange={(event) => setDescription(event.target.value)} />
            <small>{description.length}/1500 characters</small>
          </label>
          <div className="form-grid">
            <label className="form-field">
              <span>Category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select>
            </label>
            <label className="form-field">
              <span>Severity</span>
              <select value={severity} onChange={(event) => setSeverity(event.target.value as Severity)}>
                {(['Low', 'Medium', 'High', 'Critical'] as const).map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>
          <div className="form-field">
            <span>Photo <small>(optional, up to 8 MB)</small></span>
            <label className="upload-box">
              <input className="visually-hidden" type="file" accept="image/*" onChange={(event) => handlePhoto(event.target.files?.[0])} aria-label="Upload an issue photo" />
              {photo ? <Check size={18} /> : <Camera size={18} />}
              <span>{photo ? photo.name : 'Add a photo to help explain the issue'}</span>
              <Upload size={17} />
            </label>
          </div>
          <div className="form-field">
            <div className="field-label-row"><span>Location <b aria-hidden="true">*</b></span><button className="text-button" type="button" onClick={() => setShowMap(!showMap)}><Crosshair size={14} /> {showMap ? 'Hide map' : 'Pin on map'}</button></div>
            <span className="input-with-icon"><MapPin size={17} /><input required maxLength={160} placeholder="Street address or nearby landmark" value={location} onChange={(event) => setLocation(event.target.value)} /></span>
            {showMap && <div className="picker-map"><MapPanel complaints={[]} pickMode pickedPosition={pickedPosition} onPick={(lat, lng) => {
              setLatitude(lat.toFixed(6))
              setLongitude(lng.toFixed(6))
            }} /></div>}
            <div className="coordinates-grid">
              <label className="form-field"><span>Latitude</span><input required type="number" step="any" min="-90" max="90" value={latitude} onChange={(event) => setLatitude(event.target.value)} /></label>
              <label className="form-field"><span>Longitude</span><input required type="number" step="any" min="-180" max="180" value={longitude} onChange={(event) => setLongitude(event.target.value)} /></label>
            </div>
          </div>
          {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
          <button className="button button-primary button-full" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Submitting report…' : 'Submit report'}</button>
          <p className="privacy-note">Your report is shared with the city team. Your email is never shown publicly.</p>
        </form>
      </section>
    </div>
  )
}
