import { useState, type FormEvent } from 'react'
import { ArrowLeft, LockKeyhole, Mail, UserRound, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface AuthDialogProps {
  onClose: () => void
}

export default function AuthDialog({ onClose }: AuthDialogProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')
    if (!supabase) {
      setErrorMessage('Authentication is unavailable in demo mode. Configure Supabase to create an account.')
      return
    }

    setIsSubmitting(true)
    const result = mode === 'register'
      ? await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name.trim() } },
        })
      : await supabase.auth.signInWithPassword({ email, password })
    setIsSubmitting(false)

    if (result.error) {
      setErrorMessage(result.error.message)
    } else if (mode === 'register' && !result.data.session) {
      setSuccessMessage('Account created. Check your email to confirm your address, then sign in.')
    } else {
      onClose()
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="dialog auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="icon-button dialog-close" type="button" onClick={onClose} aria-label="Close sign in">
          <X size={19} />
        </button>
        <div className="auth-mark"><LockKeyhole size={19} /></div>
        <span className="eyebrow">YOUR CIVIC ACCOUNT</span>
        <h2 id="auth-title">{mode === 'login' ? 'Welcome back' : 'Join your community'}</h2>
        <p className="muted">{mode === 'login' ? 'Sign in to track reports and get updates.' : 'Create an account to report and follow local issues.'}</p>
        <form className="stack-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <label className="form-field">
              <span>Your name</span>
              <span className="input-with-icon"><UserRound size={17} /><input autoComplete="name" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></span>
            </label>
          )}
          <label className="form-field">
            <span>Email address</span>
            <span className="input-with-icon"><Mail size={17} /><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></span>
          </label>
          <label className="form-field">
            <span>Password</span>
            <span className="input-with-icon"><LockKeyhole size={17} /><input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></span>
          </label>
          {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
          {successMessage && <p className="form-success" role="status">{successMessage}</p>}
          <button className="button button-primary button-full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <p className="auth-switch">
          {mode === 'login' ? 'New to CivicPulse?' : 'Already have an account?'}{' '}
          <button className="text-button" type="button" onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setErrorMessage('')
            setSuccessMessage('')
          }}>
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
        <button type="button" className="back-link" onClick={onClose}><ArrowLeft size={15} /> Back to CivicPulse</button>
      </section>
    </div>
  )
}
