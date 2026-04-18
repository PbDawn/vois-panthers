// ═══════════════════════════════════════════════════════════════
// AdminPage.jsx — Admin Panel with Fantasy Tips Editor
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react'

const JSONBIN_BASE     = 'https://api.jsonbin.io/v3/b'
const HARDCODED_BIN_ID = '69c84b985fdde574550bf9f7'
const PLAYERS = ['Ashish','Kalpesh','Nilesh','Prabhat','Pritam','Sudhir','Swapnil']

function isSessionValid() {
  try {
    const raw = sessionStorage.getItem('vois_admin_session')
    if (!raw) return false
    const { expiry } = JSON.parse(raw)
    return Date.now() < expiry
  } catch { return false }
}

function getYouTubeEmbedId(url) {
  if (!url) return null
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
  if (shortMatch) return shortMatch[1]
  const longMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
  if (longMatch) return longMatch[1]
  return null
}

function formatMatchTimeLabel(t) {
  if (t === '15:30') return '3:30 PM IST'
  if (t === '19:30') return '7:30 PM IST'
  return t || ''
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
}

// ─── STYLE HELPERS ───────────────────────────────────────────
function btnStyle(color) {
  return {
    fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 11,
    padding: '5px 12px', borderRadius: 7, cursor: 'pointer',
    border: `1px solid ${color}44`,
    background: `${color}18`, color,
    transition: 'all 0.15s', whiteSpace: 'nowrap'
  }
}
function chipStyle(color) {
  return {
    fontSize: 10, padding: '2px 8px', borderRadius: 4,
    background: `${color}18`, color, border: `1px solid ${color}33`
  }
}
const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#8899bb',
  letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5
}
const inputStyle = {
  width: '100%', background: 'rgba(0,0,0,0.4)',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
  color: '#e8eaf6', fontSize: 12, padding: '8px 12px',
  fontFamily: "'Rajdhani', sans-serif", boxSizing: 'border-box'
}

