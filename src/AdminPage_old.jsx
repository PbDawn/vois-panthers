// ═══════════════════════════════════════════════════════════════
// AdminPage.jsx — Admin Panel Embedded View
// ─────────────────────────────────────────────────────────────
// Embeds indexadmin.html (from vois-ipl-tracker GitHub Pages)
// inside an iframe within the React app.
//
// Option A (default): iframe pointing to your GitHub Pages URL
// Option B: Import the HTML file directly into your Vite project
//           (see comments below for instructions)
// ═══════════════════════════════════════════════════════════════

import { useEffect } from 'react'

// ─── CONFIGURE THIS URL ───────────────────────────────────────
// Change to your actual GitHub Pages URL where indexadmin.html is hosted.
// e.g. "https://pbdawn.github.io/vois-ipl-tracker/indexadmin.html"
// OR if you move it into THIS Vite project: "/admin/indexadmin.html"
const ADMIN_HTML_URL = 'https://pbdawn.github.io/vois-ipl-tracker/indexadmin.html'
// ─────────────────────────────────────────────────────────────

// Session validation — must match what AdminLogin.jsx stores
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

export default function AdminPage({ onLogout }) {
  // Guard: if session expired, force logout
  useEffect(() => {
    if (!isSessionValid()) onLogout()

    // Check session validity every minute
    const interval = setInterval(() => {
      if (!isSessionValid()) {
        clearInterval(interval)
        onLogout()
      }
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
        <div style={styles.topLeft}>
          <span style={styles.adminBadge}>🔐 ADMIN MODE</span>
          <span style={styles.sessionInfo}>Session active · auto-expires in 2h</span>
        </div>
        <div style={styles.topRight}>
          <button onClick={handleLogout} style={styles.logoutBtn}>
            🚪 Logout
          </button>
        </div>
      </div>

      {/* Iframe embedding the admin HTML page */}
      <iframe
        src={ADMIN_HTML_URL}
        style={styles.iframe}
        title="VOIS Panthers Admin"
        allow="clipboard-write"
        // sandbox is intentionally permissive to allow localStorage, scripts, etc.
        // remove the line below if you want stricter sandboxing
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
    padding: '8px 20px', flexShrink: 0,
    background: 'linear-gradient(135deg, #0d1a08, #0a1a0a)',
    borderBottom: '2px solid #e74c3c',
    boxShadow: '0 2px 20px rgba(231,76,60,0.2)',
  },
  topLeft: { display: 'flex', alignItems: 'center', gap: 14 },
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
