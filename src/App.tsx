import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, CheckCircle2, ChevronDown, CircleHelp, Clock3, FileText, Filter, LayoutDashboard, ListFilter, LogOut, Map as MapIcon, MapPin, Menu, Plus, Search, ShieldCheck, Sparkles, TrendingUp, Users, X } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { categories, sampleComplaints } from './data'
import AuthDialog from './components/AuthDialog'
import ComplaintDetailDialog from './components/ComplaintDetailDialog'
import { formatAge, getPriorityScore } from './lib/complaint-utils'
import MapPanel from './components/MapPanel'
import ReportDialog from './components/ReportDialog'
import { createComplaint, loadComplaints, loadProfile, updateComplaint } from './lib/complaints'
import { isDemoMode, supabase } from './lib/supabase'
import type { Complaint, ComplaintStatus, NewComplaint, UserProfile } from './types'
import './App.css'

type Page = 'overview' | 'complaints' | 'map' | 'my-reports'
type User = { id: string; email: string }

function statusClass(status: ComplaintStatus): string {
  return `status-${status.toLowerCase().replaceAll(' ', '-')}`
}

function isOpen(complaint: Complaint): boolean {
  return complaint.status !== 'Resolved' && complaint.status !== 'Closed'
}

function distanceInMeters(first: Complaint, second: Complaint): number {
  const radians = (degrees: number) => degrees * Math.PI / 180
  const latitudeDifference = radians(second.latitude - first.latitude)
  const longitudeDifference = radians(second.longitude - first.longitude)
  const a = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude)) * Math.sin(longitudeDifference / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function words(value: string): Set<string> {
  return new Set(value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((word) => word.length > 3))
}

function findPotentialDuplicate(complaint: Complaint, complaints: Complaint[]): Complaint | null {
  if (complaint.duplicateOf) return complaints.find((item) => item.id === complaint.duplicateOf) ?? null
  const complaintWords = words(complaint.title)
  return complaints
    .filter((candidate) => candidate.id !== complaint.id && candidate.category === complaint.category)
    .map((candidate) => {
      const candidateWords = words(candidate.title)
      const sharedWords = [...complaintWords].filter((word) => candidateWords.has(word)).length
      const similarity = sharedWords / Math.max(1, new Set([...complaintWords, ...candidateWords]).size)
      const distance = distanceInMeters(complaint, candidate)
      return { candidate, distance, similarity, isNearbyMatch: distance <= 250 && distance > 0, isTitleMatch: similarity >= 0.45 }
    })
    .filter((match) => match.isNearbyMatch || match.isTitleMatch)
    .sort((first, second) => Number(second.isNearbyMatch) - Number(first.isNearbyMatch) || first.distance - second.distance || second.similarity - first.similarity)[0]?.candidate ?? null
}

function neighborhood(location: string): string {
  if (/vijay nagar/i.test(location)) return 'Vijay Nagar'
  if (/sarafa|rajwada|mg road|regal/i.test(location)) return 'Central Indore'
  if (/bhawarkua/i.test(location)) return 'Bhawarkua'
  return 'Palasia'
}

function Brand() {
  return (
    <a href="#top" className="brand" aria-label="CivicPulse home">
      <span className="brand-icon"><Activity size={20} strokeWidth={2.6} /></span>
      <span>Civic<span>Pulse</span></span>
    </a>
  )
}

interface ComplaintRowProps {
  complaint: Complaint
  complaints: Complaint[]
  onSelect: (complaint: Complaint) => void
}

function ComplaintRow({ complaint, complaints, onSelect }: ComplaintRowProps) {
  const possibleDuplicate = findPotentialDuplicate(complaint, complaints)
  const priority = getPriorityScore(complaint)
  return (
    <button className="complaint-row" type="button" onClick={() => onSelect(complaint)}>
      <span className="complaint-icon"><MapPin size={17} /></span>
      <span className="complaint-main">
        <span className="complaint-title-line">
          <strong>{complaint.title}</strong>
          {possibleDuplicate && !complaint.duplicateOf && <span className="duplicate-tag"><AlertTriangle size={12} /> Possible duplicate</span>}
          {complaint.duplicateOf && <span className="duplicate-tag"><AlertTriangle size={12} /> Duplicate</span>}
        </span>
        <span className="complaint-subline">{complaint.id} <i /> {complaint.category} <i /> {complaint.location}</span>
      </span>
      <span className="row-severity"><span className={`severity-dot severity-dot-${complaint.severity.toLowerCase()}`} />{complaint.severity}</span>
      <span className={`status-pill ${statusClass(complaint.status)}`}>{complaint.status}</span>
      <span className="row-priority"><strong>{priority}</strong><span>priority</span></span>
      <span className="row-age">{formatAge(complaint.createdAt)}</span>
      <ArrowRight className="row-arrow" size={17} />
    </button>
  )
}

function App() {
  const [page, setPage] = useState<Page>('overview')
  const [complaints, setComplaints] = useState<Complaint[]>(isDemoMode ? sampleComplaints : [])
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [selected, setSelected] = useState<Complaint | null>(null)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All categories')
  const [statusFilter, setStatusFilter] = useState('All statuses')
  const [severityFilter, setSeverityFilter] = useState('All severity')
  const [showFilters, setShowFilters] = useState(false)
  const [isLoading, setIsLoading] = useState(!isDemoMode)
  const [loadError, setLoadError] = useState('')
  const [toast, setToast] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  const refreshComplaints = useCallback(async () => {
    const result = await loadComplaints()
    setComplaints(result)
  }, [])

  useEffect(() => {
    let active = true
    loadComplaints()
      .then((result) => { if (active) setComplaints(result) })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : 'Unable to load reports from Supabase.')
      })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [refreshComplaints])

  useEffect(() => {
    if (!supabase) return
    let active = true
    const applySession = async (session: Session | null) => {
      if (!active) return
      if (!session?.user) {
        setUser(null)
        setProfile(null)
        return
      }
      setUser({ id: session.user.id, email: session.user.email ?? '' })
      try {
        const nextProfile = await loadProfile(session.user.id)
        if (active) setProfile(nextProfile)
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? `Could not load your account: ${error.message}` : 'Could not load your account.')
      }
    }

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) throw error
        return applySession(data.session)
      })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : 'Could not restore your session.') })
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySession(session)
      void refreshComplaints().catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : 'Unable to refresh reports.')
      })
    })
    return () => {
      active = false
      authListener.subscription.unsubscribe()
    }
  }, [refreshComplaints])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 4500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const isAdmin = profile?.role === 'admin'
  const openComplaints = useMemo(() => complaints.filter(isOpen), [complaints])
  const highPriority = useMemo(() => openComplaints.filter((complaint) => getPriorityScore(complaint) >= 70), [openComplaints])
  const resolvedCount = complaints.filter((complaint) => complaint.status === 'Resolved' || complaint.status === 'Closed').length
  const myReports = useMemo(() => complaints.filter((complaint) => complaint.userId === user?.id), [complaints, user?.id])

  const filteredComplaints = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return complaints
      .filter((complaint) => page !== 'my-reports' || complaint.userId === user?.id)
      .filter((complaint) => categoryFilter === 'All categories' || complaint.category === categoryFilter)
      .filter((complaint) => statusFilter === 'All statuses' || complaint.status === statusFilter)
      .filter((complaint) => severityFilter === 'All severity' || complaint.severity === severityFilter)
      .filter((complaint) => !normalizedQuery || `${complaint.title} ${complaint.location} ${complaint.id} ${complaint.category}`.toLowerCase().includes(normalizedQuery))
      .sort((first, second) => getPriorityScore(second) - getPriorityScore(first))
  }, [categoryFilter, complaints, page, query, severityFilter, statusFilter, user?.id])

  const hotspots = useMemo(() => {
    const grouped = new Map<string, number>()
    openComplaints.forEach((complaint) => {
      const area = neighborhood(complaint.location)
      grouped.set(area, (grouped.get(area) ?? 0) + 1)
    })
    return [...grouped.entries()].sort((first, second) => second[1] - first[1]).slice(0, 4)
  }, [openComplaints])

  function navigate(nextPage: Page) {
    setPage(nextPage)
    setMobileMenuOpen(false)
  }

  async function submitReport(report: NewComplaint) {
    const reporter = profile ?? (isDemoMode ? { id: 'demo-resident', displayName: 'Demo resident', role: 'citizen' as const } : null)
    if (!reporter) {
      setReportOpen(false)
      setAuthOpen(true)
      throw new Error('Sign in before submitting a report.')
    }
    const created = await createComplaint(report, reporter)
    setComplaints((current) => [created, ...current])
    setReportOpen(false)
    setPage(isDemoMode ? 'complaints' : 'my-reports')
    setToast(isDemoMode ? 'Demo report added to this session only. It is not saved to a database.' : 'Your report has been submitted to the city.')
  }

  async function handleAdminUpdate(id: string, status: ComplaintStatus, details: string, duplicateOf: string | null) {
    if (!isAdmin) throw new Error('Admin access is required to update reports.')
    if (isDemoMode) throw new Error('Admin changes are unavailable in demo mode. Connect Supabase and sign in with an admin account.')
    await updateComplaint(id, status, details, duplicateOf)
    await refreshComplaints()
    setToast('Report updated and recorded in the activity log.')
  }

  async function signOut() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) setLoadError(`Sign out failed: ${error.message}`)
    else setToast('You have been signed out.')
  }

  const showLiveNotice = !isDemoMode
  const firstName = profile?.displayName?.split(' ')[0] ?? 'there'

  return (
    <div className="app-shell" id="top">
      <header className="topbar">
        <div className="topbar-inner">
          <Brand />
          <nav className={`primary-nav ${mobileMenuOpen ? 'nav-open' : ''}`} aria-label="Main navigation">
            <button className={`nav-link ${page === 'overview' ? 'nav-link-active' : ''}`} onClick={() => navigate('overview')} type="button"><LayoutDashboard size={16} /> Overview</button>
            <button className={`nav-link ${page === 'complaints' ? 'nav-link-active' : ''}`} onClick={() => navigate('complaints')} type="button"><FileText size={16} /> All reports</button>
            {user && <button className={`nav-link ${page === 'my-reports' ? 'nav-link-active' : ''}`} onClick={() => navigate('my-reports')} type="button"><Users size={16} /> My reports</button>}
            <button className={`nav-link ${page === 'map' ? 'nav-link-active' : ''}`} onClick={() => navigate('map')} type="button"><MapIcon size={16} /> Map</button>
          </nav>
          <div className="topbar-actions">
            <div className="mode-indicator" title={isDemoMode ? 'This workspace has no Supabase credentials configured.' : 'Connected to Supabase. The displayed records are loaded from your database.'}>
              <span className={`mode-dot ${isDemoMode ? 'mode-dot-demo' : 'mode-dot-live'}`} />
              {isDemoMode ? 'DEMO DATA' : 'LIVE DATA'}
            </div>
            <button className={`icon-button notification-button ${notificationsOpen ? 'icon-button-active' : ''}`} type="button" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(!notificationsOpen)}>
              <Bell size={18} /><span className="notification-dot" />
            </button>
            {user ? (
              <div className="user-menu-wrap">
                <button className="user-menu" type="button" aria-label="Account menu" onClick={() => setNotificationsOpen(!notificationsOpen)}>
                  <span className="avatar">{(profile?.displayName ?? user.email).slice(0, 1).toUpperCase()}</span>
                  <span className="user-name">{profile?.displayName ?? user.email}</span><ChevronDown size={14} />
                </button>
                {notificationsOpen && <div className="account-popover">
                  <p>{profile?.role === 'admin' ? 'Administrator account' : 'Citizen account'}</p>
                  <span>{user.email}</span>
                  <button type="button" onClick={() => void signOut()}><LogOut size={15} /> Sign out</button>
                </div>}
              </div>
            ) : (
              <button className="button button-outline sign-in-button" type="button" onClick={() => setAuthOpen(true)}>Sign in</button>
            )}
            <button className="icon-button mobile-menu-button" type="button" aria-label="Toggle navigation" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      <main className="page-content">
        {isDemoMode && (
          <div className="environment-banner" role="status">
            <span className="environment-icon"><CircleHelp size={16} /></span>
            <p><strong>Preview mode</strong> — You’re viewing illustrative sample reports around Indore, Madhya Pradesh. They are not live city data. Add Supabase keys in <code>.env.local</code> to enable accounts and database-backed reporting.</p>
            <button type="button" aria-label="Dismiss demo information" onClick={(event) => event.currentTarget.parentElement?.remove()}><X size={15} /></button>
          </div>
        )}
        {showLiveNotice && (
          <div className="environment-banner environment-banner-live" role="status">
            <span className="environment-icon"><ShieldCheck size={16} /></span>
            <p><strong>Connected to Supabase</strong> — Reports below are loaded from your configured database.</p>
          </div>
        )}
        {loadError && (
          <div className="error-banner" role="alert"><AlertTriangle size={17} /><span>{loadError}</span><button type="button" onClick={() => setLoadError('')} aria-label="Dismiss error"><X size={15} /></button></div>
        )}

        {(page === 'overview' || page === 'complaints' || page === 'my-reports') && (
          <div className="page-heading">
            <div>
              <div className="breadcrumb"><span>Community</span><span>/</span><strong>{page === 'overview' ? 'Overview' : page === 'my-reports' ? 'My reports' : 'All reports'}</strong></div>
              <h1>{page === 'overview' ? `Welcome back, ${firstName}` : page === 'my-reports' ? 'Your reports' : 'Community reports'}<span className="heading-period">.</span></h1>
              <p>{page === 'overview' ? 'See what’s happening in your neighborhood.' : page === 'my-reports' ? 'Follow the progress of the issues you’ve reported.' : 'Every report brings us one step closer to a better city.'}</p>
            </div>
            <div className="heading-actions">
              {isAdmin && <span className="admin-pill"><ShieldCheck size={14} /> Admin view</span>}
              {user && <button className="button button-outline" type="button" onClick={() => navigate('my-reports')}>My reports <ArrowRight size={15} /></button>}
              <button className="button button-primary" type="button" onClick={() => setReportOpen(true)}><Plus size={17} /> Report an issue</button>
            </div>
          </div>
        )}

        {page === 'overview' && (
          <>
            <section className="metric-grid" aria-label="Community report statistics">
              <MetricCard title="Total reports" value={complaints.length} foot="Across your community" icon={<FileText size={18} />} tone="blue" />
              <MetricCard title="Awaiting action" value={openComplaints.length} foot="Needs city attention" icon={<Clock3 size={18} />} tone="orange" />
              <MetricCard title="High priority" value={highPriority.length} foot="Priority score 70+" icon={<AlertTriangle size={18} />} tone="red" />
              <MetricCard title="Resolved" value={resolvedCount} foot="Issues closed out" icon={<CheckCircle2 size={18} />} tone="green" />
            </section>

            <section className="overview-grid">
              <div className="panel reports-panel">
                <div className="panel-heading">
                  <div><span className="eyebrow">NEEDS ATTENTION</span><h2>Priority reports <span className="count-badge">{openComplaints.length}</span></h2></div>
                  <button className="subtle-link" onClick={() => navigate('complaints')} type="button">View all reports <ArrowRight size={15} /></button>
                </div>
                {isLoading ? <LoadingState /> : openComplaints.slice().sort((a, b) => getPriorityScore(b) - getPriorityScore(a)).slice(0, 4).map((complaint) => <ComplaintRow key={complaint.id} complaint={complaint} complaints={complaints} onSelect={setSelected} />)}
                {!isLoading && openComplaints.length === 0 && <EmptyState title="All caught up" text="There are no open community reports at the moment." />}
                <div className="panel-footer"><Sparkles size={15} /><span>Priority combines reported severity with waiting time. Scores support, not replace, city-team review.</span></div>
              </div>
              <div className="panel hotspot-panel">
                <div className="panel-heading">
                  <div><span className="eyebrow">THIS WEEK</span><h2>Neighborhood pulse</h2></div>
                  <span className="live-chip"><span /> Live map</span>
                </div>
                <div className="mini-map"><MapPanel complaints={openComplaints} onSelect={setSelected} /></div>
                <div className="hotspot-list">
                  {hotspots.length ? hotspots.map(([area, count], index) => (
                    <div className="hotspot-row" key={area}>
                      <span className={`hotspot-rank hotspot-rank-${index + 1}`}>{String(index + 1).padStart(2, '0')}</span>
                      <span className="hotspot-name">{area}<small>{count} open {count === 1 ? 'report' : 'reports'}</small></span>
                      <span className="hotspot-track"><i style={{ width: `${Math.max(14, count / (hotspots[0]?.[1] ?? 1) * 100)}%` }} /></span>
                      <span className="hotspot-count">{count}</span>
                    </div>
                  )) : <p className="empty-updates">No open reports to map right now.</p>}
                </div>
                <button className="map-link" type="button" onClick={() => navigate('map')}>Explore the issue map <ArrowUpRight size={15} /></button>
              </div>
            </section>

            <section className="bottom-grid">
              <div className="panel activity-panel">
                <div className="panel-heading"><div><span className="eyebrow">COMMUNITY</span><h2>Recent reports</h2></div><button className="subtle-link" type="button" onClick={() => navigate('complaints')}>See all <ArrowRight size={15} /></button></div>
                {complaints.slice(0, 3).map((complaint) => <CompactComplaint key={complaint.id} complaint={complaint} onSelect={setSelected} />)}
              </div>
              <div className="panel how-panel">
                <div className="how-icon"><Sparkles size={18} /></div>
                <span className="eyebrow">SMART TRIAGE</span>
                <h2>Better insights.<br />Stronger neighborhoods.</h2>
                <p>CivicPulse highlights reports that may be related and explains how age and severity shape the priority score. Every decision stays in human hands.</p>
                <button className="subtle-link" type="button" onClick={() => navigate('complaints')}>See how reports are prioritized <ArrowRight size={15} /></button>
              </div>
            </section>
          </>
        )}

        {(page === 'complaints' || page === 'my-reports') && (
          <section className="panel all-reports-panel">
            <div className="reports-toolbar">
              <div className="report-count-label"><span className="eyebrow">{page === 'my-reports' ? 'YOUR ACTIVITY' : 'COMMUNITY FEED'}</span><h2>{page === 'my-reports' ? `${myReports.length} reports` : `${complaints.length} reports`} <small>sorted by priority</small></h2></div>
              <div className="toolbar-controls">
                <label className="search-field"><Search size={16} /><input aria-label="Search reports" placeholder="Search reports..." value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}</label>
                <button className={`button button-outline filter-toggle ${showFilters ? 'filter-toggle-active' : ''}`} type="button" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}><Filter size={15} /> Filters</button>
              </div>
            </div>
            {showFilters && <div className="filter-bar">
              <label><span>Category</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option>All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
              <label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All statuses</option>{(['Submitted', 'Under review', 'In progress', 'Resolved', 'Closed'] as const).map((status) => <option key={status}>{status}</option>)}</select></label>
              <label><span>Severity</span><select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}><option>All severity</option>{(['Critical', 'High', 'Medium', 'Low'] as const).map((severity) => <option key={severity}>{severity}</option>)}</select></label>
              <button className="reset-filters" type="button" onClick={() => { setCategoryFilter('All categories'); setStatusFilter('All statuses'); setSeverityFilter('All severity'); setQuery('') }}>Reset filters</button>
            </div>}
            <div className="list-legend"><span><ListFilter size={14} /> {filteredComplaints.length} matching {filteredComplaints.length === 1 ? 'report' : 'reports'}</span><span>Score = severity + waiting time</span></div>
            {isLoading ? <LoadingState /> : filteredComplaints.map((complaint) => <ComplaintRow key={complaint.id} complaint={complaint} complaints={complaints} onSelect={setSelected} />)}
            {!isLoading && filteredComplaints.length === 0 && <EmptyState title={page === 'my-reports' && !user ? 'Sign in to track your reports' : 'No reports found'} text={page === 'my-reports' && !user ? 'Create an account to view updates on reports you submit.' : 'Try changing your search or filters, or report a new issue.'} action={page === 'my-reports' && !user ? <button className="button button-primary" type="button" onClick={() => setAuthOpen(true)}>Sign in</button> : undefined} />}
          </section>
        )}

        {page === 'map' && (
          <section className="map-page-grid">
            <div className="panel full-map-panel">
              <div className="panel-heading map-page-heading"><div><span className="eyebrow">EXPLORE YOUR COMMUNITY</span><h2>Issue map</h2><p>Every pin represents a report submitted by a community member.</p></div><span className="map-report-count"><MapPin size={15} /> {complaints.length} reports</span></div>
              <div className="full-map"><MapPanel complaints={complaints} onSelect={setSelected} /></div>
              <div className="map-legend"><span><i className="legend-dot severity-critical" /> Critical</span><span><i className="legend-dot severity-high" /> High</span><span><i className="legend-dot severity-medium" /> Medium</span><span><i className="legend-dot severity-low" /> Low</span><span className="map-attribution-note">© OpenStreetMap contributors</span></div>
            </div>
            <aside className="panel map-side-panel">
              <span className="eyebrow">OPEN REPORTS</span><h2>Needs attention</h2>
              <p className="muted">Sorted by transparent priority score.</p>
              {openComplaints.slice().sort((a, b) => getPriorityScore(b) - getPriorityScore(a)).map((complaint) => <button key={complaint.id} className="map-side-report" type="button" onClick={() => setSelected(complaint)}>
                <span className={`severity-icon severity-icon-${complaint.severity.toLowerCase()}`}><MapPin size={15} /></span>
                <span><strong>{complaint.title}</strong><small>{neighborhood(complaint.location)} · {formatAge(complaint.createdAt)}</small></span>
                <strong className="priority-number">{getPriorityScore(complaint)}</strong>
              </button>)}
              <div className="map-score-note"><Sparkles size={15} /><p><strong>What does the score mean?</strong><span>Severity sets the base score. Each waiting day adds 2 points, capped at 100. City staff make final decisions.</span></p></div>
            </aside>
          </section>
        )}

        <footer className="app-footer"><Brand /><span>Built for communities that care.</span><div><button type="button" onClick={() => setToast('CivicPulse connects neighbors and city teams through transparent issue reporting.')}>About CivicPulse</button><button type="button" onClick={() => setToast('Your personal email is never shown publicly. Database access is protected by Supabase row-level security.')}>Privacy</button><span>© 2026 CivicPulse</span></div></footer>
      </main>
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
      {reportOpen && <ReportDialog onClose={() => setReportOpen(false)} onSubmit={submitReport} />}
      {selected && <ComplaintDetailDialog
        key={selected.id}
        complaint={complaints.find((item) => item.id === selected.id) ?? selected}
        admin={Boolean(isAdmin && !isDemoMode)}
        duplicateCandidate={findPotentialDuplicate(selected, complaints)}
        otherComplaints={complaints}
        onClose={() => setSelected(null)}
        onAdminUpdate={handleAdminUpdate}
      />}
      {toast && <div className="toast-message" role="status"><CheckCircle2 size={17} /><span>{toast}</span><button type="button" aria-label="Dismiss message" onClick={() => setToast('')}><X size={15} /></button></div>}
    </div>
  )
}

