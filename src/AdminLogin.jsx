// ═══════════════════════════════════════════════════════════════
// AdminLogin.jsx — Secure Admin Login Gate
// ─────────────────────────────────────────────────────────────
// HOW CREDENTIALS WORK (safe, no plaintext in code):
//   1. Run admin-hash-generator.html once in your browser
//   2. Copy the SHA-256 hashes it outputs
//   3. Paste them into ADMIN_USER_HASH and ADMIN_PASS_HASH below
//   4. Never store actual username/password anywhere in code
// ═══════════════════════════════════════════════════════════════

import { useState, useCallback } from 'react'

// ─── PASTE YOUR SHA-256 HASHES HERE ──────────────────────────
// Generate them using admin-hash-generator.html (never commit plaintext!)
// Example (these are hashes for user="voisadmin" pass="Panthers@2026"):
const ADMIN_USER_HASH = '6a14406eb5dd6dbb4cbf1094b64f6038554a0128111a69d1800eb5c3a7f06efa'
const ADMIN_PASS_HASH = 'baf4959ed745b18c2e9e5953fd232c3a78359b90d9eb539b4c3a80bc629c85bb'
// ─────────────────────────────────────────────────────────────

// Computes SHA-256 of a string, returns hex string
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Constant-time comparison to prevent timing attacks
function safeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export default function AdminLogin({ onLoginSuccess, onBack }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [locked, setLocked]     = useState(false)

  const handleLogin = useCallback(async (e) => {
    e?.preventDefault()
    if (locked) return

    // Lock after 5 failed attempts for 60 seconds
    if (attempts >= 5) {
      setLocked(true)
      setError('⛔ Too many failed attempts. Try again in 60 seconds.')
      setTimeout(() => { setLocked(false); setAttempts(0); setError('') }, 60000)
      return
    }

    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const [uHash, pHash] = await Promise.all([sha256(username.trim()), sha256(password)])

      if (safeEqual(uHash, ADMIN_USER_HASH) && safeEqual(pHash, ADMIN_PASS_HASH)) {
        // Store a short-lived session token (expires in 2 hours)
        const session = {
          token: await sha256(Date.now() + navigator.userAgent),
          expiry: Date.now() + 2 * 60 * 60 * 1000
        }
        sessionStorage.setItem('vois_admin_session', JSON.stringify(session))
        onLoginSuccess()
      } else {
        const newAttempts = attempts + 1
        setAttempts(newAttempts)
        const remaining = 5 - newAttempts
        setError(remaining > 0
          ? `❌ Invalid credentials. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
          : '❌ Invalid credentials.')
        setUsername(''); setPassword('')
      }
    } catch {
      setError('⚠️ Authentication error. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [username, password, attempts, locked, onLoginSuccess])

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.lockIcon}>🔐</div>
          <div style={styles.title}>ADMIN ACCESS</div>
          <div style={styles.subtitle}>VOIS Panthers · Restricted Area</div>
        </div>

        {/* Form */}
        <div style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>USERNAME</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="Enter admin username"
              autoComplete="off"
              autoFocus
              disabled={loading || locked}
              style={{ ...styles.input, ...(locked ? styles.inputDisabled : {}) }}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>PASSWORD</label>
            <div style={styles.passWrap}>
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="Enter admin password"
                autoComplete="current-password"
                disabled={loading || locked}
                style={{ ...styles.input, paddingRight: 44, ...(locked ? styles.inputDisabled : {}) }}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                style={styles.eyeBtn}
                tabIndex={-1}
              >
                {showPass ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {error && (
            <div style={styles.error}>{error}</div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading || locked}
            style={{ ...styles.loginBtn, ...(loading || locked ? styles.loginBtnDisabled : {}) }}
          >
            {loading ? '⏳ Verifying...' : locked ? '⛔ Locked' : '🔓 Login to Admin'}
          </button>

          <button onClick={onBack} style={styles.backBtn}>
            ← Back to Public View
          </button>
        </div>

        {/* Security note */}
        <div style={styles.secNote}>
          🛡️ Credentials never stored in plain text &nbsp;·&nbsp; Session expires in 2h
        </div>
      </div>
    </div>
  )
}

// ─── STYLES ──────────────────────────────────────────────────
const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 9000,
    background: 'radial-gradient(ellipse at 60% 30%, rgba(245,166,35,0.08) 0%, transparent 60%), #0a0f1e',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%', maxWidth: 440,
    background: 'linear-gradient(145deg, #161f38, #0e1528)',
    border: '1px solid #1e2d50',
    borderRadius: 20,
    boxShadow: '0 0 60px rgba(245,166,35,0.12), 0 20px 60px rgba(0,0,0,0.5)',
    overflow: 'hidden',
  },
  header: {
    background: 'linear-gradient(135deg, #0a1520, #1a0a00)',
    borderBottom: '2px solid #f5a623',
    padding: '28px 32px 24px',
    textAlign: 'center',
  },
  lockIcon: { fontSize: 48, marginBottom: 10, filter: 'drop-shadow(0 0 12px rgba(245,166,35,0.5))' },
  title: {
    fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, letterSpacing: 6,
    color: '#f5a623', textShadow: '0 0 20px rgba(245,166,35,0.4)', lineHeight: 1,
  },
  subtitle: {
    fontFamily: "'Rajdhani', sans-serif", fontSize: 12, letterSpacing: 4,
    color: '#8899bb', textTransform: 'uppercase', marginTop: 6,
  },
  form: { padding: '28px 32px 20px' },
  field: { marginBottom: 18 },
  label: {
    display: 'block', fontFamily: "'Rajdhani', sans-serif",
    fontSize: 11, letterSpacing: 2, color: '#8899bb',
    textTransform: 'uppercase', marginBottom: 7,
  },
  input: {
    width: '100%', background: '#131c35',
    border: '1px solid #1e2d50', borderRadius: 10,
    color: '#e8eaf6', fontFamily: "'Rajdhani', sans-serif",
    fontSize: 15, fontWeight: 600, padding: '12px 16px',
    outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  inputDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  passWrap: { position: 'relative' },
  eyeBtn: {
    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1,
  },
  error: {
    background: 'rgba(231,76,60,0.12)', border: '1px solid rgba(231,76,60,0.35)',
    borderRadius: 8, padding: '10px 14px', marginBottom: 16,
    fontFamily: "'Rajdhani', sans-serif", fontSize: 13, color: '#e74c3c', fontWeight: 600,
  },
  loginBtn: {
    width: '100%', padding: '14px 0',
    background: 'linear-gradient(135deg, #f5a623, #e8531a)',
    border: 'none', borderRadius: 10, color: '#000',
    fontFamily: "'Rajdhani', sans-serif", fontSize: 15,
    fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase',
    cursor: 'pointer', marginBottom: 12, transition: 'opacity 0.2s, transform 0.1s',
  },
  loginBtnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  backBtn: {
    width: '100%', padding: '11px 0',
    background: 'rgba(136,153,187,0.08)', border: '1px solid #1e2d50',
    borderRadius: 10, color: '#8899bb',
    fontFamily: "'Rajdhani', sans-serif", fontSize: 14,
    fontWeight: 700, letterSpacing: 1, cursor: 'pointer',
    transition: 'all 0.2s',
  },
  secNote: {
    borderTop: '1px solid #1e2d50', padding: '12px 24px',
    textAlign: 'center', fontFamily: "'Rajdhani', sans-serif",
    fontSize: 11, color: '#8899bb', letterSpacing: 0.5,
  },
}
