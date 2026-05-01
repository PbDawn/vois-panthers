// ═══════════════════════════════════════════════════════════════
// AdminPage.jsx — Admin Panel with Fantasy Tips Editor
//
// CHANGES:
//  1. Added new "🔮 Predictions" tab — PredictionAdmin component
//  2. PredictionAdmin lets admin enter actual session scores per match
//     and auto-computes winners + saves to PRED_BIN_ID (separate bin)
//  3. Results ONLY appear on public PredictionTab once admin saves actuals
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react'

const JSONBIN_BASE     = 'https://api.jsonbin.io/v3/b'
const HARDCODED_BIN_ID = '69c84b985fdde574550bf9f7'   // main app bin
const PRED_BIN_ID      = '69f4599e856a6821899363fd'   // prediction bin (same as PredictionTab.jsx)
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

  const getSponsorTotal = (player) => {
    const pd = form.players[player]
    if (!pd?.sponsored) return 0
    return (pd.sponsorDetails || []).reduce((s, d) => s + (parseFloat(d.amount) || 0), 0)
  }
  const getRemaining = (player) => {
    const fee = parseFloat(form.fee) || 0
    return fee - getSponsorTotal(player)
  }

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
      if (checked) { pd.paid = true }
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

  // ── calcPrizes helper (copied from MatchLog in App.jsx for transfer management) ──
  function calcPrizes(m) {
    const joined = PLAYERS.filter(p => m.players?.[p]?.joined && m.players?.[p]?.paid)
    const n = joined.length
    const pool = n * (m.fee || 0)
    const winnerCountLimit = n >= 5 ? 2 : 1
    const paidRanks = m.joinedRanks || {}
    const prize1 = winnerCountLimit === 2 ? parseFloat((pool * 0.65).toFixed(2)) : pool
    const prize2 = winnerCountLimit === 2 ? parseFloat((pool * 0.35).toFixed(2)) : 0
    return { 1: prize1, 2: prize2, winnerCountLimit, pool, _paidRanks: paidRanks }
  }

  return (
    <div style={{ padding: '16px 20px', color: '#e8eaf6', fontFamily: "'Rajdhani', sans-serif", maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(245,166,35,0.25)', borderRadius: 14, padding: '20px 24px', marginBottom: 24 }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 3, color: '#f5a623', marginBottom: 16 }}>
          {editMatchno ? `✏️ EDITING MATCH #${editMatchno}` : '➕ ADD / EDIT MATCH'}
        </div>

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

        {form.contest === 'yes' && (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#f5a623', marginBottom: 6, textTransform: 'uppercase' }}>Player Details</div>
            <div style={{ fontSize: 11, color: '#8899bb', marginBottom: 12 }}>
              ✅ Joined = played the contest &nbsp;|&nbsp; 💰 Paid = paid the match fee &nbsp;|&nbsp; 🎁 Sponsored = someone else paid
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
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
                      <input type="checkbox" checked={pd.joined} onChange={e => handleJoined(player, e.target.checked)}
                        style={{ width: 16, height: 16, accentColor: '#f5a623' }} />
                      <span style={{ fontWeight: 800, fontSize: 14, color: pd.joined ? '#e8eaf6' : '#8899bb' }}>{player}</span>
                    </label>

                    {pd.joined && (
                      <>
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

                        {pd.sponsored && (
                          <div style={{ background: 'rgba(155,89,182,0.1)', border: '1px solid rgba(155,89,182,0.25)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                            <div style={{ fontSize: 10, color: '#c39bd3', fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>
                              SPONSOR DETAILS
                            </div>
                            {(pd.sponsorDetails || []).map((sd, idx) => (
                              <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                                <select
                                  value={sd.sponsor}
                                  onChange={e => handleSponsorDetail(player, idx, 'sponsor', e.target.value)}
                                  style={{ ...inputStyle, flex: 2, fontSize: 11 }}
                                >
                                  <option value="">— Sponsor —</option>
                                  {otherPlayers.map(op => <option key={op} value={op}>{op}</option>)}
                                </select>
                                <input
                                  type="number" placeholder="₹" min="0"
                                  value={sd.amount}
                                  onChange={e => handleSponsorDetail(player, idx, 'amount', e.target.value)}
                                  style={{ ...inputStyle, flex: 1, fontSize: 11 }}
                                />
                                <button onClick={() => removeSponsorRow(player, idx)} style={{ ...btnStyle('#e74c3c'), padding: '4px 8px' }}>✕</button>
                              </div>
                            ))}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                              <button onClick={() => addSponsorRow(player)} style={{ ...btnStyle('#9b59b6'), fontSize: 10 }}>+ Add Sponsor</button>
                              {sponsorTotal > 0 && (
                                <span style={{ fontSize: 10, color: remaining <= 0 ? '#2ecc71' : '#e74c3c' }}>
                                  Covered: ₹{sponsorTotal} / ₹{fee} {remaining <= 0 ? '✅' : `(₹${remaining} short)`}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        <div>
                          <label style={{ ...labelStyle, fontSize: 10 }}>Points</label>
                          <input
                            type="number" step="0.01" min="0"
                            value={pd.points}
                            onChange={e => setForm(f => ({ ...f, players: { ...f.players, [player]: { ...f.players[player], points: e.target.value } } }))}
                            style={{ ...inputStyle, fontSize: 13, fontWeight: 700 }}
                            placeholder="0.00"
                          />
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={handleSaveMatch}
            disabled={saving}
            style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 800, fontSize: 14, padding: '10px 24px', borderRadius: 10, cursor: 'pointer', background: 'rgba(245,166,35,0.2)', color: '#f5a623', border: '1px solid rgba(245,166,35,0.5)', opacity: saving ? 0.6 : 1 }}
          >{saving ? '⏳ Saving...' : editMatchno ? '💾 Update Match' : '➕ Add Match'}</button>
          {editMatchno && (
            <button onClick={clearForm} style={{ ...btnStyle('#8899bb'), fontSize: 12, padding: '9px 16px' }}>✕ Cancel Edit</button>
          )}
          {saveMsg && <span style={{ fontSize: 12, color: saveMsg.startsWith('✅') ? '#2ecc71' : '#e74c3c' }}>{saveMsg}</span>}
        </div>
      </div>

      {/* Match list */}
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 3, color: '#f5a623', marginBottom: 12 }}>
        📋 MATCH LIST ({matches.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[...matches].sort((a,b) => parseInt(b.matchno) - parseInt(a.matchno)).map(m => {
          const prizes = calcPrizes(m)
          const isExpanded = expandedMatch === m.matchno
          return (
            <div key={m.matchno} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => setExpandedMatch(isExpanded ? null : m.matchno)}>
                <span style={{ fontWeight: 800, color: '#f5a623', fontSize: 13 }}>#{m.matchno}</span>
                <span style={{ fontWeight: 700, flex: 1 }}>{m.teams || '—'}</span>
                <span style={{ fontSize: 11, color: '#8899bb' }}>{formatDate(m.date)}</span>
                {m.teamwon && <span style={chipStyle('#2ecc71')}>✅ {m.teamwon}</span>}
                <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => loadMatch(m)} style={btnStyle('#f5a623')}>✏️ Edit</button>
                  {deleteConfirm === m.matchno ? (
                    <>
                      <button onClick={() => handleDeleteMatch(m.matchno)} style={btnStyle('#e74c3c')}>✅ Confirm</button>
                      <button onClick={() => setDeleteConfirm(null)} style={btnStyle('#8899bb')}>✕</button>
                    </>
                  ) : (
                    <button onClick={() => setDeleteConfirm(m.matchno)} style={btnStyle('#e74c3c')}>🗑</button>
                  )}
                </div>
                <span style={{ color: '#8899bb', fontSize: 11 }}>{isExpanded ? '▲' : '▼'}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── PREDICTION ADMIN ────────────────────────────────────────
// Lets admin enter actual session results for completed matches
// and auto-computes + saves winners to the PRED_BIN_ID bin

const SESSION_COUNT = 5
const BASE_BET = 10

function getTeams(m) {
  if (!m?.teams) return ['Team 1', 'Team 2']
  const parts = m.teams.split(' vs ').map(s => s.trim())
  return parts.length === 2 ? parts : [parts[0] || 'Team 1', parts[1] || 'Team 2']
}

function calcSessionResult(joined, predictions, sessionKey, actual, betPerPerson) {
  const participants = joined.filter(p => predictions[p]?.[sessionKey] !== undefined)
  if (participants.length === 0) return { winners: [], losers: [], each: 0, noWinner: true, refund: false, carryForwardAmount: betPerPerson * joined.length }

  const pool = betPerPerson * participants.length
  let winners = []

  if (sessionKey === 's1' || sessionKey === 's5') {
    const correctTeam = actual.team
    const correct = participants.filter(p => predictions[p][sessionKey]?.team === correctTeam)
    const allSame = new Set(participants.map(p => predictions[p][sessionKey]?.team)).size === 1
    if (allSame) {
      if (correct.length === participants.length) {
        return { winners: [], losers: [], each: 0, noWinner: true, refund: sessionKey === 's5', carryForwardAmount: pool }
      } else {
        if (sessionKey === 's5') return { winners: [], losers: [], each: 0, noWinner: true, refund: true, carryForwardAmount: 0, pool }
        return { winners: [], losers: [], each: 0, noWinner: true, refund: false, carryForwardAmount: pool }
      }
    }
    winners = correct
    if (winners.length === 0) {
      if (sessionKey === 's5') return { winners: [], losers: [], each: 0, noWinner: true, refund: true, carryForwardAmount: 0, pool }
      return { winners: [], losers: [], each: 0, noWinner: true, refund: false, carryForwardAmount: pool }
    }
  } else {
    const actualRuns = actual.runs
    const diffs = participants.map(p => ({
      p, runDiff: Math.abs((predictions[p][sessionKey]?.runs || 0) - actualRuns),
      predWkts: predictions[p][sessionKey]?.wkts || 0
    }))
    const minDiff = Math.min(...diffs.map(d => d.runDiff))
    let closest = diffs.filter(d => d.runDiff === minDiff)
    const minWkt = Math.min(...closest.map(d => d.predWkts))
    winners = closest.filter(d => d.predWkts === minWkt).map(d => d.p)
  }

  const losers = participants.filter(p => !winners.includes(p))
  const each = winners.length > 0 ? pool / winners.length : 0
  return { winners, losers, each: parseFloat(each.toFixed(2)), noWinner: winners.length === 0, refund: false, carryForwardAmount: 0, pool }
}

function emptyActuals() {
  return {
    s1: { team: '' },
    s2: { runs: '', wkts: '' },
    s3: { runs: '', wkts: '' },
    s4: { runs: '', wkts: '' },
    s5: { team: '' },
  }
}

async function fetchPredBin() {
  try {
    const r = await fetch(`${JSONBIN_BASE}/${PRED_BIN_ID}/latest`, { headers: { 'X-Bin-Meta': 'false' } })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const d = await r.json()
    return d.predictions || {}
  } catch (e) {
    console.error('PredFetch:', e)
    return null
  }
}

async function savePredBin(predictions) {
  const r = await fetch(`${JSONBIN_BASE}/${PRED_BIN_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ predictions })
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return true
}

function PredictionAdmin({ matches }) {
  const completedMatches = matches.filter(m => m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—')
    .sort((a, b) => parseInt(b.matchno) - parseInt(a.matchno))

  const [allPredData, setAllPredData] = useState(null) // null = not loaded yet
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [selectedMatch, setSelectedMatch] = useState(null) // matchno string
  const [actuals, setActuals] = useState(emptyActuals())
  const [preview, setPreview] = useState(null) // computed results preview

  const loadPredData = async () => {
    setLoading(true)
    setSaveMsg('')
    const data = await fetchPredBin()
    if (data === null) {
      setSaveMsg('❌ Could not load prediction bin. Check PRED_BIN_ID.')
    } else {
      setAllPredData(data)
      setSaveMsg('')
    }
    setLoading(false)
  }

  useEffect(() => { loadPredData() }, [])

  const selectMatch = (matchno) => {
    setSelectedMatch(matchno)
    setPreview(null)
    setSaveMsg('')
    // Pre-fill actuals if already saved
    const existing = allPredData?.[matchno]?.actuals
    if (existing) {
      setActuals({
        s1: existing.s1 || { team: '' },
        s2: existing.s2 || { runs: '', wkts: '' },
        s3: existing.s3 || { runs: '', wkts: '' },
        s4: existing.s4 || { runs: '', wkts: '' },
        s5: existing.s5 || { team: '' },
      })
    } else {
      setActuals(emptyActuals())
    }
  }

  const computePreview = () => {
    if (!selectedMatch || !allPredData) return
    const mpData = allPredData[selectedMatch] || {}
    const playerPredictions = mpData.playerPredictions || {}
    const joined = PLAYERS.filter(p => playerPredictions[p] && Object.keys(playerPredictions[p]).length > 0)

    const results = {}
    let carry = 0
    for (let i = 0; i < SESSION_COUNT; i++) {
      const sk = `s${i + 1}`
      const betPerPerson = BASE_BET + (joined.length > 0 ? carry / joined.length : carry)
      const actual = actuals[sk]
      // Validate actual is filled
      const isTeam = sk === 's1' || sk === 's5'
      if (isTeam && !actual?.team) { results[sk] = null; continue }
      if (!isTeam && (actual?.runs === '' || actual?.wkts === '')) { results[sk] = null; continue }

      const actualParsed = isTeam
        ? { team: actual.team }
        : { runs: parseInt(actual.runs), wkts: parseInt(actual.wkts) }

      const r = calcSessionResult(joined, playerPredictions, sk, actualParsed, betPerPerson)
      results[sk] = r

      if (r.noWinner && !r.refund && r.carryForwardAmount > 0) {
        const remaining = SESSION_COUNT - i - 1
        carry = remaining > 0 ? r.carryForwardAmount / remaining : 0
      } else {
        carry = 0
      }
    }
    setPreview({ results, joined })
  }

  const saveActualsAndResults = async () => {
    if (!selectedMatch || !allPredData) return
    setSaving(true); setSaveMsg('')
    try {
      const mpData = allPredData[selectedMatch] || {}
      const playerPredictions = mpData.playerPredictions || {}
      const joined = PLAYERS.filter(p => playerPredictions[p] && Object.keys(playerPredictions[p]).length > 0)

      // Build parsed actuals
      const parsedActuals = {}
      for (let i = 1; i <= SESSION_COUNT; i++) {
        const sk = `s${i}`
        const isTeam = sk === 's1' || sk === 's5'
        parsedActuals[sk] = isTeam
          ? { team: actuals[sk].team }
          : { runs: parseInt(actuals[sk].runs) || 0, wkts: parseInt(actuals[sk].wkts) || 0 }
      }

      // Recompute results with carry
      const results = {}
      let carry = 0
      for (let i = 0; i < SESSION_COUNT; i++) {
        const sk = `s${i + 1}`
        const betPerPerson = BASE_BET + (joined.length > 0 ? carry / joined.length : carry)
        const isTeam = sk === 's1' || sk === 's5'
        const actual = parsedActuals[sk]
        const r = calcSessionResult(joined, playerPredictions, sk, actual, betPerPerson)
        results[sk] = r
        if (r.noWinner && !r.refund && r.carryForwardAmount > 0) {
          const remaining = SESSION_COUNT - i - 1
          carry = remaining > 0 ? r.carryForwardAmount / remaining : 0
        } else { carry = 0 }
      }

      const updated = {
        ...allPredData,
        [selectedMatch]: {
          ...mpData,
          actuals: parsedActuals,
          results,
          resultsUpdatedAt: new Date().toISOString()
        }
      }

      await savePredBin(updated)
      setAllPredData(updated)
      setPreview({ results, joined })
      setSaveMsg('✅ Actuals + results saved! Public Prediction tab will now show winners.')
    } catch (e) {
      setSaveMsg(`❌ ${e.message}`)
    }
    setSaving(false)
  }

  const clearResults = async () => {
    if (!selectedMatch || !allPredData) return
    if (!window.confirm(`Clear all actuals and results for Match #${selectedMatch}? Players will no longer see winners.`)) return
    setSaving(true); setSaveMsg('')
    try {
      const mpData = { ...allPredData[selectedMatch] }
      delete mpData.actuals
      delete mpData.results
      delete mpData.resultsUpdatedAt
      const updated = { ...allPredData, [selectedMatch]: mpData }
      await savePredBin(updated)
      setAllPredData(updated)
      setActuals(emptyActuals())
      setPreview(null)
      setSaveMsg('🗑 Results cleared. Players will see "Awaiting Admin Results" again.')
    } catch (e) { setSaveMsg(`❌ ${e.message}`) }
    setSaving(false)
  }

  const sessionLabels = (m) => {
    const [t1, t2] = getTeams(m)
    return [
      { key: 's1', label: `S1: Toss Winner (${t1} vs ${t2})`, isTeam: true },
      { key: 's2', label: 'S2: PP1 — 1st Innings (Runs & Wkts)', isTeam: false },
      { key: 's3', label: 'S3: 1st Innings Final Score (Runs & Wkts)', isTeam: false },
      { key: 's4', label: 'S4: PP1 — 2nd Innings (Runs & Wkts)', isTeam: false },
      { key: 's5', label: `S5: Match Winner (${t1} vs ${t2})`, isTeam: true },
    ]
  }

  const selMatch = selectedMatch ? matches.find(m => String(m.matchno) === String(selectedMatch)) : null
  const teams = selMatch ? getTeams(selMatch) : ['Team 1', 'Team 2']

  return (
    <div style={{ padding: '16px 20px', color: '#e8eaf6', fontFamily: "'Rajdhani', sans-serif" }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 3, color: '#f5a623', marginBottom: 4 }}>
        🔮 PREDICTION RESULTS MANAGER
      </div>
      <div style={{ fontSize: 12, color: '#8899bb', marginBottom: 16, lineHeight: 1.7 }}>
        Enter actual scores for each session after a match is complete.<br/>
        Winners are <b style={{ color: '#f5a623' }}>only shown to players once you save actuals here</b>. Predictions stay locked until then.
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={loadPredData}
          disabled={loading}
          style={{ ...btnStyle('#3498db'), fontSize: 12, padding: '7px 16px' }}
        >{loading ? '⏳ Loading...' : '⟳ Reload Prediction Data'}</button>
        {allPredData !== null && (
          <span style={{ fontSize: 11, color: '#2ecc71' }}>
            ✅ Loaded {Object.keys(allPredData).length} match(es) from prediction bin
          </span>
        )}
      </div>

      {saveMsg && (
        <div style={{ fontSize: 12, marginBottom: 14, padding: '8px 12px', borderRadius: 8, color: saveMsg.startsWith('✅') ? '#2ecc71' : saveMsg.startsWith('🗑') ? '#f5a623' : '#e74c3c', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}>
          {saveMsg}
        </div>
      )}

      {completedMatches.length === 0 ? (
        <div style={{ fontSize: 12, color: '#8899bb', padding: 24, textAlign: 'center', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 10 }}>
          No completed matches found. Matches need "Team Won" to be filled in Match Log first.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {/* Match selector */}
          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#8899bb', textTransform: 'uppercase', marginBottom: 8 }}>Select Match</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {completedMatches.map(m => {
                const hasResults = !!(allPredData?.[String(m.matchno)]?.actuals)
                const isSelected = String(selectedMatch) === String(m.matchno)
                const participantCount = Object.keys(allPredData?.[String(m.matchno)]?.playerPredictions || {}).length
                return (
                  <div
                    key={m.matchno}
                    onClick={() => selectMatch(String(m.matchno))}
                    style={{
                      padding: '10px 14px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
                      border: `1px solid ${isSelected ? 'rgba(245,166,35,0.5)' : 'rgba(255,255,255,0.08)'}`,
                      background: isSelected ? 'rgba(245,166,35,0.1)' : 'rgba(255,255,255,0.02)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 800, color: isSelected ? '#f5a623' : '#e8eaf6', fontSize: 13 }}>
                        #{m.matchno} {m.teams}
                      </span>
                      {hasResults
                        ? <span style={chipStyle('#2ecc71')}>✅ Done</span>
                        : <span style={chipStyle('#e74c3c')}>⏳ Pending</span>
                      }
                    </div>
                    <div style={{ fontSize: 10, color: '#8899bb', marginTop: 3 }}>
                      {m.teamwon} Won · {participantCount} prediction participant(s)
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Actuals form */}
          {selectedMatch && selMatch && (
            <div style={{ flex: 1, minWidth: 300 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#f5a623', marginBottom: 14, fontFamily: "'Rajdhani',sans-serif" }}>
                Match #{selectedMatch}: {selMatch.teams} — Enter Actuals
              </div>

              {allPredData?.[selectedMatch]?.resultsUpdatedAt && (
                <div style={{ fontSize: 11, color: '#8899bb', marginBottom: 10 }}>
                  Last saved: {new Date(allPredData[selectedMatch].resultsUpdatedAt).toLocaleString('en-IN')}
                </div>
              )}

              {sessionLabels(selMatch).map(({ key, label, isTeam }) => (
                <div key={key} style={{ marginBottom: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#e8eaf6', marginBottom: 8, fontFamily: "'Rajdhani',sans-serif" }}>
                    {label}
                  </div>
                  {isTeam ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      {teams.map(team => (
                        <button
                          key={team}
                          onClick={() => setActuals(a => ({ ...a, [key]: { team } }))}
                          style={{
                            flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer',
                            border: actuals[key]?.team === team ? '2px solid #f5a623' : '2px solid rgba(255,255,255,0.1)',
                            background: actuals[key]?.team === team ? 'rgba(245,166,35,0.15)' : 'rgba(255,255,255,0.04)',
                            color: actuals[key]?.team === team ? '#f5a623' : '#aaa',
                            fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 13
                          }}
                        >{team}</button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ ...labelStyle, fontSize: 10 }}>Actual Runs</label>
                        <input
                          type="number" min="0" step="1"
                          value={actuals[key]?.runs ?? ''}
                          onChange={e => setActuals(a => ({ ...a, [key]: { ...a[key], runs: e.target.value } }))}
                          style={inputStyle}
                          placeholder="e.g. 58"
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ ...labelStyle, fontSize: 10 }}>Actual Wickets</label>
                        <input
                          type="number" min="0" max="10" step="1"
                          value={actuals[key]?.wkts ?? ''}
                          onChange={e => setActuals(a => ({ ...a, [key]: { ...a[key], wkts: e.target.value } }))}
                          style={inputStyle}
                          placeholder="e.g. 3"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Who participated */}
              <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(52,152,219,0.06)', border: '1px solid rgba(52,152,219,0.2)', borderRadius: 10 }}>
                <div style={{ fontSize: 11, color: '#3498db', fontWeight: 700, marginBottom: 6 }}>👥 Participants in this match:</div>
                {Object.keys(allPredData?.[selectedMatch]?.playerPredictions || {}).length === 0
                  ? <div style={{ fontSize: 11, color: '#8899bb' }}>No predictions submitted yet for this match.</div>
                  : Object.keys(allPredData?.[selectedMatch]?.playerPredictions || {}).map(p => (
                    <span key={p} style={{ display: 'inline-block', margin: '2px 4px', padding: '2px 8px', borderRadius: 4, background: 'rgba(52,152,219,0.15)', color: '#3498db', fontSize: 11, fontWeight: 700 }}>{p}</span>
                  ))
                }
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                <button
                  onClick={computePreview}
                  style={{ ...btnStyle('#e056fd'), fontSize: 12, padding: '8px 18px' }}
                >🔍 Preview Results</button>
                <button
                  onClick={saveActualsAndResults}
                  disabled={saving}
                  style={{ ...btnStyle('#2ecc71'), fontSize: 12, padding: '8px 18px', opacity: saving ? 0.6 : 1 }}
                >{saving ? '⏳ Saving...' : '💾 Save & Publish Results'}</button>
                {allPredData?.[selectedMatch]?.actuals && (
                  <button
                    onClick={clearResults}
                    disabled={saving}
                    style={{ ...btnStyle('#e74c3c'), fontSize: 12, padding: '8px 18px' }}
                  >🗑 Clear Results</button>
                )}
              </div>

              {/* Preview panel */}
              {preview && (
                <div style={{ marginTop: 4, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontWeight: 800, color: '#f5a623', marginBottom: 10, fontFamily: "'Rajdhani',sans-serif", fontSize: 14 }}>
                    🔮 Results Preview (Participants: {preview.joined.join(', ') || 'None'})
                  </div>
                  {['s1','s2','s3','s4','s5'].map((sk, i) => {
                    const r = preview.results[sk]
                    if (!r) return (
                      <div key={sk} style={{ fontSize: 12, color: '#8899bb', marginBottom: 6, padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.02)' }}>
                        Session {i+1}: ⚠️ Actual not filled — skipped
                      </div>
                    )
                    return (
                      <div key={sk} style={{ marginBottom: 8, padding: '8px 12px', borderRadius: 8, background: r.noWinner ? 'rgba(231,76,60,0.07)' : 'rgba(46,204,113,0.07)', border: `1px solid ${r.noWinner ? 'rgba(231,76,60,0.25)' : 'rgba(46,204,113,0.25)'}` }}>
                        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 3, color: r.noWinner ? '#e74c3c' : '#2ecc71' }}>
                          Session {i+1}: {r.refund ? '🔄 Refund' : r.noWinner ? '📤 No Winner' : `🏆 ${r.winners.join(', ')} wins`}
                        </div>
                        <div style={{ fontSize: 11, color: '#aaa' }}>
                          {r.refund
                            ? `₹${r.pool?.toFixed(2)} refunded`
                            : r.noWinner
                            ? `₹${r.carryForwardAmount?.toFixed(2)} carry forward`
                            : `Each winner gets ₹${r.each?.toFixed(2)} from pool of ₹${r.pool?.toFixed(2)}`
                          }
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 20, background: 'rgba(52,152,219,0.06)', border: '1px dashed rgba(52,152,219,0.25)', borderRadius: 10, padding: '12px 16px', fontSize: 11, color: '#8899bb', lineHeight: 1.9 }}>
        <div style={{ color: '#3498db', fontWeight: 700, marginBottom: 4, fontSize: 12 }}>💡 Workflow</div>
        <div>1. Select a completed match from the left panel</div>
        <div>2. Enter the <b style={{ color: '#f5a623' }}>actual result</b> for each of the 5 sessions</div>
        <div>3. Click <b style={{ color: '#e056fd' }}>Preview Results</b> to verify winners before publishing</div>
        <div>4. Click <b style={{ color: '#2ecc71' }}>Save & Publish Results</b> — players will immediately see winners on the public page</div>
        <div>5. To undo: click <b style={{ color: '#e74c3c' }}>Clear Results</b> to revert to "Awaiting Admin Results" state</div>
      </div>
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
    setEditMatchNo(null); setEditUrl(''); setEditNotes(''); setSaveMsg('')
  }

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
      const updated = { ...binData, fantasyData: newData }
      let headers = { 'Content-Type': 'application/json' }
      try {
        const raw = sessionStorage.getItem('vois_admin_session')
        if (raw) { const s = JSON.parse(raw); if (s.key) headers['X-Master-Key'] = s.key }
      } catch {}
      const putRes = await fetch(`${JSONBIN_BASE}/${HARDCODED_BIN_ID}`, { method: 'PUT', headers, body: JSON.stringify(updated) })
      if (!putRes.ok) throw new Error(`Save failed (${putRes.status})`)
      setSaveMsg('✅ Saved successfully! Public page will update on next refresh.')
      onFantasyDataSave(newData)
    } catch (err) { setSaveMsg(`❌ ${err.message}`) }
    finally { setSaving(false) }
  }

  const handleSave = async () => {
    if (editMatchNo === null) return
    const newData = { ...localData, [editMatchNo]: { ...(localData[editMatchNo] || {}), youtubeUrl: editUrl.trim(), notes: editNotes.trim() } }
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
        Add YouTube video URLs and match notes for upcoming matches.
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
                    <button onClick={() => openEdit(mn)} style={btnStyle('#f5a623')}>✏️ {hasUrl ? 'Edit' : 'Add'} Fantasy</button>
                  )}
                  {hasUrl && !isEditing && (
                    <button onClick={() => handleDelete(mn)} style={btnStyle('#e74c3c')}>🗑</button>
                  )}
                </div>
              </div>

              {(hasUrl || hasNotes) && !isEditing && (
                <div style={{ padding: '0 14px 10px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {hasUrl && <span style={chipStyle('#3498db')}>📺 YouTube linked</span>}
                  {hasNotes && <span style={chipStyle('#2ecc71')}>📋 Notes added</span>}
                </div>
              )}

              {isEditing && (
                <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>📺 YouTube Video URL</label>
                    <input value={editUrl} onChange={e => setEditUrl(e.target.value)}
                      placeholder="https://youtu.be/XXXXXXXXXXX" style={inputStyle} />
                    {editUrl && getYouTubeEmbedId(editUrl) && <div style={{ fontSize: 10, color: '#2ecc71', marginTop: 4 }}>✅ Valid YouTube URL</div>}
                  </div>
                  <div>
                    <label style={labelStyle}>📋 Fantasy Notes</label>
                    <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)}
                      rows={10} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }}
                      placeholder="Paste your fantasy notes here..." />
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={handleSave} disabled={saving || (!editUrl.trim() && !editNotes.trim())}
                      style={{ ...btnStyle('#2ecc71'), fontSize: 13, padding: '9px 20px' }}>
                      {saving ? '⏳ Saving...' : '💾 Save to Cloud'}
                    </button>
                    <button onClick={cancelEdit} style={{ ...btnStyle('#8899bb'), fontSize: 13, padding: '9px 16px' }}>✕ Cancel</button>
                    {saveMsg && <span style={{ fontSize: 11, color: saveMsg.startsWith('✅') ? '#2ecc71' : '#e74c3c' }}>{saveMsg}</span>}
                  </div>
                </div>
              )}

              {previewMatchNo === mn && embedId && !isEditing && (
                <div style={{ padding: '0 14px 14px' }}>
                  <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', height: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(231,76,60,0.3)' }}>
                    <iframe
                      src={`https://www.youtube.com/embed/${embedId}?rel=0&modestbranding=1`}
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen title="Preview"
                    />
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

function MatchHighlightRow({ m, clips, saving, onAdd, onEdit, onRemove }) {
  const mn = parseInt(m.matchno)
  const done = m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—'
  const [isOpen, setIsOpen]     = useState(false)
  const [addUrl, setAddUrl]     = useState('')
  const [addLabel, setAddLabel] = useState('')
  const [editIdx, setEditIdx]   = useState(null)
  const [editUrl, setEditUrl]   = useState('')
  const [editLabel, setEditLabel] = useState('')
  const [previewIdx, setPreviewIdx] = useState(null)

  const handleAdd = () => {
    if (!addUrl.trim()) return
    onAdd(mn, { type: detectType(addUrl.trim()), url: addUrl.trim(), label: addLabel.trim() || 'Highlight' })
    setAddUrl(''); setAddLabel('')
  }
  const startEdit = (i) => { setEditIdx(i); setEditUrl(clips[i].url); setEditLabel(clips[i].label || '') }
  const cancelEdit = () => { setEditIdx(null); setEditUrl(''); setEditLabel('') }
  const saveEdit = () => {
    if (!editUrl.trim()) return
    onEdit(mn, editIdx, { type: detectType(editUrl.trim()), url: editUrl.trim(), label: editLabel.trim() || 'Highlight' })
    cancelEdit()
  }

  return (
    <div style={{ background: isOpen ? 'rgba(245,166,35,0.05)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isOpen ? 'rgba(245,166,35,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 10, overflow: 'hidden' }}>
      <div onClick={() => setIsOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', flexWrap: 'wrap' }}>
        <span style={{ background: done ? 'rgba(46,204,113,0.15)' : 'rgba(245,166,35,0.15)', color: done ? '#2ecc71' : '#f5a623', border: `1px solid ${done ? 'rgba(46,204,113,0.3)' : 'rgba(245,166,35,0.3)'}`, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>#{mn}</span>
        <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{m.teams || '—'}</span>
        <span style={{ fontSize: 11, color: '#8899bb' }}>{m.date ? new Date(m.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : ''}</span>
        {clips.length > 0 && <span style={{ fontSize: 10, background: 'rgba(245,166,35,0.15)', color: '#f5a623', borderRadius: 10, padding: '2px 8px', fontWeight: 700 }}>{clips.length} clip{clips.length !== 1 ? 's' : ''}</span>}
        <span style={{ fontSize: 12, color: '#8899bb' }}>{isOpen ? '▲' : '▼'}</span>
      </div>

      {isOpen && (
        <div style={{ padding: '0 14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {clips.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {clips.map((c, i) => {
                const t = c.type || detectType(c.url)
                const isIg = t === 'instagram'
                const isEditing = editIdx === i
                const isPreviewing = previewIdx === i
                return (
                  <div key={i} style={{ background: 'rgba(0,0,0,0.35)', border: `1px solid ${isEditing ? 'rgba(245,166,35,0.4)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 9, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 900, background: isIg ? 'linear-gradient(45deg,#f09433,#dc2743,#bc1888)' : '#e74c3c', color: '#fff' }}>
                        {isIg ? '📸 IG' : t === 'youtube_shorts' ? '▶ YT SHORT' : '▶ YT'}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 12, flex: 1 }}>{c.label || `Clip ${i + 1}`}</span>
                      <a href={c.url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#8899bb', textDecoration: 'none' }}>↗</a>
                      {!isEditing && (
                        <>
                          <button onClick={() => setPreviewIdx(isPreviewing ? null : i)} style={btnStyle('#3498db')}>{isPreviewing ? '✕' : '👁'}</button>
                          <button onClick={() => { startEdit(i); setPreviewIdx(null) }} style={btnStyle('#f5a623')}>✏️</button>
                          <button onClick={() => onRemove(mn, i)} style={btnStyle('#e74c3c')}>🗑</button>
                        </>
                      )}
                    </div>
                    {isEditing && (
                      <div style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid rgba(245,166,35,0.2)' }}>
                        <input value={editLabel} onChange={e => setEditLabel(e.target.value)} style={inputStyle} placeholder="Clip title..." />
                        <input value={editUrl} onChange={e => setEditUrl(e.target.value)} style={inputStyle} placeholder="URL" />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={saveEdit} disabled={!editUrl.trim()} style={btnStyle('#2ecc71')}>💾 Save</button>
                          <button onClick={cancelEdit} style={btnStyle('#8899bb')}>✕</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ background: 'rgba(46,204,113,0.04)', border: '1px solid rgba(46,204,113,0.2)', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, color: '#2ecc71', fontWeight: 700 }}>➕ Add Clip to Match #{mn}</div>
            <input value={addLabel} onChange={e => setAddLabel(e.target.value)} placeholder="Label..." style={inputStyle} />
            <input value={addUrl} onChange={e => setAddUrl(e.target.value)} placeholder="Instagram or YouTube URL..." style={inputStyle} />
            <button onClick={handleAdd} disabled={saving || !addUrl.trim()} style={{ ...btnStyle('#2ecc71'), opacity: !addUrl.trim() ? 0.5 : 1 }}>
              {saving ? '⏳...' : '➕ Add Clip'}
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
    const newData = { ...localData, [mn]: [...(localData[mn] || []), clip] }
    setLocalData(newData); await saveToCloud(newData)
  }
  const handleEdit = async (mn, idx, clip) => {
    const existing = [...(localData[mn] || [])]; existing[idx] = clip
    const newData = { ...localData, [mn]: existing }
    setLocalData(newData); await saveToCloud(newData)
  }
  const handleRemove = async (mn, idx) => {
    if (!window.confirm('Delete this clip?')) return
    const existing = [...(localData[mn] || [])]; existing.splice(idx, 1)
    const newData = { ...localData, [mn]: existing }
    if (existing.length === 0) delete newData[mn]
    setLocalData(newData); await saveToCloud(newData)
  }

  return (
    <div style={{ padding: '16px 20px', color: '#e8eaf6', fontFamily: "'Rajdhani', sans-serif" }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 3, color: '#f5a623', marginBottom: 4 }}>
        🎬 HIGHLIGHTS MANAGER
      </div>
      {saveMsg && <div style={{ fontSize: 12, marginBottom: 12, padding: '8px 12px', borderRadius: 8, color: saveMsg.startsWith('✅') ? '#2ecc71' : '#e74c3c' }}>{saveMsg}</div>}
      {matches.length === 0
        ? <div style={{ fontSize: 12, color: '#8899bb', padding: 24, textAlign: 'center' }}>No matches loaded.</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {[...matches].sort((a,b) => parseInt(b.matchno) - parseInt(a.matchno)).map(m => (
              <MatchHighlightRow
                key={m.matchno} m={m}
                clips={localData[parseInt(m.matchno)] || []}
                saving={saving}
                onAdd={handleAdd} onEdit={handleEdit} onRemove={handleRemove}
              />
            ))}
          </div>
      }
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

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'matchlog',    label: '📋 Match Log' },
            { id: 'predictions', label: '🔮 Predictions' },   // ← NEW TAB
            { id: 'fantasy',     label: '🎯 Fantasy Tips' },
            { id: 'highlights',  label: '🎬 Highlights' },
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
        {activeTab === 'matchlog' && (
          <MatchLogAdmin matches={matches} onMatchesSave={onMatchesSave} />
        )}
        {activeTab === 'predictions' && (
          <PredictionAdmin matches={matches} />
        )}
        {activeTab === 'fantasy' && (
          <FantasyTipsAdmin matches={matches} fantasyData={fantasyData} onFantasyDataSave={onFantasyDataSave || (() => {})} />
        )}
        {activeTab === 'highlights' && (
          <HighlightsAdmin matches={matches} highlightsData={highlightsData} onHighlightsDataSave={onHighlightsDataSave || (() => {})} />
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
  sessionInfo: { fontFamily: "'Rajdhani', sans-serif", fontSize: 11, color: '#8899bb', letterSpacing: 1 },
  topRight: {},
  logoutBtn: {
    fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: 1,
    padding: '6px 16px', borderRadius: 8,
    background: 'rgba(231,76,60,0.15)', color: '#e74c3c',
    border: '1px solid rgba(231,76,60,0.4)', cursor: 'pointer', transition: 'all 0.2s',
  },
}