function MetricCard({ title, value, foot, icon, tone }: { title: string; value: number; foot: string; icon: React.ReactNode; tone: string }) {
  return <article className="metric-card"><div className="metric-card-top"><span>{title}</span><span className={`metric-icon metric-icon-${tone}`}>{icon}</span></div><strong className="metric-value">{value.toLocaleString()}</strong><span className="metric-foot"><i className={`metric-trend metric-trend-${tone}`}>{tone === 'green' ? <ArrowUpRight size={13} /> : tone === 'red' ? <ArrowDownRight size={13} /> : <TrendingUp size={13} />}</i>{foot}</span></article>
}

function CompactComplaint({ complaint, onSelect }: { complaint: Complaint; onSelect: (complaint: Complaint) => void }) {
  return <button className="compact-complaint" type="button" onClick={() => onSelect(complaint)}>
    <span className={`compact-icon compact-icon-${complaint.category.toLowerCase().includes('road') ? 'road' : complaint.category.toLowerCase().includes('water') ? 'water' : 'other'}`}><MapPin size={16} /></span>
    <span className="compact-content"><strong>{complaint.title}</strong><small>{complaint.id} · {complaint.category}</small></span>
    <span className={`status-pill ${statusClass(complaint.status)}`}>{complaint.status}</span>
    <span className="compact-age">{formatAge(complaint.createdAt)}</span>
  </button>
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><FileText size={21} /></span><h3>{title}</h3><p>{text}</p>{action}</div>
}

function LoadingState() {
  return <div className="loading-state" role="status"><span className="loading-spinner" />Loading reports…</div>
}

export default App