// ─── MATCH LOG ADMIN ─────────────────────────────────────────
function MatchLogAdmin({ matches: initialMatches, onMatchesSave }) {
  const TODAY = new Date().toISOString().split('T')[0]

  const emptyForm = () => ({
    matchno: '', date: TODAY, matchTime: '',
    teams: '', teamwon: '', fee: 50,
    contest: 'yes', contestLink: '',
    players: Object.fromEntries(PLAYERS.map(p => [p, { joined: false, paid: false, sponsored: false, sponsorDetails: [], points: 0.00 }]))
  })

  const [matches, setMatches] = useState(initialMatches || [])
  const [form, setForm] = useState(emptyForm())
  const [editMatchno, setEditMatchno] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [expandedMatch, setExpandedMatch] = useState(null)

  useEffect(() => { setMatches(initialMatches || []) }, [initialMatches])

  // ── Sponsor amount helpers ──
  const getSponsorTotal = (player) => {
    const pd = form.players[player]
    if (!pd?.sponsored) return 0
    return (pd.sponsorDetails || []).reduce((s, d) => s + (parseFloat(d.amount) || 0), 0)
  }
  const getRemaining = (player) => {
    const fee = parseFloat(form.fee) || 0
    return fee - getSponsorTotal(player)
  }

  // ── Player checkbox handlers ──
  const handleJoined = (player, checked) => {
    setForm(f => {
      const pd = { ...f.players[player], joined: checked }
      if (!checked) { pd.paid = false; pd.sponsored = false; pd.sponsorDetails = [] }
      return { ...f, players: { ...f.players, [player]: pd } }
    })
  }

  const handlePaid = (player, checked) => {
    setForm(f => {
      const pd = { ...f.players[player], paid: checked }
      if (!checked) { pd.sponsored = false; pd.sponsorDetails = [] }
      return { ...f, players: { ...f.players, [player]: pd } }
    })
  }

  const handleSponsored = (player, checked) => {
    setForm(f => {
      const pd = { ...f.players[player], sponsored: checked }
      if (checked) { pd.paid = true } // sponsored always implies paid
      else { pd.sponsorDetails = [] }
      return { ...f, players: { ...f.players, [player]: pd } }
    })
  }

  const handleSponsorDetail = (player, idx, field, value) => {
    setForm(f => {
      const pd = { ...f.players[player] }
      const details = [...(pd.sponsorDetails || [])]
      details[idx] = { ...details[idx], [field]: value }
      pd.sponsorDetails = details
      return { ...f, players: { ...f.players, [player]: pd } }
    })
  }

  const addSponsorRow = (player) => {
    setForm(f => {
      const pd = { ...f.players[player] }
      pd.sponsorDetails = [...(pd.sponsorDetails || []), { sponsor: '', amount: '' }]
      return { ...f, players: { ...f.players, [player]: pd } }
    })
  }

  const removeSponsorRow = (player, idx) => {
    setForm(f => {
      const pd = { ...f.players[player] }
      const details = [...(pd.sponsorDetails || [])]
      details.splice(idx, 1)
      pd.sponsorDetails = details
      return { ...f, players: { ...f.players, [player]: pd } }
    })
  }

  // ── Load match into form for editing ──
  const loadMatch = (m) => {
    const players = {}
    PLAYERS.forEach(p => {
      const src = m.players?.[p] || {}
      players[p] = {
        joined: src.joined || false,
        paid: src.paid || false,
        sponsored: src.sponsored || false,
        sponsorDetails: src.sponsorDetails || [],
        points: src.points || 0
      }
    })
    setForm({
      matchno: m.matchno || '', date: m.date || TODAY,
      matchTime: m.matchTime || '', teams: m.teams || '',
      teamwon: m.teamwon || '', fee: m.fee || 50,
      contest: m.contest || 'yes', contestLink: m.contestLink || '',
      players
    })
    setEditMatchno(m.matchno)
    setSaveMsg('')
  }

  const clearForm = () => { setForm(emptyForm()); setEditMatchno(null); setSaveMsg('') }

  // ── Cloud save ──
  const saveToCloud = async (newMatches) => {
    setSaving(true); setSaveMsg('')
    try {
      let binData = {}
      const getRes = await fetch(`${JSONBIN_BASE}/${HARDCODED_BIN_ID}/latest`, { headers: { 'X-Bin-Meta': 'false' } })
      if (getRes.ok) { binData = await getRes.json() }
      else {
        const r2 = await fetch(`${JSONBIN_BASE}/${HARDCODED_BIN_ID}/latest`)
        if (r2.ok) { const d = await r2.json(); binData = d.record || d }
      }
      const updated = { ...binData, matches: newMatches, updatedAt: new Date().toISOString() }
      let headers = { 'Content-Type': 'application/json' }
      try {
        const raw = sessionStorage.getItem('vois_admin_session')
        if (raw) { const s = JSON.parse(raw); if (s.key) headers['X-Master-Key'] = s.key }
      } catch {}
      const putRes = await fetch(`${JSONBIN_BASE}/${HARDCODED_BIN_ID}`, { method: 'PUT', headers, body: JSON.stringify(updated) })
      if (!putRes.ok) throw new Error(`Save failed (${putRes.status})`)
      setSaveMsg('✅ Saved to cloud! Refresh public page to see changes.')
      onMatchesSave && onMatchesSave(newMatches)
    } catch (err) { setSaveMsg(`❌ ${err.message}`) }
    finally { setSaving(false) }
  }

  const handleSaveMatch = async () => {
    if (!form.matchno) { setSaveMsg('❌ Match No. is required'); return }
    // Build clean player data
    const players = {}
    PLAYERS.forEach(p => {
      const pd = form.players[p]
      players[p] = {
        joined: pd.joined,
        paid: pd.paid,
        sponsored: pd.sponsored || false,
        sponsorDetails: pd.sponsored ? (pd.sponsorDetails || []).filter(d => d.sponsor && parseFloat(d.amount) > 0) : [],
        points: parseFloat(pd.points) || 0
      }
    })
    // Compute joined ranks
    const joinedRanks = {}
    const joined = PLAYERS.filter(p => players[p].joined && players[p].points > 0)
      .sort((a,b) => players[b].points - players[a].points)
    let r = 1
    joined.forEach((p, i) => {
      if (i > 0 && players[p].points < players[joined[i-1]].points) r++
      joinedRanks[p] = r
    })

    const matchEntry = {
      matchno: form.matchno, date: form.date, matchTime: form.matchTime,
      teams: form.teams, teamwon: form.teamwon, fee: parseFloat(form.fee) || 0,
      contest: form.contest, contestLink: form.contestLink,
      joinedCount: PLAYERS.filter(p => players[p].joined).length,
      pool: 0, transferred: false, players, joinedRanks
    }

    let newMatches
    if (editMatchno !== null) {
      newMatches = matches.map(m => String(m.matchno) === String(editMatchno) ? matchEntry : m)
    } else {
      const exists = matches.find(m => String(m.matchno) === String(form.matchno))
      if (exists) { setSaveMsg('❌ Match No. already exists. Edit it instead.'); return }
      newMatches = [...matches, matchEntry].sort((a,b) => parseInt(a.matchno) - parseInt(b.matchno))
    }
    setMatches(newMatches)
    await saveToCloud(newMatches)
    clearForm()
  }

  const handleDeleteMatch = async (matchno) => {
    const newMatches = matches.filter(m => String(m.matchno) !== String(matchno))
    setMatches(newMatches)
    setDeleteConfirm(null)
    await saveToCloud(newMatches)
  }

  const fee = parseFloat(form.fee) || 0

  return (
    <div style={{ padding: '16px 20px', color: '#e8eaf6', fontFamily: "'Rajdhani', sans-serif", maxWidth: 1100, margin: '0 auto' }}>
      {/* ── Form ── */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(245,166,35,0.25)', borderRadius: 14, padding: '20px 24px', marginBottom: 24 }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 3, color: '#f5a623', marginBottom: 16 }}>
          {editMatchno ? `✏️ EDITING MATCH #${editMatchno}` : '➕ ADD / EDIT MATCH'}
        </div>

        {/* Match Details */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#f5a623', marginBottom: 12, textTransform: 'uppercase' }}>Match Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            {[
              { key: 'matchno', label: 'Match No.', placeholder: 'e.g. 1', type: 'text' },
              { key: 'date', label: 'Match Date', type: 'date' },
              { key: 'teams', label: 'Teams Playing', placeholder: 'e.g. MI vs CSK', type: 'text' },
              { key: 'teamwon', label: 'Team Won', placeholder: 'e.g. MI', type: 'text' },
              { key: 'fee', label: 'Entry Fee (₹)', placeholder: '50', type: 'number' },
            ].map(f => (
              <div key={f.key}>
                <label style={labelStyle}>{f.label}</label>
                <input type={f.type} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder} style={inputStyle} />
              </div>
            ))}
            <div>
              <label style={labelStyle}>Match Time</label>
              <select value={form.matchTime} onChange={e => setForm(p => ({ ...p, matchTime: e.target.value }))} style={inputStyle}>
                <option value="">— Select Time —</option>
                <option value="15:30">3:30 PM IST</option>
                <option value="19:30">7:30 PM IST</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Contest Played?</label>
              <select value={form.contest} onChange={e => setForm(p => ({ ...p, contest: e.target.value }))} style={inputStyle}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>
          {form.contest === 'yes' && (
            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>MyCircle11 Link</label>
              <input value={form.contestLink} onChange={e => setForm(p => ({ ...p, contestLink: e.target.value }))}
                placeholder="Paste app link here..." style={inputStyle} />
            </div>
          )}
        </div>

        {/* Player Details */}
        {form.contest === 'yes' && (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#f5a623', marginBottom: 6, textTransform: 'uppercase' }}>Player Details</div>
            <div style={{ fontSize: 11, color: '#8899bb', marginBottom: 12 }}>
              ✅ Joined = played the contest &nbsp;|&nbsp; 💰 Paid = paid the match fee &nbsp;|&nbsp; 🎁 Sponsored = someone else paid for this player &nbsp;|&nbsp; Enter MyCircle11 points
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {PLAYERS.map(player => {
                const pd = form.players[player]
                const sponsorTotal = getSponsorTotal(player)
                const remaining = getRemaining(player)
                const otherPlayers = PLAYERS.filter(p => p !== player)

                return (
                  <div key={player} style={{
                    background: pd.sponsored ? 'rgba(155,89,182,0.08)' : pd.joined ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.2)',
                    border: `1px solid ${pd.sponsored ? 'rgba(155,89,182,0.4)' : pd.joined ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'}`,
                    borderRadius: 10, padding: '12px 14px'
                  }}>
                    {/* Joined checkbox */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
                      <input type="checkbox" checked={pd.joined} onChange={e => handleJoined(player, e.target.checked)}
                        style={{ width: 16, height: 16, accentColor: '#f5a623' }} />
                      <span style={{ fontWeight: 800, fontSize: 14, color: pd.joined ? '#e8eaf6' : '#8899bb' }}>{player}</span>
                    </label>

                    {pd.joined && (
                      <>
                        {/* Paid + Sponsored row */}
                        <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
                            <input type="checkbox" checked={pd.paid} onChange={e => handlePaid(player, e.target.checked)}
                              style={{ accentColor: '#2ecc71' }} />
                            <span style={{ color: '#2ecc71' }}>Paid Fee?</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
                            <input type="checkbox" checked={pd.sponsored || false}
                              onChange={e => handleSponsored(player, e.target.checked)}
                              style={{ accentColor: '#9b59b6' }} />
                            <span style={{ color: '#9b59b6' }}>🎁 Sponsored</span>
                          </label>
                        </div>

                        {/* Sponsor details */}
                        {pd.sponsored && (
                          <div style={{ background: 'rgba(155,89,182,0.1)', border: '1px solid rgba(155,89,182,0.25)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                            <div style={{ fontSize: 10, color: '#c39bd3', fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>
                              🎁 SPONSOR BREAKDOWN — Fee: ₹{fee} &nbsp;|&nbsp;
                              Covered: ₹{sponsorTotal.toFixed(2)} &nbsp;|&nbsp;
                              <span style={{ color: remaining <= 0 ? '#2ecc71' : '#f5a623' }}>Remaining: ₹{remaining.toFixed(2)}</span>
                            </div>
                            {(pd.sponsorDetails || []).map((d, idx) => (
                              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                                <select value={d.sponsor} onChange={e => handleSponsorDetail(player, idx, 'sponsor', e.target.value)}
                                  style={{ ...inputStyle, flex: 2, fontSize: 11, padding: '5px 8px' }}>
                                  <option value="">— Sponsor —</option>
                                  {otherPlayers.map(op => <option key={op} value={op}>{op}</option>)}
                                </select>
                                <input type="number" value={d.amount} placeholder="₹"
                                  min={0} max={Math.max(0, remaining + (parseFloat(d.amount) || 0))}
                                  onChange={e => {
                                    const maxAmt = remaining + (parseFloat(d.amount) || 0)
                                    const val = Math.min(parseFloat(e.target.value) || 0, maxAmt)
                                    handleSponsorDetail(player, idx, 'amount', val)
                                  }}
                                  style={{ ...inputStyle, flex: 1, fontSize: 11, padding: '5px 8px' }} />
                                <button onClick={() => removeSponsorRow(player, idx)}
                                  style={{ background: 'rgba(231,76,60,0.2)', color: '#e74c3c', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>✕</button>
                              </div>
                            ))}
                            {remaining > 0 && (
                              <button onClick={() => addSponsorRow(player)}
                                style={{ background: 'rgba(155,89,182,0.2)', color: '#c39bd3', border: '1px solid rgba(155,89,182,0.3)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 11, marginTop: 4 }}>
                                ➕ Add Sponsor
                              </button>
                            )}
                            {remaining <= 0 && (
                              <div style={{ fontSize: 10, color: '#2ecc71', marginTop: 4 }}>✅ Full fee covered by sponsors</div>
                            )}
                          </div>
                        )}

                        {/* Points */}
                        <div>
                          <label style={{ ...labelStyle, marginBottom: 3 }}>Points</label>
                          <input type="number" step="0.01" value={pd.points}
                            onChange={e => setForm(f => ({ ...f, players: { ...f.players, [player]: { ...f.players[player], points: e.target.value } } }))}
                            style={{ ...inputStyle, fontSize: 13 }} />
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleSaveMatch} disabled={saving} style={{
            fontFamily: "'Rajdhani',sans-serif", fontWeight: 800, fontSize: 13, letterSpacing: 1,
            padding: '10px 24px', borderRadius: 9, cursor: saving ? 'wait' : 'pointer',
            background: saving ? 'rgba(46,204,113,0.1)' : 'rgba(46,204,113,0.2)',
            color: '#2ecc71', border: '1px solid rgba(46,204,113,0.4)'
          }}>
            {saving ? '⏳ Saving...' : '💾 SAVE MATCH'}
          </button>
          <button onClick={clearForm} style={{
            fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 13,
            padding: '10px 20px', borderRadius: 9, cursor: 'pointer',
            background: 'rgba(231,76,60,0.1)', color: '#e74c3c', border: '1px solid rgba(231,76,60,0.3)'
          }}>🗑 CLEAR FORM</button>
          {saveMsg && (
            <span style={{ fontSize: 12, color: saveMsg.startsWith('✅') ? '#2ecc71' : '#e74c3c' }}>{saveMsg}</span>
          )}
        </div>
      </div>

      {/* ── Transfer Management Table ── */}
      <TransferTable matches={matches} saveToCloud={saveToCloud} setMatches={setMatches} saving={saving} />

      {/* ── Match List ── */}
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: 3, color: '#f5a623', marginBottom: 12, marginTop: 28 }}>
        📋 SAVED MATCHES ({matches.length})
      </div>
      {matches.length === 0 && (
        <div style={{ textAlign: 'center', color: '#8899bb', padding: 32, border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 10 }}>No matches yet. Add one above.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[...matches].sort((a,b) => parseInt(b.matchno) - parseInt(a.matchno)).map(m => {
          const done = m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—'
          const isOpen = expandedMatch === m.matchno
          const sponsoredPlayers = PLAYERS.filter(p => m.players?.[p]?.sponsored)

          return (
            <div key={m.matchno} style={{
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${done ? 'rgba(46,204,113,0.2)' : 'rgba(245,166,35,0.2)'}`,
              borderRadius: 10, overflow: 'hidden'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', flexWrap: 'wrap', cursor: 'pointer' }}
                onClick={() => setExpandedMatch(isOpen ? null : m.matchno)}>
                <span style={{ fontWeight: 800, fontSize: 13, color: done ? '#2ecc71' : '#f5a623' }}>#{m.matchno}</span>
                <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{m.teams || '—'}</span>
                <span style={{ fontSize: 11, color: '#8899bb' }}>{m.date}</span>
                {done && <span style={{ fontSize: 10, color: '#2ecc71', background: 'rgba(46,204,113,0.1)', borderRadius: 4, padding: '2px 6px' }}>✅ {m.teamwon}</span>}
                {sponsoredPlayers.length > 0 && (
                  <span style={{ fontSize: 10, color: '#c39bd3', background: 'rgba(155,89,182,0.1)', borderRadius: 4, padding: '2px 6px' }}>
                    🎁 {sponsoredPlayers.join(', ')} sponsored
                  </span>
                )}
                <span style={{ fontSize: 12, color: '#8899bb' }}>{isOpen ? '▲' : '▼'}</span>
              </div>

              {isOpen && (
                <div style={{ padding: '0 14px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 10 }}>
                    {PLAYERS.map(p => {
                      const pd = m.players?.[p]
                      if (!pd?.joined) return null
                      return (
                        <span key={p} style={{
                          fontSize: 11, padding: '3px 8px', borderRadius: 6,
                          background: pd.sponsored ? 'rgba(155,89,182,0.15)' : pd.paid ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)',
                          color: pd.sponsored ? '#c39bd3' : pd.paid ? '#2ecc71' : '#e74c3c',
                          border: `1px solid ${pd.sponsored ? 'rgba(155,89,182,0.3)' : pd.paid ? 'rgba(46,204,113,0.2)' : 'rgba(231,76,60,0.2)'}`
                        }}>
                          {p}: {pd.sponsored ? '🎁 Sponsored' : pd.paid ? '💰 Paid' : '❌ Unpaid'} · {pd.points || 0} pts
                        </span>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { loadMatch(m); setExpandedMatch(null) }} style={{ ...btnStyle('#f5a623'), fontSize: 12, padding: '7px 16px' }}>✏️ Edit</button>
                    {deleteConfirm === m.matchno ? (
                      <>
                        <span style={{ fontSize: 11, color: '#e74c3c', alignSelf: 'center' }}>Confirm delete?</span>
                        <button onClick={() => handleDeleteMatch(m.matchno)} style={{ ...btnStyle('#e74c3c'), fontSize: 12, padding: '7px 14px' }}>Yes, Delete</button>
                        <button onClick={() => setDeleteConfirm(null)} style={{ ...btnStyle('#8899bb'), fontSize: 12, padding: '7px 14px' }}>Cancel</button>
                      </>
                    ) : (
                      <button onClick={() => setDeleteConfirm(m.matchno)} style={{ ...btnStyle('#e74c3c'), fontSize: 12, padding: '7px 14px' }}>🗑 Delete</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── PRIZE CALCULATOR (mirrors App.jsx logic) ────────────────
function calcPrizes(m) {
  const paidCount = PLAYERS.filter(p => m.players?.[p]?.joined && m.players?.[p]?.paid).length
  const fee = parseFloat(m.fee) || 0
  const matchNum = parseInt(m.matchno) || 0
  let pot1 = 0, pot2 = 0, winnerCountLimit = 0
  if (matchNum >= 3) {
    if (matchNum >= 26 && paidCount === 5) {
      // From match 26 onwards: 5 paid players → 2 winners (1st gets fee*4, 2nd gets fee*1)
      pot1 = fee * 4; pot2 = fee * 1; winnerCountLimit = 2
    } else if (paidCount >= 2 && paidCount <= 5) { pot1 = fee * paidCount; winnerCountLimit = 1 }
    else if (paidCount === 6) { pot1 = fee * 4; pot2 = fee * 2; winnerCountLimit = 2 }
    else if (paidCount === 7) { pot1 = fee * 5; pot2 = fee * 2; winnerCountLimit = 2 }
  } else {
    pot1 = fee * paidCount
    winnerCountLimit = paidCount >= 1 ? 1 : 0
  }
  const eligiblePaid = PLAYERS
    .filter(p => m.players?.[p]?.paid && m.players?.[p]?.points > 0)
    .map(p => ({ name: p, points: m.players[p].points }))
    .sort((a, b) => b.points - a.points)
  let paidRanks = {}, cr = 1
  eligiblePaid.forEach((p, i) => {
    if (i > 0 && p.points < eligiblePaid[i-1].points) cr++
    paidRanks[p.name] = cr
  })
  const r1Count = eligiblePaid.filter(p => paidRanks[p.name] === 1).length
  const r2Count = eligiblePaid.filter(p => paidRanks[p.name] === 2).length
  return {
    1: r1Count > 0 ? pot1 / r1Count : 0,
    2: (winnerCountLimit === 2 && r2Count > 0) ? pot2 / r2Count : 0,
    winnerCountLimit, totalPool: pot1 + pot2, _paidRanks: paidRanks
  }
}

// ─── TRANSFER TABLE COMPONENT ────────────────────────────────
function TransferTable({ matches, saveToCloud, setMatches, saving }) {
  // Only show completed contest matches that have winners
  const rows = []
  matches.forEach(m => {
    const done = m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—'
    if (!done || m.contest !== 'yes') return
    const prizes = calcPrizes(m)
    const paidRanks = prizes._paidRanks || {}
    PLAYERS.forEach(p => {
      const rank = paidRanks[p]
      const isR1 = rank === 1
      const isR2 = rank === 2 && prizes.winnerCountLimit === 2
      if (!isR1 && !isR2) return
      const prize = isR1 ? prizes[1] : prizes[2]
      if (!prize || prize <= 0) return
      const tVal = m.transferred
      const isDone = typeof tVal === 'object' && tVal !== null
        ? tVal[p] === true
        : tVal === true
      rows.push({ m, player: p, rank: isR1 ? 1 : 2, prize, isDone })
    })
  })

  // Sort: pending first, then by match number desc
  rows.sort((a, b) => {
    if (a.isDone !== b.isDone) return a.isDone ? 1 : -1
    return parseInt(b.m.matchno) - parseInt(a.m.matchno)
  })

  const pendingCount = rows.filter(r => !r.isDone).length
  const doneCount = rows.filter(r => r.isDone).length

  const toggleTransfer = async (m, player) => {
    // Compute new transferred value
    const currentT = m.transferred
    let newT
    if (typeof currentT === 'object' && currentT !== null) {
      newT = { ...currentT, [player]: !currentT[player] }
    } else {
      // Migrate scalar → object keyed by each winner
      const prizes = calcPrizes(m)
      const paidRanks = prizes._paidRanks || {}
      newT = {}
      PLAYERS.forEach(p => {
        const r = paidRanks[p]
        if (r === 1 || (r === 2 && prizes.winnerCountLimit === 2)) {
          if (p === player) {
            newT[p] = !(currentT === true)
          } else {
            newT[p] = currentT === true
          }
        }
      })
    }

    const newMatches = matches.map(mm =>
      String(mm.matchno) === String(m.matchno) ? { ...mm, transferred: newT } : mm
    )
    setMatches(newMatches)
    await saveToCloud(newMatches)
  }

  if (rows.length === 0) return null

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: 3, color: '#f5a623' }}>
          💸 TRANSFER MANAGEMENT
        </div>
        <span style={{ fontSize: 11, background: 'rgba(231,76,60,0.15)', color: '#e74c3c', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 20, padding: '2px 10px', fontWeight: 700 }}>
          {pendingCount} Pending
        </span>
        <span style={{ fontSize: 11, background: 'rgba(46,204,113,0.1)', color: '#2ecc71', border: '1px solid rgba(46,204,113,0.25)', borderRadius: 20, padding: '2px 10px', fontWeight: 700 }}>
          {doneCount} Done
        </span>
      </div>

      <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Rajdhani',sans-serif", fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'rgba(245,166,35,0.08)', borderBottom: '1px solid rgba(245,166,35,0.2)' }}>
              {['Match', 'Date', 'Teams', 'Winner', 'Rank', 'Prize (₹)', 'Status', 'Action'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#f5a623', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const { m, player, rank, prize, isDone } = row
              return (
                <tr key={`${m.matchno}-${player}`} style={{
                  background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  transition: 'background 0.15s'
                }}>
                  <td style={{ padding: '10px 14px', fontWeight: 800, color: '#f5a623' }}>#{m.matchno}</td>
                  <td style={{ padding: '10px 14px', color: '#8899bb', fontSize: 11, whiteSpace: 'nowrap' }}>{m.date || '—'}</td>
                  <td style={{ padding: '10px 14px', color: '#e8eaf6', whiteSpace: 'nowrap' }}>{m.teams || '—'}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: '#e8eaf6' }}>{player}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      background: rank === 1 ? 'rgba(255,215,0,0.15)' : 'rgba(192,192,192,0.15)',
                      color: rank === 1 ? '#FFD700' : '#C0C0C0',
                      border: `1px solid ${rank === 1 ? 'rgba(255,215,0,0.3)' : 'rgba(192,192,192,0.3)'}`
                    }}>
                      {rank === 1 ? '🥇 1st' : '🥈 2nd'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 800, color: '#2ecc71', fontSize: 14 }}>₹{prize.toFixed(2)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {isDone
                      ? <span style={{ fontSize: 11, color: '#2ecc71', background: 'rgba(46,204,113,0.1)', border: '1px solid rgba(46,204,113,0.3)', borderRadius: 6, padding: '3px 10px', fontWeight: 700 }}>✅ Done</span>
                      : <span style={{ fontSize: 11, color: '#e74c3c', background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 6, padding: '3px 10px', fontWeight: 700 }}>⏳ Pending</span>
                    }
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <button
                      onClick={() => toggleTransfer(m, player)}
                      disabled={saving}
                      style={{
                        fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 11,
                        padding: '5px 14px', borderRadius: 7, cursor: saving ? 'wait' : 'pointer',
                        background: isDone ? 'rgba(231,76,60,0.12)' : 'rgba(46,204,113,0.15)',
                        color: isDone ? '#e74c3c' : '#2ecc71',
                        border: `1px solid ${isDone ? 'rgba(231,76,60,0.35)' : 'rgba(46,204,113,0.35)'}`,
                        transition: 'all 0.15s', whiteSpace: 'nowrap',
                        opacity: saving ? 0.6 : 1
                      }}
                    >
                      {saving ? '⏳...' : isDone ? '↩ Mark Pending' : '✅ Mark Done'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {pendingCount === 0 && (
        <div style={{ textAlign: 'center', fontSize: 11, color: '#2ecc71', marginTop: 8, letterSpacing: 1 }}>
          🎉 All payouts transferred!
        </div>
      )}
    </div>
  )
}

// ─── FANTASY TIPS EDITOR ─────────────────────────────────────
function FantasyTipsAdmin({ matches, fantasyData, onFantasyDataSave }) {
  const [localData, setLocalData]           = useState({})
  const [editMatchNo, setEditMatchNo]       = useState(null)
  const [editUrl, setEditUrl]               = useState('')
  const [editNotes, setEditNotes]           = useState('')
  const [saving, setSaving]                 = useState(false)
  const [saveMsg, setSaveMsg]               = useState('')
  const [previewMatchNo, setPreviewMatchNo] = useState(null)
  const [isFullscreen, setIsFullscreen]     = useState(false)

  useEffect(() => { setLocalData(fantasyData || {}) }, [fantasyData])

  const openEdit = (matchNo) => {
    const fd = localData[matchNo] || {}
    setEditMatchNo(matchNo)
    setEditUrl(fd.youtubeUrl || '')
    setEditNotes(fd.notes || '')
    setSaveMsg('')
  }

  const cancelEdit = () => {
    setEditMatchNo(null)
    setEditUrl('')
    setEditNotes('')
    setSaveMsg('')
  }

  const saveToCloud = async (newData) => {
    setSaving(true)
    setSaveMsg('')
    try {
      // Fetch current full bin data
      let binData = {}
      const getRes = await fetch(`${JSONBIN_BASE}/${HARDCODED_BIN_ID}/latest`, {
        headers: { 'X-Bin-Meta': 'false' }
      })
      if (getRes.ok) {
        binData = await getRes.json()
      } else {
        const getRes2 = await fetch(`${JSONBIN_BASE}/${HARDCODED_BIN_ID}/latest`)
        if (getRes2.ok) { const d = await getRes2.json(); binData = d.record || d }
      }

      const updated = { ...binData, fantasyData: newData }

      // Try to get admin key from session for auth
      let headers = { 'Content-Type': 'application/json' }
      try {
        const raw = sessionStorage.getItem('vois_admin_session')
        if (raw) {
          const s = JSON.parse(raw)
          if (s.key) headers['X-Master-Key'] = s.key
        }
      } catch {}

      const putRes = await fetch(`${JSONBIN_BASE}/${HARDCODED_BIN_ID}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updated)
      })
      if (!putRes.ok) throw new Error(`Save failed (${putRes.status}) — check bin permissions`)
      setSaveMsg('✅ Saved successfully! Public page will update on next refresh.')
      onFantasyDataSave(newData)
    } catch (err) {
      setSaveMsg(`❌ ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    if (editMatchNo === null) return
    const newData = {
      ...localData,
      [editMatchNo]: {
        ...(localData[editMatchNo] || {}),
        youtubeUrl: editUrl.trim(),
        notes: editNotes.trim()
      }
    }
    setLocalData(newData)
    await saveToCloud(newData)
  }

  const handleDelete = async (matchNo) => {
    if (!window.confirm(`Remove fantasy data for Match #${matchNo}?`)) return
    const newData = { ...localData }
    delete newData[matchNo]
    setLocalData(newData)
    await saveToCloud(newData)
  }

  const embedId = previewMatchNo ? getYouTubeEmbedId(localData[previewMatchNo]?.youtubeUrl || '') : null

  return (
    <div style={{ padding: '16px 20px', color: '#e8eaf6', fontFamily: "'Rajdhani', sans-serif" }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 3, color: '#f5a623', marginBottom: 4 }}>
        🎯 FANTASY TIPS MANAGER
      </div>
      <div style={{ fontSize: 12, color: '#8899bb', marginBottom: 20 }}>
        Add YouTube video URLs and match notes for upcoming matches. Only upcoming (not yet started) matches with a YouTube URL will be visible to the public.
      </div>

      {matches.length === 0 && (
        <div style={{ fontSize: 12, color: '#8899bb', padding: 24, textAlign: 'center', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 10 }}>
          No matches loaded. Switch to Match Log tab to ensure data is connected.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {matches.map(m => {
          const mn = parseInt(m.matchno)
          const fd = localData[mn] || {}
          const done = m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—'
          const isEditing = editMatchNo === mn
          const hasUrl = !!fd.youtubeUrl
          const hasNotes = !!fd.notes

          return (
            <div key={mn} style={{
              background: isEditing ? 'rgba(245,166,35,0.08)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isEditing ? 'rgba(245,166,35,0.4)' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 10, overflow: 'hidden'
            }}>
              {/* Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', flexWrap: 'wrap' }}>
                <span style={{
                  background: done ? 'rgba(46,204,113,0.15)' : 'rgba(245,166,35,0.15)',
                  color: done ? '#2ecc71' : '#f5a623',
                  border: `1px solid ${done ? 'rgba(46,204,113,0.3)' : 'rgba(245,166,35,0.3)'}`,
                  borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700
                }}>#{mn}</span>

                <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{m.teams || '—'}</span>
                <span style={{ fontSize: 11, color: '#8899bb' }}>
                  {formatDate(m.date)}{m.matchTime ? ' · ' + formatMatchTimeLabel(m.matchTime) : ''}
                </span>
                {done && <span style={{ fontSize: 10, color: '#2ecc71', background: 'rgba(46,204,113,0.1)', borderRadius: 4, padding: '2px 6px' }}>✅ Completed</span>}

                <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexShrink: 0 }}>
                  {hasUrl && !isEditing && (
                    <button onClick={() => setPreviewMatchNo(previewMatchNo === mn ? null : mn)} style={btnStyle('#3498db')}>
                      {previewMatchNo === mn ? '✕ Close' : '▶ Preview'}
                    </button>
                  )}
                  {!isEditing && (
                    <button onClick={() => openEdit(mn)} style={btnStyle('#f5a623')}>
                      ✏️ {hasUrl ? 'Edit' : 'Add'} Fantasy
                    </button>
                  )}
                  {hasUrl && !isEditing && (
                    <button onClick={() => handleDelete(mn)} style={btnStyle('#e74c3c')}>🗑</button>
                  )}
                </div>
              </div>

              {/* Status chips */}
              {(hasUrl || hasNotes) && !isEditing && (
                <div style={{ padding: '0 14px 10px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {hasUrl && <span style={chipStyle('#3498db')}>📺 YouTube linked</span>}
                  {hasNotes && <span style={chipStyle('#2ecc71')}>📋 Notes added</span>}
                  {!hasNotes && hasUrl && <span style={chipStyle('#e74c3c')}>⚠️ No notes yet</span>}
                </div>
              )}

              {/* Edit form */}
              {isEditing && (
                <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>📺 YouTube Video URL</label>
                    <input
                      value={editUrl}
                      onChange={e => setEditUrl(e.target.value)}
                      placeholder="https://youtu.be/XXXXXXXXXXX or https://youtube.com/watch?v=..."
                      style={inputStyle}
                    />
                    {editUrl && getYouTubeEmbedId(editUrl) && (
                      <div style={{ fontSize: 10, color: '#2ecc71', marginTop: 4 }}>✅ Valid YouTube URL — ID: {getYouTubeEmbedId(editUrl)}</div>
                    )}
                    {editUrl && !getYouTubeEmbedId(editUrl) && (
                      <div style={{ fontSize: 10, color: '#e74c3c', marginTop: 4 }}>⚠️ Could not parse YouTube video ID — check URL format</div>
                    )}
                  </div>

                  <div>
                    <label style={labelStyle}>
                      📋 Fantasy Notes
                      <span style={{ fontSize: 10, fontWeight: 400, color: '#8899bb', marginLeft: 8 }}>
                        paste your generated summary here
                      </span>
                    </label>
                    <textarea
                      value={editNotes}
                      onChange={e => setEditNotes(e.target.value)}
                      placeholder={`🏟️ PITCH & CONDITIONS\nEkana Stadium, Lucknow. Batting-friendly pitch...\n\n🔥 KEY PLAYERS TO PICK\n• Jos Buttler (GT) — ...\n\n👑 CAPTAIN & VICE-CAPTAIN\nCaptain: Buttler | VC: Sudarshan`}
                      rows={14}
                      style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }}
                    />
                    <div style={{ fontSize: 10, color: '#8899bb', marginTop: 4 }}>
                      {editNotes.length} characters · {editNotes.split('\n').length} lines
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      onClick={handleSave}
                      disabled={saving || (!editUrl.trim() && !editNotes.trim())}
                      style={{
                        ...btnStyle('#2ecc71'), fontSize: 13, padding: '9px 20px',
                        opacity: (saving || (!editUrl.trim() && !editNotes.trim())) ? 0.5 : 1
                      }}
                    >
                      {saving ? '⏳ Saving to Cloud...' : '💾 Save to Cloud'}
                    </button>
                    <button onClick={cancelEdit} style={{ ...btnStyle('#8899bb'), fontSize: 13, padding: '9px 16px' }}>
                      ✕ Cancel
                    </button>
                    {saveMsg && (
                      <span style={{ fontSize: 11, color: saveMsg.startsWith('✅') ? '#2ecc71' : '#e74c3c' }}>
                        {saveMsg}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Video preview inline */}
              {previewMatchNo === mn && embedId && !isEditing && (
                <div style={{ padding: '0 14px 14px' }}>
                  <div style={{
                    position: isFullscreen ? 'fixed' : 'relative',
                    inset: isFullscreen ? 0 : 'auto',
                    zIndex: isFullscreen ? 9999 : 'auto',
                    width: '100%',
                    paddingBottom: isFullscreen ? 0 : '56.25%',
                    height: isFullscreen ? '100vh' : 0,
                    background: '#000',
                    borderRadius: isFullscreen ? 0 : 10,
                    overflow: 'hidden',
                    border: '1px solid rgba(231,76,60,0.3)'
                  }}>
                    {isFullscreen && (
                      <button
                        onClick={() => setIsFullscreen(false)}
                        style={{ position: 'absolute', top: 12, right: 12, zIndex: 10001, background: 'rgba(0,0,0,0.8)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700 }}
                      >✕ Exit</button>
                    )}
                    <iframe
                      src={`https://www.youtube.com/embed/${embedId}?rel=0&modestbranding=1`}
                      style={{ position: isFullscreen ? 'static' : 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen title="Preview"
                    />
                  </div>
                  {!isFullscreen && (
                    <button onClick={() => setIsFullscreen(true)} style={{ ...btnStyle('#e74c3c'), marginTop: 8 }}>⛶ Fullscreen Preview</button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ background: 'rgba(52,152,219,0.06)', border: '1px dashed rgba(52,152,219,0.25)', borderRadius: 10, padding: '12px 16px', fontSize: 11, color: '#8899bb', lineHeight: 1.8 }}>
        <div style={{ color: '#3498db', fontWeight: 700, marginBottom: 4, fontSize: 12 }}>💡 Workflow</div>
        <div>1. Before a match: paste the YouTube video link + paste notes generated from Claude chat</div>
        <div>2. Click <b style={{ color: '#2ecc71' }}>Save to Cloud</b> — stored in JSONBin with all match data</div>
        <div>3. Public page auto-shows tips for <b style={{ color: '#f5a623' }}>upcoming matches only</b> — hides once match starts/completes</div>
        <div>4. To generate notes: paste the YouTube transcript in Claude chat → get summary → paste here</div>
      </div>
    </div>
  )
}

// ─── HIGHLIGHTS ADMIN ────────────────────────────────────────
function detectType(url) {
  if (!url) return 'unknown'
  if (url.includes('instagram.com')) return 'instagram'
  if (url.includes('youtube.com/shorts')) return 'youtube_shorts'
  if (url.includes('youtu.be') || url.includes('youtube.com')) return 'youtube'
  return 'unknown'
}

function getIgShortcode(url) {
  if (!url) return null
  const clean = url.split('?')[0].replace(/\/$/, '')
  const m = clean.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)
  return m ? m[1] : null
}

function getYtId(url) {
  if (!url) return null
  const s = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/)
  if (s) return s[1]
  const b = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
  if (b) return b[1]
  const v = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
  if (v) return v[1]
  return null
}

// Per-match row component — has its own isolated form state
function MatchHighlightRow({ m, clips, saving, onAdd, onEdit, onRemove }) {
  const mn = parseInt(m.matchno)
  const done = m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—'
  const [isOpen, setIsOpen]       = useState(false)
  const [addUrl, setAddUrl]       = useState('')
  const [addLabel, setAddLabel]   = useState('')
  const [editIdx, setEditIdx]     = useState(null)
  const [editUrl, setEditUrl]     = useState('')
  const [editLabel, setEditLabel] = useState('')
  const [previewIdx, setPreviewIdx] = useState(null)

  const handleAdd = () => {
    if (!addUrl.trim()) return
    onAdd(mn, { type: detectType(addUrl.trim()), url: addUrl.trim(), label: addLabel.trim() || 'Highlight' })
    setAddUrl(''); setAddLabel('')
  }

  const startEdit = (i) => {
    setEditIdx(i); setEditUrl(clips[i].url); setEditLabel(clips[i].label || '')
  }
  const cancelEdit = () => { setEditIdx(null); setEditUrl(''); setEditLabel('') }
  const saveEdit = () => {
    if (!editUrl.trim()) return
    onEdit(mn, editIdx, { type: detectType(editUrl.trim()), url: editUrl.trim(), label: editLabel.trim() || 'Highlight' })
    cancelEdit()
  }

  return (
    <div style={{
      background: isOpen ? 'rgba(245,166,35,0.05)' : 'rgba(255,255,255,0.02)',
      border: `1px solid ${isOpen ? 'rgba(245,166,35,0.3)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 10, overflow: 'hidden',
    }}>
      {/* Header row */}
      <div onClick={() => setIsOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', flexWrap: 'wrap' }}>
        <span style={{
          background: done ? 'rgba(46,204,113,0.15)' : 'rgba(245,166,35,0.15)',
          color: done ? '#2ecc71' : '#f5a623',
          border: `1px solid ${done ? 'rgba(46,204,113,0.3)' : 'rgba(245,166,35,0.3)'}`,
          borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, flexShrink: 0,
        }}>#{mn}</span>
        <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{m.teams || '—'}</span>
        <span style={{ fontSize: 11, color: '#8899bb' }}>
          {m.date ? new Date(m.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : ''}
        </span>
        {clips.length > 0 && (
          <span style={{ fontSize: 10, background: 'rgba(245,166,35,0.15)', color: '#f5a623', borderRadius: 10, padding: '2px 8px', fontWeight: 700 }}>
            {clips.length} clip{clips.length !== 1 ? 's' : ''}
          </span>
        )}
        <span style={{ fontSize: 12, color: '#8899bb' }}>{isOpen ? '▲' : '▼'}</span>
      </div>

      {isOpen && (
        <div style={{ padding: '0 14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ── Existing clips list ── */}
          {clips.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, color: '#8899bb', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>
                Saved Clips ({clips.length})
              </div>
              {clips.map((c, i) => {
                const t = c.type || detectType(c.url)
                const isIg = t === 'instagram'
                const isEditing = editIdx === i
                const isPreviewing = previewIdx === i

                return (
                  <div key={i} style={{ background: 'rgba(0,0,0,0.35)', border: `1px solid ${isEditing ? 'rgba(245,166,35,0.4)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 9, overflow: 'hidden' }}>

                    {/* Clip row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 900, letterSpacing: 1, flexShrink: 0,
                        background: isIg ? 'linear-gradient(45deg,#f09433,#dc2743,#bc1888)' : '#e74c3c',
                        color: '#fff',
                      }}>{isIg ? '📸 IG' : t === 'youtube_shorts' ? '▶ YT SHORT' : '▶ YT'}</span>

                      <span style={{ fontWeight: 700, fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.label || `Clip ${i + 1}`}
                      </span>

                      <a href={c.url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#8899bb', textDecoration: 'none', flexShrink: 0 }}>↗</a>

                      {!isEditing && (
                        <>
                          <button onClick={() => setPreviewIdx(isPreviewing ? null : i)} style={btnStyle('#3498db')}>
                            {isPreviewing ? '✕ Hide' : '👁 Preview'}
                          </button>
                          <button onClick={() => { startEdit(i); setPreviewIdx(null) }} style={btnStyle('#f5a623')}>✏️ Edit</button>
                          <button onClick={() => onRemove(mn, i)} style={btnStyle('#e74c3c')}>🗑 Delete</button>
                        </>
                      )}
                    </div>

                    {/* Edit form inline */}
                    {isEditing && (
                      <div style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid rgba(245,166,35,0.2)' }}>
                        <div>
                          <label style={labelStyle}>Label</label>
                          <input value={editLabel} onChange={e => setEditLabel(e.target.value)} style={inputStyle} placeholder="Clip title..." />
                        </div>
                        <div>
                          <label style={labelStyle}>URL</label>
                          <input value={editUrl} onChange={e => setEditUrl(e.target.value)} style={inputStyle} placeholder="Instagram or YouTube URL" />
                          {editUrl && (
                            <div style={{ fontSize: 10, marginTop: 3, color: detectType(editUrl) !== 'unknown' ? '#2ecc71' : '#e74c3c' }}>
                              {detectType(editUrl) === 'instagram' && '✅ Instagram Reel'}
                              {detectType(editUrl) === 'youtube_shorts' && '✅ YouTube Short'}
                              {detectType(editUrl) === 'youtube' && '✅ YouTube Video'}
                              {detectType(editUrl) === 'unknown' && '⚠️ Unknown format'}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={saveEdit} disabled={saving || !editUrl.trim()} style={{ ...btnStyle('#2ecc71'), opacity: !editUrl.trim() ? 0.5 : 1 }}>
                            {saving ? '⏳ Saving...' : '💾 Save Edit'}
                          </button>
                          <button onClick={cancelEdit} style={btnStyle('#8899bb')}>✕ Cancel</button>
                        </div>
                      </div>
                    )}

                    {/* Preview panel */}
                    {isPreviewing && !isEditing && (
                      <div style={{ padding: '0 10px 10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        {isIg ? (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 11, color: '#f09433', marginBottom: 6, fontWeight: 700 }}>
                              ⚠️ Instagram reels cannot autoplay in embedded iframes due to Instagram's restrictions.
                            </div>
                            <div style={{ fontSize: 11, color: '#8899bb', marginBottom: 8 }}>
                              Shortcode: <b style={{ color: '#e8eaf6' }}>{getIgShortcode(c.url) || 'could not parse'}</b>
                              &nbsp;·&nbsp; The public page shows an "Open on Instagram" button for reels.
                            </div>
                            <a href={c.url} target="_blank" rel="noreferrer" style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '8px 16px', borderRadius: 8, textDecoration: 'none',
                              background: 'linear-gradient(45deg,rgba(240,148,51,0.2),rgba(188,24,136,0.2))',
                              border: '1px solid rgba(240,148,51,0.4)', color: '#f09433',
                              fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12,
                            }}>↗ Open Reel on Instagram</a>
                          </div>
                        ) : (
                          (() => {
                            const ytId = getYtId(c.url)
                            return ytId ? (
                              <div style={{ marginTop: 10, position: 'relative', width: '100%', paddingBottom: t === 'youtube_shorts' ? '177.78%' : '56.25%', height: 0, borderRadius: 8, overflow: 'hidden', background: '#000' }}>
                                <iframe
                                  src={`https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1`}
                                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen title={c.label || 'Preview'}
                                />
                              </div>
                            ) : <div style={{ color: '#e74c3c', fontSize: 11, padding: 8 }}>⚠️ Could not parse YouTube ID</div>
                          })()
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Add new clip form ── */}
          <div style={{ background: 'rgba(46,204,113,0.04)', border: '1px solid rgba(46,204,113,0.2)', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, color: '#2ecc71', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
              ➕ Add New Clip to Match #{mn}
            </div>
            <div>
              <label style={labelStyle}>Label / Title</label>
              <input value={addLabel} onChange={e => setAddLabel(e.target.value)} placeholder="e.g. Kohli's 6 sixes, Bumrah hat-trick..." style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>URL (Instagram Reel or YouTube Short)</label>
              <input value={addUrl} onChange={e => setAddUrl(e.target.value)} placeholder="https://www.instagram.com/reel/... or https://youtube.com/shorts/..." style={inputStyle} />
              {addUrl && (
                <div style={{ fontSize: 10, marginTop: 4, color: detectType(addUrl) !== 'unknown' ? '#2ecc71' : '#e74c3c' }}>
                  {detectType(addUrl) === 'instagram' && '✅ Instagram Reel detected'}
                  {detectType(addUrl) === 'youtube_shorts' && '✅ YouTube Short detected'}
                  {detectType(addUrl) === 'youtube' && '✅ YouTube Video detected'}
                  {detectType(addUrl) === 'unknown' && '⚠️ Unknown format — paste an Instagram or YouTube link'}
                </div>
              )}
            </div>
            <button
              onClick={handleAdd}
              disabled={saving || !addUrl.trim()}
              style={{ ...btnStyle('#2ecc71'), fontSize: 13, padding: '9px 20px', width: 'fit-content', opacity: (!addUrl.trim() || saving) ? 0.5 : 1 }}
            >
              {saving ? '⏳ Saving to Cloud...' : '➕ Add Clip'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function HighlightsAdmin({ matches, highlightsData, onHighlightsDataSave }) {
  const [localData, setLocalData] = useState({})
  const [saving, setSaving]       = useState(false)
  const [saveMsg, setSaveMsg]     = useState('')

  useEffect(() => { setLocalData(highlightsData || {}) }, [highlightsData])

  const saveToCloud = async (newData) => {
    setSaving(true); setSaveMsg('')
    try {
      let binData = {}
      const getRes = await fetch(`${JSONBIN_BASE}/${HARDCODED_BIN_ID}/latest`, { headers: { 'X-Bin-Meta': 'false' } })
      if (getRes.ok) { binData = await getRes.json() }
      else {
        const r2 = await fetch(`${JSONBIN_BASE}/${HARDCODED_BIN_ID}/latest`)
        if (r2.ok) { const d = await r2.json(); binData = d.record || d }
      }
      const updated = { ...binData, highlightsData: newData }
      let headers = { 'Content-Type': 'application/json' }
      try {
        const raw = sessionStorage.getItem('vois_admin_session')
        if (raw) { const s = JSON.parse(raw); if (s.key) headers['X-Master-Key'] = s.key }
      } catch {}
      const putRes = await fetch(`${JSONBIN_BASE}/${HARDCODED_BIN_ID}`, { method: 'PUT', headers, body: JSON.stringify(updated) })
      if (!putRes.ok) throw new Error(`Save failed (${putRes.status})`)
      setSaveMsg('✅ Saved! Public page updates on next refresh.')
      onHighlightsDataSave(newData)
    } catch (err) { setSaveMsg(`❌ ${err.message}`) }
    finally { setSaving(false) }
  }

  const handleAdd = async (mn, clip) => {
    const existing = localData[mn] || []
    const newData = { ...localData, [mn]: [...existing, clip] }
    setLocalData(newData)
    await saveToCloud(newData)
  }

  const handleEdit = async (mn, idx, clip) => {
    const existing = [...(localData[mn] || [])]
    existing[idx] = clip
    const newData = { ...localData, [mn]: existing }
    setLocalData(newData)
    await saveToCloud(newData)
  }

  const handleRemove = async (mn, idx) => {
    if (!window.confirm('Delete this clip?')) return
    const existing = [...(localData[mn] || [])]
    existing.splice(idx, 1)
    const newData = { ...localData, [mn]: existing }
    if (existing.length === 0) delete newData[mn]
    setLocalData(newData)
    await saveToCloud(newData)
  }

  return (
    <div style={{ padding: '16px 20px', color: '#e8eaf6', fontFamily: "'Rajdhani', sans-serif" }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 3, color: '#f5a623', marginBottom: 4 }}>
        🎬 HIGHLIGHTS MANAGER
      </div>
      <div style={{ fontSize: 12, color: '#8899bb', marginBottom: 12 }}>
        Add Instagram Reels &amp; YouTube Shorts per match. Each match can have unlimited clips. Click a match to expand and manage its clips.
      </div>

      {saveMsg && (
        <div style={{ fontSize: 12, marginBottom: 12, padding: '8px 12px', borderRadius: 8, color: saveMsg.startsWith('✅') ? '#2ecc71' : '#e74c3c', background: saveMsg.startsWith('✅') ? 'rgba(46,204,113,0.08)' : 'rgba(231,76,60,0.08)', border: `1px solid ${saveMsg.startsWith('✅') ? 'rgba(46,204,113,0.3)' : 'rgba(231,76,60,0.3)'}` }}>
          {saveMsg}
        </div>
      )}

      {matches.length === 0 ? (
        <div style={{ fontSize: 12, color: '#8899bb', padding: 24, textAlign: 'center', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 10 }}>No matches loaded.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {[...matches].sort((a, b) => parseInt(b.matchno) - parseInt(a.matchno)).map(m => (
            <MatchHighlightRow
              key={m.matchno}
              m={m}
              clips={localData[parseInt(m.matchno)] || []}
              saving={saving}
              onAdd={handleAdd}
              onEdit={handleEdit}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}

      <div style={{ marginTop: 16, background: 'rgba(52,152,219,0.06)', border: '1px dashed rgba(52,152,219,0.25)', borderRadius: 10, padding: '12px 16px', fontSize: 11, color: '#8899bb', lineHeight: 1.9 }}>
        <div style={{ color: '#3498db', fontWeight: 700, marginBottom: 4, fontSize: 12 }}>💡 Notes</div>
        <div>• Click any match row to expand → add, edit or delete clips</div>
        <div>• <b style={{ color: '#f09433' }}>Instagram reels</b> cannot autoplay inside other websites (Instagram's restriction) — users will see an "Open on Instagram" button to watch in the app</div>
        <div>• <b style={{ color: '#e74c3c' }}>YouTube Shorts/Videos</b> embed and play directly in-app ✅</div>
        <div>• Highlights tab only shows on public page when at least 1 clip exists</div>
      </div>
    </div>
  )
}

// ─── MAIN ADMIN PAGE ─────────────────────────────────────────
export default function AdminPage({ onLogout, matches = [], fantasyData = {}, onFantasyDataSave, highlightsData = {}, onHighlightsDataSave, onMatchesSave }) {
  const [activeTab, setActiveTab] = useState('matchlog')

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
      <div style={styles.topBar}>
        <div style={styles.topLeft}>
          <span style={styles.adminBadge}>🔐 ADMIN MODE</span>
          <span style={styles.sessionInfo}>Session active · auto-expires in 2h</span>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'matchlog',   label: '📋 Match Log' },
            { id: 'fantasy',    label: '🎯 Fantasy Tips' },
            { id: 'highlights', label: '🎬 Highlights' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
                fontSize: 12, letterSpacing: 1, padding: '5px 14px',
                borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
                background: activeTab === tab.id ? 'rgba(245,166,35,0.2)' : 'rgba(255,255,255,0.05)',
                border: activeTab === tab.id ? '1px solid rgba(245,166,35,0.5)' : '1px solid rgba(255,255,255,0.1)',
                color: activeTab === tab.id ? '#f5a623' : '#8899bb',
              }}
            >{tab.label}</button>
          ))}
        </div>

        <div style={styles.topRight}>
          <button onClick={handleLogout} style={styles.logoutBtn}>🚪 Logout</button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', background: '#0a0f1e', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'matchlog' ? (
          <MatchLogAdmin
            matches={matches}
            onMatchesSave={onMatchesSave}
          />
        ) : activeTab === 'fantasy' ? (
          <FantasyTipsAdmin
            matches={matches}
            fantasyData={fantasyData}
            onFantasyDataSave={onFantasyDataSave || (() => {})}
          />
        ) : (
          <HighlightsAdmin
            matches={matches}
            highlightsData={highlightsData}
            onHighlightsDataSave={onHighlightsDataSave || (() => {})}
          />
        )}
      </div>
    </div>
  )
}

const styles = {
  wrapper: {
    position: 'fixed', inset: 0, zIndex: 8000,
    display: 'flex', flexDirection: 'column', background: '#0a0f1e',
  },
  topBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 20px', flexShrink: 0, flexWrap: 'wrap', gap: 10,
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
    fontFamily: "'Rajdhani', sans-serif", fontSize: 11, color: '#8899bb', letterSpacing: 1,
  },
  topRight: {},
  logoutBtn: {
    fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: 1,
    padding: '6px 16px', borderRadius: 8,
    background: 'rgba(231,76,60,0.15)', color: '#e74c3c',
    border: '1px solid rgba(231,76,60,0.4)', cursor: 'pointer', transition: 'all 0.2s',
  },
}
