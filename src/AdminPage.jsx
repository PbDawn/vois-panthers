// ═══════════════════════════════════════════════════════════════
// AdminPage.jsx — Admin Panel Embedded View
// ─────────────────────────────────────────────────────────────
// Embeds indexadmin.html (from vois-ipl-tracker GitHub Pages)
// inside an iframe within the React app.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react'

const ADMIN_HTML_URL = 'https://pbdawn.github.io/vois-ipl-tracker/indexadmin.html'

function isSessionValid() {
  try {
    const raw = sessionStorage.getItem('vois_admin_session')
    if (!raw) return false
    const { expiry } = JSON.parse(raw)
    return Date.now() < expiry
  } catch {
    return false
  }
}

// ─── LIVE SCORE WIDGET (same logic as public page) ────────────
function AdminLiveScore() {
  const [showLiveScore, setShowLiveScore] = useState(false)
  const [liveMatch, setLiveMatch] = useState(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const fetchIPLScore = useCallback(async () => {
    if (!showLiveScore) return
    setLiveLoading(true)
    setErrorMsg('')
    const options = {
      method: 'GET',
      headers: {
        'x-rapidapi-key': '6db820e94emsh24dd09b8e658f4cp15f50ejsn4febbb8496be',
        'x-rapidapi-host': 'cricbuzz-cricket.p.rapidapi.com'
      }
    }
    try {
      const response = await fetch('https://cricbuzz-cricket.p.rapidapi.com/matches/v1/live', options)
      if (!response.ok) throw new Error(`Server Error: ${response.status}`)
      const result = await response.json()
      const leagueGroup = result.typeMatches?.find(group => group.matchType === 'League')
      const iplSeries = leagueGroup?.seriesMatches?.find(s =>
        s.seriesAdWrapper?.seriesName.toLowerCase().includes('indian premier league')
      )
      if (iplSeries?.seriesAdWrapper?.matches?.length > 0) {
        const match = iplSeries.seriesAdWrapper.matches[0]
        const info = match.matchInfo
        const score = match.matchScore
        let liveScoreText = '---'
        if (score) {
          const battingTeamId = score.battingTeamId
          const battingTeam = battingTeamId === info.team1.teamId ? info.team1.teamName : info.team2.teamName
          const scoreObj = battingTeamId === info.team1.teamId ? score.team1Score : score.team2Score
          if (scoreObj?.inngs1) {
            liveScoreText = `${battingTeam}: ${scoreObj.inngs1.runs}-${scoreObj.inngs1.wickets || 0} (${scoreObj.inngs1.overs || 0})`
          }
        }
        setLiveMatch({ teams: `${info.team1.teamName} vs ${info.team2.teamName}`, runs: liveScoreText, status: info.status, venue: info.venueInfo.ground })
      } else {
        setLiveMatch(null)
      }
    } catch (err) {
      setErrorMsg('API is temporarily unavailable.')
    } finally {
      setLiveLoading(false)
    }
  }, [showLiveScore])

  useEffect(() => {
    if (showLiveScore) {
      fetchIPLScore()
      const interval = setInterval(fetchIPLScore, 180000)
      return () => clearInterval(interval)
    }
  }, [showLiveScore, fetchIPLScore])

  return (
    <div style={lsStyles.wrap}>
      <button
        onClick={() => setShowLiveScore(v => !v)}
        style={{
          ...lsStyles.toggleBtn,
          background: showLiveScore ? 'rgba(231,76,60,0.18)' : 'rgba(46,204,113,0.15)',
          border: showLiveScore ? '1px solid #e74c3c' : '1px solid #2ecc71',
          color: showLiveScore ? '#e74c3c' : '#2ecc71',
        }}
      >
        {showLiveScore ? '🛑 Hide Live Score' : '📡 Live Score'}
      </button>

      {showLiveScore && (
        <div style={lsStyles.panel}>
          {liveLoading && !liveMatch ? (
            <span style={lsStyles.dim}>Fetching live data...</span>
          ) : errorMsg ? (
            <span style={{ color: '#ff4d4d', fontSize: 11 }}>{errorMsg}</span>
          ) : liveMatch ? (
            <div style={lsStyles.scoreRow}>
              <span style={lsStyles.teams}>{liveMatch.teams}</span>
              <span style={lsStyles.score}>{liveMatch.runs}</span>
              <span style={lsStyles.status}>{liveMatch.status}</span>
              <span style={lsStyles.venue}>📍 {liveMatch.venue}</span>
              <button onClick={fetchIPLScore} style={lsStyles.refreshMini}>🔄</button>
            </div>
          ) : (
            <span style={lsStyles.dim}>No match currently Live.</span>
          )}
        </div>
      )}
    </div>
  )
}

const lsStyles = {
  wrap: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  toggleBtn: {
    fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: 1,
    padding: '5px 12px', borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  panel: {
    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.25)',
    borderRadius: 8, padding: '6px 14px',
  },
  scoreRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  teams: { fontFamily: "'Rajdhani',sans-serif", fontWeight: 800, fontSize: 13, color: '#e8eaf6' },
  score: { fontFamily: "'Orbitron',sans-serif", fontSize: 14, fontWeight: 700, color: '#2ecc71' },
  status: { fontSize: 12, color: '#f5a623' },
  venue: { fontSize: 11, color: '#8899bb' },
  refreshMini: { background: 'transparent', border: '1px solid #3498db', color: '#3498db', padding: '2px 7px', borderRadius: 4, fontSize: 11, cursor: 'pointer' },
  dim: { fontSize: 12, color: '#8899bb', fontFamily: "'Rajdhani',sans-serif" },
}

// ─── MAIN ADMIN PAGE ──────────────────────────────────────────
export default function AdminPage({ onLogout }) {
  useEffect(() => {
    if (!isSessionValid()) onLogout()
    const interval = setInterval(() => {
      if (!isSessionValid()) { clearInterval(interval); onLogout() }
    }, 60_000)
    return () => clearInterval(interval)
  }, [onLogout])

  const handleLogout = () => {
    sessionStorage.removeItem('vois_admin_session')
    onLogout()
  }

  return (
    <div style={styles.wrapper}>
      {/* Admin top-bar */}
      <div style={styles.topBar}>
        {/* Left: badge + session info */}
        <div style={styles.topLeft}>
          <span style={styles.adminBadge}>🔐 ADMIN MODE</span>
          <span style={styles.sessionInfo}>Session active · auto-expires in 2h</span>
        </div>

        {/* Centre: Live Score widget — Feature added to admin */}
        <div style={styles.topCentre}>
          <AdminLiveScore />
        </div>

        {/* Right: logout */}
        <div style={styles.topRight}>
          <button onClick={handleLogout} style={styles.logoutBtn}>
            🚪 Logout
          </button>
        </div>
      </div>

      {/* Iframe embedding the admin HTML page — unchanged */}
      <iframe
        src={ADMIN_HTML_URL}
        style={styles.iframe}
        title="VOIS Panthers Admin"
        allow="clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
      />
    </div>
  )
}

// ─── STYLES ──────────────────────────────────────────────────
const styles = {
  wrapper: {
    position: 'fixed', inset: 0, zIndex: 8000,
    display: 'flex', flexDirection: 'column',
    background: '#0a0f1e',
  },
  topBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 20px', flexShrink: 0, flexWrap: 'wrap', gap: 10,
    background: 'linear-gradient(135deg, #0d1a08, #0a1a0a)',
    borderBottom: '2px solid #e74c3c',
    boxShadow: '0 2px 20px rgba(231,76,60,0.2)',
  },
  topLeft: { display: 'flex', alignItems: 'center', gap: 14 },
  topCentre: { display: 'flex', alignItems: 'center', flex: 1, justifyContent: 'center', padding: '0 16px' },
  adminBadge: {
    fontFamily: "'Rajdhani', sans-serif", fontWeight: 800,
    fontSize: 13, letterSpacing: 2, color: '#e74c3c',
    background: 'rgba(231,76,60,0.12)', border: '1px solid rgba(231,76,60,0.35)',
    borderRadius: 6, padding: '3px 10px',
  },
  sessionInfo: {
    fontFamily: "'Rajdhani', sans-serif", fontSize: 11,
    color: '#8899bb', letterSpacing: 1,
  },
  topRight: {},
  logoutBtn: {
    fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
    fontSize: 13, letterSpacing: 1,
    padding: '6px 16px', borderRadius: 8,
    background: 'rgba(231,76,60,0.15)', color: '#e74c3c',
    border: '1px solid rgba(231,76,60,0.4)', cursor: 'pointer',
    transition: 'all 0.2s',
  },
  iframe: {
    flex: 1, width: '100%', border: 'none',
    background: '#0a0f1e',
  },
}

