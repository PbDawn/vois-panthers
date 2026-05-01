// ─── PredictionTab.jsx ──────────────────────────────────────────────────────
// VOIS Panthers IPL 2026 – Match Prediction Fantasy Game
//
// CHANGES in this version:
//  1. STRICT one-time identity setup — "Change" button removed after saving
//  2. Edit button always visible; locks 30 min before match start time
//  3. Countdown timer above Predictions showing edit deadline
//  4. All predictions are REQUIRED — no empty fields allowed before saving
//  5. All predictions revealed publicly ONLY after editing is locked (not just after match start)
//  6. Fixed carry-forward logic: no-winner pool = session_fee ÷ 4 per remaining session
//  7. Session 5 tie (all same answer) → split prize equally; all wrong → full refund
//  8. Admin can disable sessions (for short matches) → refund those session amounts
//  9. Points can be added for running matches (not just completed)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo, useRef, useImperativeHandle, forwardRef } from 'react'

// ── CONFIG ──────────────────────────────────────────────────────────────────
const PLAYERS       = ['Ashish','Kalpesh','Nilesh','Prabhat','Pritam','Sudhir','Swapnil']
const PLAYER_COLORS = {
  Ashish:'#f5a623', Kalpesh:'#3498db', Nilesh:'#2ecc71',
  Prabhat:'#e74c3c', Pritam:'#e056fd', Sudhir:'#00cec9', Swapnil:'#fd9644'
}
const PRED_BIN_ID   = '69f4599e856a6821899363fd'
const JSONBIN_BASE  = 'https://api.jsonbin.io/v3/b'
const BASE_BET      = 10
const SESSION_COUNT = 5
// Prediction editing locks this many minutes before match start
const LOCK_BEFORE_MINUTES = 30

// ── HELPERS ─────────────────────────────────────────────────────────────────
function getMatchDateTime(m) {
  if (!m?.date || !m?.matchTime) return null
  const [h, min] = m.matchTime.split(':').map(Number)
  const dt = new Date(m.date + 'T00:00:00')
  dt.setHours(h, min, 0, 0)
  return dt
}

// Edit deadline = match start - 30 min
function getPredEditDeadline(m) {
  const dt = getMatchDateTime(m)
  if (!dt) return null
  return new Date(dt.getTime() - LOCK_BEFORE_MINUTES * 60 * 1000)
}

function isEditingLocked(m) {
  const deadline = getPredEditDeadline(m)
  if (!deadline) return false
  return new Date() >= deadline
}

function isMatchStarted(m) {
  const dt = getMatchDateTime(m)
  return dt ? new Date() >= dt : !!(m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—')
}

function isMatchCompleted(m) {
  return !!(m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—')
}

function formatTS(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('en-IN', {
    day:'2-digit', month:'short', year:'numeric',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true
  }).replace(/,/g,'')
}

function getTeams(m) {
  if (!m?.teams) return ['Team 1','Team 2']
  const parts = m.teams.split(' vs ').map(s => s.trim())
  return parts.length === 2 ? parts : [parts[0] || 'Team 1', parts[1] || 'Team 2']
}

const clone = v => JSON.parse(JSON.stringify(v))

function formatCountdown(ms) {
  if (ms <= 0) return 'LOCKED'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// ── WINNING CALC ─────────────────────────────────────────────────────────────
function calcSessionResult(joined, predictions, sessionKey, actual, betPerPerson, disabledSessions) {
  if (disabledSessions?.[sessionKey]) {
    return { disabled: true, refund: true, winners:[], losers:[], each:0, noWinner:false,
             carryForwardAmount:0, pool: betPerPerson * joined.length }
  }

  const participants = joined.filter(p => predictions[p]?.[sessionKey] !== undefined)
  if (participants.length === 0) {
    return { winners:[], losers:[], each:0, noWinner:true, refund:false,
             carryForwardAmount: betPerPerson * joined.length }
  }

  const pool = betPerPerson * participants.length
  let winners = []

  if (sessionKey === 's1' || sessionKey === 's5') {
    const correctTeam = actual.team
    const correct = participants.filter(p => predictions[p][sessionKey]?.team === correctTeam)
    const allSame = new Set(participants.map(p => predictions[p][sessionKey]?.team)).size === 1

    if (sessionKey === 's5') {
      if (allSame && correct.length === participants.length) {
        return { winners: participants, losers: [], each: parseFloat((pool / participants.length).toFixed(2)),
                 noWinner: false, refund: false, carryForwardAmount: 0, pool, s5SplitAll: true }
      }
      if (correct.length === 0) {
        return { winners:[], losers:[], each:0, noWinner:true, refund:true, carryForwardAmount:0, pool }
      }
    } else {
      if (allSame) {
        return { winners:[], losers:[], each:0, noWinner:true, refund:false, carryForwardAmount: pool }
      }
      if (correct.length === 0) {
        return { winners:[], losers:[], each:0, noWinner:true, refund:false, carryForwardAmount: pool }
      }
    }
    winners = correct
  } else {
    const actualRuns = actual.runs
    const actualWkts = actual.wkts
    const diffs = participants.map(p => ({
      p,
      runDiff: Math.abs((predictions[p][sessionKey]?.runs || 0) - actualRuns),
      predWkts: predictions[p][sessionKey]?.wkts || 0
    }))
    const minDiff = Math.min(...diffs.map(d => d.runDiff))
    let closest = diffs.filter(d => d.runDiff === minDiff)
    const minWktAmongClosest = Math.min(...closest.map(d => d.predWkts))
    const finalWinners = closest.filter(d => d.predWkts === minWktAmongClosest)
    winners = finalWinners.map(d => d.p)
  }

  const losers = participants.filter(p => !winners.includes(p))
  const each   = winners.length > 0 ? pool / winners.length : 0
  return { winners, losers, each: parseFloat(each.toFixed(2)), noWinner: winners.length === 0,
           refund: false, carryForwardAmount: 0, pool }
}

// ── FETCH / SAVE helpers ─────────────────────────────────────────────────────
async function fetchPredData() {
  try {
    const r = await fetch(`${JSONBIN_BASE}/${PRED_BIN_ID}/latest`, {
      headers: { 'X-Bin-Meta': 'false' }
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const d = await r.json()
    return d.predictions || {}
  } catch(e) {
    console.error('PredFetch:', e)
    return {}
  }
}

// Single PUT to JSONBin — used for all saves (individual or batch)
async function savePredData(predictions) {
  try {
    const r = await fetch(`${JSONBIN_BASE}/${PRED_BIN_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ predictions })
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return true
  } catch(e) {
    console.error('PredSave:', e)
    return false
  }
}

// ── IDENTITY GATE ────────────────────────────────────────────────────────────
function IdentityGate({ onIdentified }) {
  const [chosen, setChosen] = useState(null)

  const handleConfirm = () => {
    if (!chosen) return
    localStorage.setItem('vois_pred_identity', chosen)
    localStorage.setItem('vois_pred_identity_locked', '1')
    onIdentified(chosen)
  }

  return (
    <div style={gateWrap}>
      <div style={gateBox}>
        <div style={{fontSize:36, marginBottom:8}}>🏏</div>
        <div style={{fontSize:20, fontWeight:800, color:'#f5a623', fontFamily:"'Rajdhani',sans-serif", letterSpacing:1, marginBottom:4}}>
          WHO ARE YOU?
        </div>
        <div style={{fontSize:12, color:'#8899bb', marginBottom:20, lineHeight:1.6}}>
          Select your name to access the Prediction Game.<br/>
          <b style={{color:'#e74c3c'}}>⚠️ This is a STRICT one-time setup and CANNOT be changed.</b>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:20}}>
          {PLAYERS.map(p => (
            <button
              key={p}
              onClick={() => setChosen(p)}
              style={{
                padding:'12px 8px', borderRadius:10, cursor:'pointer',
                border: chosen===p ? `2px solid ${PLAYER_COLORS[p]}` : '2px solid rgba(255,255,255,0.1)',
                background: chosen===p ? `${PLAYER_COLORS[p]}22` : 'rgba(255,255,255,0.04)',
                color: chosen===p ? PLAYER_COLORS[p] : '#aaa',
                fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:15, transition:'all 0.2s'
              }}
            >{p}</button>
          ))}
        </div>
        {chosen && (
          <div style={{marginBottom:16, padding:'10px 14px', background:'rgba(245,166,35,0.1)', borderRadius:8, border:'1px solid rgba(245,166,35,0.3)', fontSize:13, color:'#f5a623'}}>
            ⚠️ You're about to lock in as <b>{chosen}</b>. Once set, this <b>cannot</b> be changed.
          </div>
        )}
        <button
          onClick={handleConfirm}
          disabled={!chosen}
          style={{
            width:'100%', padding:'12px', borderRadius:10, cursor: chosen?'pointer':'not-allowed',
            background: chosen ? '#f5a623' : 'rgba(255,255,255,0.08)',
            color: chosen ? '#000' : '#555', fontFamily:"'Rajdhani',sans-serif",
            fontWeight:900, fontSize:16, letterSpacing:1, border:'none'
          }}
        >✅ CONFIRM AS {chosen || '...'}</button>
      </div>
    </div>
  )
}
const gateWrap = { display:'flex', alignItems:'center', justifyContent:'center', minHeight:400, padding:20 }
const gateBox  = {
  background:'rgba(12,22,48,0.97)', border:'1px solid rgba(245,166,35,0.4)',
  borderRadius:16, padding:'32px 28px', maxWidth:380, width:'100%', textAlign:'center',
  boxShadow:'0 0 40px rgba(245,166,35,0.15)'
}

// ── EDIT HISTORY PANEL ───────────────────────────────────────────────────────
function EditHistoryPanel({ history }) {
  if (!history || history.length === 0) return null
  const sorted = [...history].reverse()
  return (
    <div style={{marginTop:12, borderTop:'1px solid rgba(255,255,255,0.08)', paddingTop:10}}>
      <div style={{fontSize:11, color:'#8899bb', marginBottom:6, letterSpacing:1, textTransform:'uppercase', fontFamily:"'Rajdhani',sans-serif"}}>
        📝 Edit History ({sorted.length})
      </div>
      {sorted.map((h,i) => (
        <div key={i} style={{
          padding:'6px 10px', marginBottom:5, borderRadius:8,
          background: i===0 ? 'rgba(245,166,35,0.06)' : 'rgba(255,255,255,0.02)',
          border: i===0 ? '1px solid rgba(245,166,35,0.2)' : '1px solid rgba(255,255,255,0.05)',
          fontSize:11, color: i===0 ? '#f5a623' : '#8899bb'
        }}>
          <div style={{fontWeight:700}}>{i===0 ? '⬆️ Latest · ' : ''}{formatTS(h.ts)}</div>
          <div style={{marginTop:2}}>{h.summary}</div>
        </div>
      ))}
    </div>
  )
}

// ── PREDICTION DEADLINE TIMER ────────────────────────────────────────────────
function PredDeadlineTimer({ match }) {
  const [timeLeft, setTimeLeft] = useState(0)
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    const deadline = getPredEditDeadline(match)
    if (!deadline) return
    const tick = () => {
      const ms = deadline - new Date()
      setTimeLeft(ms)
      setLocked(ms <= 0)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [match])

  const deadline = getPredEditDeadline(match)
  if (!deadline) return null

  const matchTime = match.matchTime === '15:30' ? '3:30 PM' : '7:30 PM'
  const cutoffTime = match.matchTime === '15:30' ? '3:00 PM' : '7:00 PM'

  return (
    <div style={{
      marginBottom:14, padding:'10px 16px', borderRadius:12,
      border: locked ? '1px solid rgba(231,76,60,0.4)' : timeLeft < 300000 ? '1px solid rgba(245,166,35,0.5)' : '1px solid rgba(46,204,113,0.3)',
      background: locked ? 'rgba(231,76,60,0.06)' : timeLeft < 300000 ? 'rgba(245,166,35,0.06)' : 'rgba(46,204,113,0.04)',
      display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8
    }}>
      <div>
        <div style={{
          fontFamily:"'Rajdhani',sans-serif", fontWeight:800, fontSize:13,
          color: locked ? '#e74c3c' : timeLeft < 300000 ? '#f5a623' : '#2ecc71'
        }}>
          {locked ? '🔒 Predictions LOCKED' : '⏳ Predictions edit window'}
        </div>
        <div style={{fontSize:11, color:'#8899bb', marginTop:2}}>
          Match starts {matchTime} IST · Edit deadline: <b style={{color:'#f5a623'}}>{cutoffTime} IST</b>
          {locked && <span style={{marginLeft:8, color:'#e74c3c', fontWeight:700}}>— Editing no longer allowed</span>}
        </div>
      </div>
      {!locked && (
        <div style={{
          fontFamily:"'Rajdhani',sans-serif", fontWeight:900, fontSize:18,
          color: timeLeft < 300000 ? '#f5a623' : '#2ecc71',
          background: 'rgba(0,0,0,0.3)', padding:'6px 14px', borderRadius:8,
          border: `1px solid ${timeLeft < 300000 ? 'rgba(245,166,35,0.3)' : 'rgba(46,204,113,0.3)'}`,
          letterSpacing:1
        }}>
          {formatCountdown(timeLeft)}
        </div>
      )}
    </div>
  )
}

// ── SESSION CARD ─────────────────────────────────────────────────────────────
const SessionCard = forwardRef(function SessionCard({
  sessionNum, sessionKey, label, match, myPlayer, myPrediction, myHistory,
  allPredictions, actual, betAmount, result, disabled: sessionDisabled,
  onSave, onDelete, saving, cardRef
}, ref) {
  // merge both ref patterns: forwardRef ref and explicit cardRef callback
  const combinedRef = cardRef || ref
  const teams = getTeams(match)
  const [t1, t2] = teams
  const editingLocked = isEditingLocked(match)
  const started       = isMatchStarted(match)
  const completed     = isMatchCompleted(match)
  const hasPred       = myPrediction?.[sessionKey] !== undefined

  const [editing, setEditing] = useState(!hasPred)
  const [teamPick, setTeamPick] = useState(myPrediction?.[sessionKey]?.team || '')
  const [runs,     setRuns]     = useState(myPrediction?.[sessionKey]?.runs ?? '')
  const [wkts,     setWkts]     = useState(myPrediction?.[sessionKey]?.wkts ?? '')

  useEffect(() => {
    // Only sync from props when NOT actively editing (i.e. a saved prediction was loaded/updated externally).
    // Without this guard, every parent re-render passes a new object reference for myPrediction,
    // which fires this effect and wipes whatever the user just typed or clicked.
    if (editing) return
    setTeamPick(myPrediction?.[sessionKey]?.team || '')
    setRuns(myPrediction?.[sessionKey]?.runs ?? '')
    setWkts(myPrediction?.[sessionKey]?.wkts ?? '')
  }, [myPrediction, sessionKey, editing])

  const isTeamSession  = sessionKey === 's1' || sessionKey === 's5'

  const canEdit = !editingLocked && !started && (editing || !hasPred)

  // Show actuals + results ONLY when admin has entered them AND match has started
  const hasActual = !!actual && started
  const hasResult = !!result && started

  // CHANGE: Show all predictions once editing is locked (not just after actuals are set)
  // This allows viewing everyone's predictions during the match
  const showAllPredictions = editingLocked

  const participants = PLAYERS.filter(p => allPredictions[p]?.[sessionKey] !== undefined)
  const amIWinner = result?.winners?.includes(myPlayer)

  function buildSummary() {
    if (isTeamSession) return `Picked: ${teamPick}`
    return `Runs: ${runs}, Wkts: ${wkts}`
  }

  // Expose validate + getPred for "Save All" in parent
  useImperativeHandle(combinedRef, () => ({
    validate() {
      if (isTeamSession) {
        if (!teamPick) return { ok: false, msg: `Session ${sessionNum}: Please select a team.` }
      } else {
        const r = parseInt(runs), w = parseInt(wkts)
        if (runs === '' || wkts === '') return { ok: false, msg: `Session ${sessionNum}: Both Runs and Wickets are required.` }
        if (isNaN(r) || isNaN(w) || r < 0 || w < 0 || w > 10) return { ok: false, msg: `Session ${sessionNum}: Enter valid numbers (Runs ≥ 0, Wickets 0–10).` }
      }
      return { ok: true }
    },
    getPred() {
      if (isTeamSession) return { pred: { team: teamPick }, summary: buildSummary() }
      return { pred: { runs: parseInt(runs), wkts: parseInt(wkts) }, summary: buildSummary() }
    },
    sessionKey,
    isDisabled: !!sessionDisabled,
    isLocked: editingLocked || started,
  }))

  const [localSaving, setLocalSaving] = useState(false)
  const [savedOk,     setSavedOk]     = useState(false)

  async function handleSave() {
    let pred = {}
    if (isTeamSession) {
      if (!teamPick) return alert('⚠️ Please select a team for this session!')
      pred = { team: teamPick }
    } else {
      const r = parseInt(runs), w = parseInt(wkts)
      if (runs === '' || wkts === '') return alert('⚠️ Both Runs and Wickets are required!')
      if (isNaN(r) || isNaN(w) || r < 0 || w < 0 || w > 10) return alert('Enter valid whole numbers (Runs ≥ 0, Wickets 0–10)')
      pred = { runs: r, wkts: w }
    }
    setLocalSaving(true)
    const ok = await onSave(sessionKey, pred, buildSummary())
    setLocalSaving(false)
    if (ok) {
      setSavedOk(true)
      setEditing(false)
      setTimeout(() => setSavedOk(false), 2500)
    }
  }

  // Unified "busy" flag: local per-session save OR parent-level saving (Save All / Delete)
  const isBusy = localSaving || saving

  // Disabled session (admin turned off for short match)
  if (sessionDisabled) {
    return (
      <div style={{
        marginBottom:16, borderRadius:14, opacity:0.6,
        border:'1px solid rgba(231,76,60,0.2)',
        background:'rgba(0,0,0,0.2)', overflow:'hidden'
      }}>
        <div style={{padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <div style={{fontFamily:"'Rajdhani',sans-serif", fontWeight:800, fontSize:14, color:'#8899bb'}}>
            Session {sessionNum}: {label}
          </div>
          <span style={{fontSize:11, padding:'3px 10px', borderRadius:20, background:'rgba(231,76,60,0.12)', color:'#e74c3c', border:'1px solid rgba(231,76,60,0.3)'}}>
            🚫 Disabled — Refunded
          </span>
        </div>
        <div style={{padding:'8px 14px 14px', fontSize:12, color:'#8899bb'}}>
          This session was disabled by the admin. Entry fee for this session has been refunded.
        </div>
      </div>
    )
  }

  return (
    <div style={{
      marginBottom:16, borderRadius:14,
      border:`1px solid ${hasActual ? 'rgba(46,204,113,0.3)' : started ? 'rgba(224,86,253,0.2)' : editingLocked ? 'rgba(231,76,60,0.2)' : 'rgba(255,255,255,0.1)'}`,
      background: amIWinner ? 'rgba(46,204,113,0.04)' : 'rgba(255,255,255,0.02)', overflow:'hidden'
    }}>
      {/* Header */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'10px 14px',
        background: hasActual ? 'rgba(46,204,113,0.06)' : 'rgba(255,255,255,0.03)',
        borderBottom:'1px solid rgba(255,255,255,0.06)'
      }}>
        <div style={{fontFamily:"'Rajdhani',sans-serif", fontWeight:800, fontSize:14, color: amIWinner ? '#2ecc71' : '#f5a623'}}>
          Session {sessionNum}: {label} {amIWinner ? '🏆' : ''}
        </div>
        <div style={{display:'flex', gap:6, alignItems:'center', flexWrap:'wrap'}}>
          <span style={{
            fontSize:11, padding:'3px 8px', borderRadius:20,
            background: hasPred ? 'rgba(46,204,113,0.15)' : 'rgba(255,255,255,0.05)',
            color: hasPred ? '#2ecc71' : '#8899bb',
            border: hasPred ? '1px solid rgba(46,204,113,0.3)' : '1px solid rgba(255,255,255,0.1)'
          }}>{hasPred ? '✅ Predicted' : '⏳ Pending'}</span>
          {!started && editingLocked && <span style={{fontSize:11,color:'#e74c3c',padding:'3px 8px',border:'1px solid rgba(231,76,60,0.3)',borderRadius:20}}>🔒 Locked</span>}
          {started && !hasActual && <span style={{fontSize:11,color:'#e056fd',padding:'3px 8px',border:'1px solid rgba(224,86,253,0.3)',borderRadius:20}}>🔐 Awaiting results</span>}
          {hasActual && <span style={{fontSize:11,color:'#2ecc71',padding:'3px 8px',border:'1px solid rgba(46,204,113,0.3)',borderRadius:20}}>✅ Results In</span>}
        </div>
      </div>

      <div style={{padding:'12px 14px'}}>
        {/* Bet amount */}
        <div style={{fontSize:12, color:'#8899bb', marginBottom:10}}>
          💰 Bet: <b style={{color:'#f5a623'}}>₹{betAmount.toFixed(2)}</b> per player this session
          {participants.length > 0 && <> · Pool: <b style={{color:'#2ecc71'}}>₹{(betAmount * participants.length).toFixed(2)}</b></>}
        </div>

        {/* INPUT AREA — only shown when not started and not edit-locked */}
        {!started && !editingLocked && (
          <div style={{marginBottom:10}}>
            {(editing || !hasPred) && (
              <>
                {isTeamSession ? (
                  <div style={{display:'flex',gap:8, marginBottom:8}}>
                    {[t1, t2].map(team => (
                      <button
                        key={team}
                        onClick={() => { if (!isBusy) setTeamPick(team) }}
                        disabled={isBusy}
                        style={{
                          flex:1, padding:'10px 6px', borderRadius:10,
                          cursor: isBusy ? 'not-allowed' : 'pointer',
                          border: teamPick===team ? '2px solid #f5a623' : '2px solid rgba(255,255,255,0.1)',
                          background: teamPick===team ? 'rgba(245,166,35,0.15)' : 'rgba(255,255,255,0.04)',
                          color: teamPick===team ? '#f5a623' : '#aaa',
                          fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:13,
                          transition:'all 0.2s', opacity: isBusy ? 0.5 : 1
                        }}
                      >{team}</button>
                    ))}
                  </div>
                ) : (
                  <div style={{display:'flex', gap:10, marginBottom:8}}>
                    <div style={{flex:1}}>
                      <label style={{fontSize:11,color:'#8899bb',display:'block',marginBottom:4}}>Runs <span style={{color:'#e74c3c'}}>*</span></label>
                      <input
                        type="number" min="0" step="1"
                        value={runs} onChange={e => { if (!isBusy) setRuns(e.target.value.replace(/\D/,'')) }}
                        disabled={isBusy}
                        style={{...inputStyle, opacity: isBusy ? 0.5 : 1, cursor: isBusy ? 'not-allowed' : 'text'}}
                        placeholder="e.g. 56"
                      />
                    </div>
                    <div style={{flex:1}}>
                      <label style={{fontSize:11,color:'#8899bb',display:'block',marginBottom:4}}>Wickets (0–10) <span style={{color:'#e74c3c'}}>*</span></label>
                      <input
                        type="number" min="0" max="10" step="1"
                        value={wkts} onChange={e => { if (!isBusy) setWkts(e.target.value.replace(/\D/,'')) }}
                        disabled={isBusy}
                        style={{...inputStyle, opacity: isBusy ? 0.5 : 1, cursor: isBusy ? 'not-allowed' : 'text'}}
                        placeholder="e.g. 2"
                      />
                    </div>
                  </div>
                )}
                <div style={{display:'flex', gap:8}}>
                  <button
                    onClick={handleSave}
                    disabled={isBusy}
                    style={{
                      flex:1, padding:'10px', borderRadius:10,
                      cursor: isBusy ? 'not-allowed' : 'pointer',
                      background: savedOk ? '#2ecc71' : '#f5a623',
                      color:'#000', fontFamily:"'Rajdhani',sans-serif",
                      fontWeight:900, fontSize:14, border:'none', letterSpacing:0.5,
                      opacity: isBusy ? 0.7 : 1, transition:'background 0.3s'
                    }}
                  >{localSaving ? '⏳ Saving...' : saving ? '⏳ Busy...' : savedOk ? '✅ Saved!' : hasPred ? '💾 Update Prediction' : '✅ Save Prediction'}</button>
                  {hasPred && editing && (
                    <button
                      onClick={() => { if (!isBusy) setEditing(false) }}
                      disabled={isBusy}
                      style={{padding:'10px 14px', borderRadius:10, cursor: isBusy ? 'not-allowed' : 'pointer', background:'rgba(255,255,255,0.06)', color:'#8899bb', border:'1px solid rgba(255,255,255,0.1)', fontSize:13, opacity: isBusy ? 0.5 : 1}}
                    >✕ Cancel</button>
                  )}
                </div>
              </>
            )}

            {hasPred && !editing && (
              <div style={{marginBottom:8}}>
                <div style={{padding:'8px 12px', background:'rgba(245,166,35,0.06)', borderRadius:8, border:'1px solid rgba(245,166,35,0.2)', marginBottom:8, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                  <div>
                    <div style={{fontSize:11, color:'#8899bb', marginBottom:3}}>Your Prediction:</div>
                    {isTeamSession
                      ? <span style={{color:'#f5a623',fontWeight:700,fontFamily:"'Rajdhani',sans-serif",fontSize:15}}>{myPrediction[sessionKey].team}</span>
                      : <span style={{color:'#f5a623',fontWeight:700,fontFamily:"'Rajdhani',sans-serif",fontSize:15}}>
                          Runs: {myPrediction[sessionKey].runs} · Wkts: {myPrediction[sessionKey].wkts}
                        </span>
                    }
                  </div>
                  <div style={{display:'flex', gap:6}}>
                  <button
                    onClick={() => { if (!isBusy) setEditing(true) }}
                    disabled={isBusy}
                    style={{
                      padding:'7px 14px', borderRadius:8, cursor: isBusy ? 'not-allowed' : 'pointer',
                      background:'rgba(245,166,35,0.15)', color:'#f5a623',
                      border:'1px solid rgba(245,166,35,0.4)', fontSize:12,
                      fontFamily:"'Rajdhani',sans-serif", fontWeight:700, letterSpacing:0.5,
                      opacity: isBusy ? 0.5 : 1
                    }}
                  >✏️ Edit</button>
                  {onDelete && (
                    <button
                      onClick={() => {
                        if (isBusy) return
                        if (window.confirm(`Delete your prediction for Session ${sessionNum}?`)) {
                          onDelete(sessionKey)
                          setTeamPick('')
                          setRuns('')
                          setWkts('')
                          setEditing(true)
                        }
                      }}
                      disabled={isBusy}
                      style={{
                        padding:'7px 12px', borderRadius:8, cursor: isBusy ? 'not-allowed' : 'pointer',
                        background:'rgba(231,76,60,0.12)', color:'#e74c3c',
                        border:'1px solid rgba(231,76,60,0.3)', fontSize:12,
                        fontFamily:"'Rajdhani',sans-serif", fontWeight:700,
                        opacity: isBusy ? 0.5 : 1
                      }}
                    >🗑️</button>
                  )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Show locked prediction (not started, but editing locked) */}
        {!started && editingLocked && hasPred && (
          <div style={{padding:'8px 12px', background:'rgba(245,166,35,0.06)', borderRadius:8, border:'1px solid rgba(245,166,35,0.2)', marginBottom:10}}>
            <div style={{fontSize:11, color:'#8899bb', marginBottom:3}}>Your Prediction (Locked):</div>
            {isTeamSession
              ? <span style={{color:'#f5a623',fontWeight:700,fontFamily:"'Rajdhani',sans-serif",fontSize:15}}>{myPrediction[sessionKey].team}</span>
              : <span style={{color:'#f5a623',fontWeight:700,fontFamily:"'Rajdhani',sans-serif",fontSize:15}}>
                  Runs: {myPrediction[sessionKey].runs} · Wkts: {myPrediction[sessionKey].wkts}
                </span>
            }
          </div>
        )}
        {!started && editingLocked && !hasPred && (
          <div style={{padding:'10px 14px', background:'rgba(231,76,60,0.06)', borderRadius:8, border:'1px solid rgba(231,76,60,0.2)', fontSize:12, color:'#e74c3c', marginBottom:10}}>
            ⚠️ You did not submit a prediction before the deadline. This session is now locked.
          </div>
        )}

        {/* LOCKED — match started, waiting for admin results (show my pick + all predictions) */}
        {started && !hasActual && (
          <div style={{marginBottom:10}}>
            <div style={{padding:'10px 14px', background:'rgba(224,86,253,0.06)', borderRadius:8, border:'1px solid rgba(224,86,253,0.2)', fontSize:12, color:'#c39bd3', marginBottom:8}}>
              🔒 Match in progress — predictions locked. Results will appear here once the admin enters actual scores.
              {hasPred && (
                <div style={{marginTop:6, color:'#e056fd', fontWeight:700}}>
                  {isTeamSession ? `Your pick: ${myPrediction[sessionKey]?.team}` : `Your pick: ${myPrediction[sessionKey]?.runs}R / ${myPrediction[sessionKey]?.wkts}W`}
                </div>
              )}
            </div>

            {/* CHANGE: Show all players' predictions once editing is locked, even before actuals */}
            {showAllPredictions && participants.length > 0 && (
              <div style={{marginTop:6}}>
                <div style={{fontSize:11, color:'#8899bb', marginBottom:6, letterSpacing:1}}>👁 ALL PREDICTIONS (Locked):</div>
                <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
                  {PLAYERS.map(p => {
                    const pred = allPredictions[p]?.[sessionKey]
                    if (!pred) return (
                      <div key={p} style={{
                        padding:'5px 10px', borderRadius:8,
                        background:'rgba(255,255,255,0.03)',
                        border:`1px solid rgba(255,255,255,0.06)`,
                        fontSize:12, opacity:0.5
                      }}>
                        <span style={{color: PLAYER_COLORS[p], fontWeight:700, fontFamily:"'Rajdhani',sans-serif"}}>{p}</span>
                        <span style={{color:'#666', marginLeft:5}}>—</span>
                      </div>
                    )
                    return (
                      <div key={p} style={{
                        padding:'5px 10px', borderRadius:8,
                        background: p === myPlayer ? 'rgba(245,166,35,0.08)' : 'rgba(255,255,255,0.04)',
                        border: p === myPlayer ? `1px solid rgba(245,166,35,0.3)` : `1px solid ${PLAYER_COLORS[p]}33`,
                        fontSize:12
                      }}>
                        <span style={{color: PLAYER_COLORS[p], fontWeight:700, fontFamily:"'Rajdhani',sans-serif"}}>{p}</span>
                        <span style={{color:'#ccc', marginLeft:5}}>
                          {isTeamSession ? pred.team : `${pred.runs}R/${pred.wkts}W`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ACTUAL RESULT + ALL PREDICTIONS — shown after match starts AND admin set actuals */}
        {started && hasActual && (
          <div style={{marginTop:8}}>
            <div style={{padding:'8px 12px', background:'rgba(46,204,113,0.08)', borderRadius:8, border:'1px solid rgba(46,204,113,0.25)', marginBottom:10, fontSize:13}}>
              <b style={{color:'#2ecc71'}}>✅ Actual Result: </b>
              {isTeamSession
                ? <span style={{color:'#fff', fontWeight:700}}>{actual.team}</span>
                : <span style={{color:'#fff', fontWeight:700}}>Runs: {actual.runs} / Wkts: {actual.wkts}</span>
              }
            </div>

            {/* All predictions revealed */}
            {(() => {
              // ── Recompute prize amounts from betAmount (correct carry-forward included)
              // instead of trusting result.each / result.pool which were stored by admin
              // using the old base bet and may be stale/wrong.
              const computedPool   = betAmount * participants.length
              const winnerCount    = result?.winners?.length || 0
              const computedEach   = winnerCount > 0 ? computedPool / winnerCount : 0
              // For refund: each participant gets their betAmount back
              const computedRefund = betAmount

              return (
                <>
                  <div style={{fontSize:11, color:'#8899bb', marginBottom:6, letterSpacing:1}}>ALL PREDICTIONS:</div>
                  <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
                    {PLAYERS.map(p => {
                      const pred = allPredictions[p]?.[sessionKey]
                      if (!pred) return null
                      const isWinner = result?.winners?.includes(p)
                      return (
                        <div key={p} style={{
                          padding:'5px 10px', borderRadius:8,
                          background: isWinner ? 'rgba(46,204,113,0.15)' : 'rgba(255,255,255,0.04)',
                          border: isWinner ? '1px solid rgba(46,204,113,0.4)' : `1px solid ${PLAYER_COLORS[p]}33`,
                          fontSize:12
                        }}>
                          <span style={{color: PLAYER_COLORS[p], fontWeight:700, fontFamily:"'Rajdhani',sans-serif"}}>{p}</span>
                          <span style={{color:'#ccc', marginLeft:5}}>
                            {isTeamSession ? pred.team : `${pred.runs}R/${pred.wkts}W`}
                          </span>
                          {isWinner && <span style={{color:'#2ecc71', marginLeft:4}}>🏆 +₹{computedEach.toFixed(2)}</span>}
                        </div>
                      )
                    })}
                  </div>

                  {/* Result summary */}
                  {hasResult && (
                    <div style={{
                      marginTop:10, padding:'8px 12px', borderRadius:8,
                      background: result.noWinner ? 'rgba(231,76,60,0.07)' : 'rgba(46,204,113,0.07)',
                      border: result.noWinner ? '1px solid rgba(231,76,60,0.25)' : '1px solid rgba(46,204,113,0.3)',
                      fontSize:12, color:'#aaa'
                    }}>
                      {result.refund
                        ? `🔄 No winner — ₹${computedRefund.toFixed(2)} refunded to each player.`
                        : result.s5SplitAll
                        ? `🏆 All players picked correctly — pool split equally! Each gets ₹${computedEach.toFixed(2)}`
                        : result.noWinner
                        ? `📤 No winner — ₹${computedPool.toFixed(2)} carried forward equally to next sessions.`
                        : winnerCount === 1
                        ? `🏆 Winner: ${result.winners[0]} — receives ₹${computedEach.toFixed(2)}`
                        : `🏆 Winners: ${result.winners?.join(', ')} — each receives ₹${computedEach.toFixed(2)}`
                      }
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}

        {/* CHANGE: Show all predictions when editing is locked but match hasn't started yet */}
        {!started && editingLocked && participants.length > 0 && (
          <div style={{marginTop:8}}>
            <div style={{fontSize:11, color:'#8899bb', marginBottom:6, letterSpacing:1}}>👁 ALL PREDICTIONS (Locked — awaiting match start):</div>
            <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
              {PLAYERS.map(p => {
                const pred = allPredictions[p]?.[sessionKey]
                if (!pred) return (
                  <div key={p} style={{
                    padding:'5px 10px', borderRadius:8,
                    background:'rgba(255,255,255,0.02)',
                    border:`1px solid rgba(255,255,255,0.05)`,
                    fontSize:12, opacity:0.4
                  }}>
                    <span style={{color: PLAYER_COLORS[p], fontWeight:700, fontFamily:"'Rajdhani',sans-serif"}}>{p}</span>
                    <span style={{color:'#555', marginLeft:5}}>no prediction</span>
                  </div>
                )
                return (
                  <div key={p} style={{
                    padding:'5px 10px', borderRadius:8,
                    background: p === myPlayer ? 'rgba(245,166,35,0.08)' : 'rgba(255,255,255,0.04)',
                    border: p === myPlayer ? `1px solid rgba(245,166,35,0.3)` : `1px solid ${PLAYER_COLORS[p]}33`,
                    fontSize:12
                  }}>
                    <span style={{color: PLAYER_COLORS[p], fontWeight:700, fontFamily:"'Rajdhani',sans-serif"}}>{p}</span>
                    <span style={{color:'#ccc', marginLeft:5}}>
                      {isTeamSession ? pred.team : `${pred.runs}R/${pred.wkts}W`}
                    </span>
                    {p === myPlayer && <span style={{color:'#f5a623', marginLeft:4, fontSize:10}}>← you</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Edit history — only my own */}
        {myHistory?.[sessionKey]?.length > 0 && (
          <EditHistoryPanel history={myHistory[sessionKey]} />
        )}
      </div>
    </div>
  )
})

const inputStyle = {
  width:'100%', padding:'9px 12px', borderRadius:8,
  border:'1px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.06)',
  color:'#fff', fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:15,
  outline:'none', boxSizing:'border-box'
}

// ── MATCH PREDICTION CARD ────────────────────────────────────────────────────
function MatchPredCard({ match, myPlayer, allMatchPred, onSave, onSaveAll, onDelete, saving }) {
  const [t1, t2] = getTeams(match)
  const editingLocked = isEditingLocked(match)
  const started   = isMatchStarted(match)
  const completed = isMatchCompleted(match)

  const matchno = String(match.matchno)
  const mpData  = allMatchPred[matchno] || {}

  // Refs for Save All — one per session
  const sessionCardRefs = useRef({})

  const disabledSessions = mpData.disabledSessions || {}

  const sessionsConfig = [
    { key:'s1', label:`Toss Winner (${t1} vs ${t2})`, num:1 },
    { key:'s2', label:'PP1 Score — 1st Innings (6 Overs)', num:2 },
    { key:'s3', label:'1st Innings Final Score', num:3 },
    { key:'s4', label:'PP1 Score — 2nd Innings (6 Overs)', num:4 },
    { key:'s5', label:`Match Winner (${t1} vs ${t2})`, num:5 },
  ]

  const allPlayerPreds = useMemo(() => {
    const result = {}
    PLAYERS.forEach(p => { result[p] = mpData.playerPredictions?.[p] || {} })
    return result
  }, [mpData.playerPredictions])

  const myPreds   = useMemo(() => allPlayerPreds[myPlayer] || {}, [allPlayerPreds, myPlayer])
  const myHistory = useMemo(() => mpData.editHistory?.[myPlayer] || {}, [mpData.editHistory, myPlayer])

  const sessionBets = useMemo(() => {
    const base = Array(SESSION_COUNT).fill(BASE_BET)
    const joined = PLAYERS.filter(p => allPlayerPreds[p] && Object.keys(allPlayerPreds[p]).length > 0)
    const results = mpData.results || {}

    let s1Carry = 0
    const s1Result = results['s1']
    if (s1Result?.noWinner && !s1Result?.refund && s1Result?.carryForwardAmount > 0) {
      // carryForwardAmount = total pool (e.g. ₹20 for 2 players × ₹10).
      // Split equally across 4 remaining sessions → per-session total = carryForwardAmount / 4.
      // Per-player addition = that divided by number of joined players.
      const perPlayerAdd = joined.length > 0
        ? (s1Result.carryForwardAmount / 4) / joined.length
        : 0
      s1Carry = perPlayerAdd
    }

    for (let i = 0; i < SESSION_COUNT; i++) {
      const sk = `s${i+1}`
      if (sk === 's1') {
        base[0] = BASE_BET
      } else {
        base[i] = BASE_BET + s1Carry
      }
    }
    return base
  }, [mpData, allPlayerPreds])

  const allSessionsFilled = useMemo(() => {
    const activeSessions = sessionsConfig.filter(sc => !disabledSessions[sc.key])
    return activeSessions.every(sc => myPreds[sc.key] !== undefined)
  }, [myPreds, disabledSessions])

  const myWins = useMemo(() => {
    if (!started) return 0
    const results = mpData.results || {}
    return Object.values(results).filter(r => r?.winners?.includes(myPlayer)).length
  }, [mpData, myPlayer, started])

  const matchTimeLabel = match.matchTime === '15:30' ? '3:30 PM IST' : match.matchTime === '19:30' ? '7:30 PM IST' : match.matchTime || ''

  const [saveAllStatus, setSaveAllStatus] = useState(null)

  async function handleSaveAll() {
    // Validate all active, unlocked sessions first
    const toSave = []
    for (const sc of sessionsConfig) {
      if (disabledSessions[sc.key]) continue
      const ref = sessionCardRefs.current[sc.key]
      if (!ref || ref.isLocked) continue
      const validation = ref.validate()
      if (!validation.ok) {
        alert(`⚠️ ${validation.msg}`)
        return
      }
      toSave.push({ sessionKey: sc.key, ...ref.getPred() })
    }
    if (toSave.length === 0) {
      alert('Nothing to save — all sessions are either locked or already predicted.')
      return
    }
    setSaveAllStatus('saving')
    // ONE single API call for all sessions
    const ok = await onSaveAll(matchno, toSave)
    if (ok) {
      setSaveAllStatus('done')
      setTimeout(() => setSaveAllStatus(null), 3000)
    } else {
      setSaveAllStatus(null)
    }
  }

  return (
    <div style={{
      marginBottom:24, borderRadius:16, overflow:'hidden',
      border:'1px solid rgba(245,166,35,0.2)',
      background:'rgba(8,16,36,0.7)'
    }}>
      {/* Match header */}
      <div style={{
        padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between',
        background:'rgba(245,166,35,0.07)', borderBottom:'1px solid rgba(245,166,35,0.15)'
      }}>
        <div>
          <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:900,fontSize:17,color:'#f5a623'}}>
            Match {match.matchno} — {match.teams}
          </div>
          <div style={{fontSize:11,color:'#8899bb',marginTop:2}}>
            {match.date ? new Date(match.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—'}
            {matchTimeLabel ? ` · ${matchTimeLabel}` : ''}
            {started && !completed && <span style={{marginLeft:8,color:'#e056fd',fontWeight:700}}>🔴 LIVE / LOCKED</span>}
            {completed && !mpData.actuals && <span style={{marginLeft:8,color:'#e074c3',fontWeight:700}}>⏳ Awaiting Admin Results</span>}
            {started && mpData.actuals && myWins > 0 && <span style={{marginLeft:8,color:'#2ecc71',fontWeight:700}}>🏆 You won {myWins} session(s)!</span>}
            {!started && !editingLocked && <span style={{marginLeft:8,color:'#2ecc71',fontWeight:700}}>🟢 Open for Predictions</span>}
            {!started && editingLocked && <span style={{marginLeft:8,color:'#e74c3c',fontWeight:700}}>🔒 Deadline passed</span>}
          </div>
        </div>
        <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          {!started && allSessionsFilled && (
            <div style={{fontSize:11, padding:'4px 10px', borderRadius:20, background:'rgba(46,204,113,0.12)', color:'#2ecc71', border:'1px solid rgba(46,204,113,0.3)'}}>
              ✅ All Predicted
            </div>
          )}
          {!started && !allSessionsFilled && !editingLocked && (
            <div style={{fontSize:11, padding:'4px 10px', borderRadius:20, background:'rgba(231,76,60,0.1)', color:'#e74c3c', border:'1px solid rgba(231,76,60,0.25)'}}>
              ⚠️ Incomplete
            </div>
          )}
          <div style={{
            fontSize:13, fontFamily:"'Rajdhani',sans-serif", fontWeight:700,
            color: completed ? '#2ecc71' : '#f5a623',
            padding:'5px 12px', borderRadius:20,
            border:`1px solid ${completed ? 'rgba(46,204,113,0.3)' : 'rgba(245,166,35,0.3)'}`,
            background: completed ? 'rgba(46,204,113,0.08)' : 'rgba(245,166,35,0.08)'
          }}>
            {completed ? `🏆 ${match.teamwon} Won` : started ? '🔒 In Progress' : '🔮 Predict Now'}
          </div>
        </div>
      </div>

      <div style={{padding:'14px 18px'}}>
        {/* Countdown timer for upcoming matches */}
        {!started && <PredDeadlineTimer match={match} />}

        {sessionsConfig.map((sc, i) => (
          <SessionCard
            key={sc.key}
            sessionNum={sc.num}
            sessionKey={sc.key}
            label={sc.label}
            match={match}
            myPlayer={myPlayer}
            myPrediction={myPreds}
            myHistory={myHistory}
            allPredictions={allPlayerPreds}
            actual={mpData.actuals?.[sc.key]}
            betAmount={sessionBets[i]}
            result={mpData.results?.[sc.key]}
            disabled={!!disabledSessions[sc.key]}
            onSave={(sessionKey, pred, summary) => onSave(matchno, sessionKey, pred, summary)}
            onDelete={!editingLocked && !started ? (sessionKey) => onDelete(matchno, sessionKey) : undefined}
            saving={saving}
            cardRef={el => { sessionCardRefs.current[sc.key] = el }}
          />
        ))}

        {/* Save All button — only shown when editing is open */}
        {!started && !editingLocked && (
          <div style={{marginTop:8, paddingTop:12, borderTop:'1px solid rgba(255,255,255,0.07)'}}>
            {saving && (
              <div style={{
                marginBottom:10, padding:'10px 14px', borderRadius:10,
                background:'rgba(245,166,35,0.1)', border:'1px solid rgba(245,166,35,0.3)',
                display:'flex', alignItems:'center', gap:10, fontSize:13, color:'#f5a623',
                fontFamily:"'Rajdhani',sans-serif", fontWeight:700
              }}>
                <span style={{fontSize:18, animation:'spin 1s linear infinite'}}>⏳</span>
                Saving to cloud — please wait, do not close this page…
              </div>
            )}
            <button
              onClick={handleSaveAll}
              disabled={saving}
              style={{
                width:'100%', padding:'13px', borderRadius:12,
                cursor: saving ? 'not-allowed' : 'pointer',
                background: saveAllStatus === 'done' ? '#2ecc71' : saving ? 'rgba(245,166,35,0.4)' : 'linear-gradient(135deg,#f5a623,#e67e22)',
                color: saving ? '#888' : '#000',
                fontFamily:"'Rajdhani',sans-serif", fontWeight:900, fontSize:15,
                letterSpacing:1, border:'none', opacity: saving ? 0.7 : 1,
                transition:'all 0.3s', boxShadow: saving ? 'none' : '0 4px 16px rgba(245,166,35,0.25)'
              }}
            >
              {saving ? '⏳ Saving to Cloud…' : saveAllStatus === 'done' ? '✅ All Predictions Saved!' : '💾 Save All Predictions'}
            </button>
            <div style={{fontSize:11, color:'#8899bb', textAlign:'center', marginTop:6}}>
              Saves all sessions in one click • Individual save buttons still work
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── LEADERBOARD PANEL ────────────────────────────────────────────────────────
function PredLeaderboard({ allPredData }) {
  const scores = useMemo(() => {
    const acc = {}
    PLAYERS.forEach(p => { acc[p] = { wins:0, earnings:0, sessions:0, refunds:0 } })

    Object.values(allPredData).forEach(mpData => {
      const results = mpData.results || {}
      const pp = mpData.playerPredictions || {}

      // Players who participated in this match (have at least one session prediction)
      const joinedPlayers = PLAYERS.filter(p => pp[p] && Object.keys(pp[p]).length > 0)
      joinedPlayers.forEach(p => { acc[p].sessions++ })

      // Recompute carry-forward from s1 to get correct betAmount per session
      let s1Carry = 0
      const s1Result = results['s1']
      if (s1Result?.noWinner && !s1Result?.refund && s1Result?.carryForwardAmount > 0) {
        s1Carry = joinedPlayers.length > 0
          ? (s1Result.carryForwardAmount / 4) / joinedPlayers.length
          : 0
      }

      const SESSION_KEYS = ['s1','s2','s3','s4','s5']
      SESSION_KEYS.forEach((sk, i) => {
        const r = results[sk]
        if (!r) return

        // Correct betAmount for this session (same formula as sessionBets in MatchPredCard)
        const betPerPlayer = sk === 's1' ? BASE_BET : BASE_BET + s1Carry

        // Players who predicted in THIS specific session
        const sessionPlayers = PLAYERS.filter(p => pp[p]?.[sk] !== undefined)
        const computedPool = betPerPlayer * sessionPlayers.length

        if (r.refund) {
          // Each participating player gets their betAmount back
          sessionPlayers.forEach(p => {
            if (acc[p]) acc[p].refunds += betPerPlayer
          })
        }

        if (r.winners && r.winners.length > 0) {
          // Prize = full pool divided among winners
          const computedEach = computedPool / r.winners.length
          r.winners.forEach(p => {
            if (!acc[p]) return
            acc[p].wins++
            acc[p].earnings += computedEach
          })
        }
      })
    })

    return PLAYERS.map(p => ({ name:p, ...acc[p] }))
      .sort((a,b) => (b.earnings + b.refunds) - (a.earnings + a.refunds) || b.wins - a.wins)
  }, [allPredData])

  return (
    <div style={{marginTop:24, borderRadius:14, overflow:'hidden', border:'1px solid rgba(255,255,255,0.1)'}}>
      <div style={{padding:'12px 16px', background:'rgba(245,166,35,0.07)', borderBottom:'1px solid rgba(245,166,35,0.15)', fontFamily:"'Rajdhani',sans-serif", fontWeight:800, fontSize:15, color:'#f5a623'}}>
        🏆 Prediction Leaderboard
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
          <thead>
            <tr style={{background:'rgba(255,255,255,0.03)'}}>
              {['Rank','Player','Match Participations','Session Wins','Winnings (₹)','Refunds (₹)','Total (₹)'].map(h => (
                <th key={h} style={{padding:'8px 12px',textAlign:'left',color:'#8899bb',fontWeight:700,fontFamily:"'Rajdhani',sans-serif",borderBottom:'1px solid rgba(255,255,255,0.08)'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scores.map((s,i) => {
              const total = s.earnings + s.refunds
              return (
                <tr key={s.name} style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                  <td style={{padding:'8px 12px',color:'#f5a623',fontWeight:700,fontFamily:"'Rajdhani',sans-serif"}}>#{i+1}</td>
                  <td style={{padding:'8px 12px'}}>
                    <span style={{color: PLAYER_COLORS[s.name], fontWeight:700, fontFamily:"'Rajdhani',sans-serif"}}>{s.name}</span>
                  </td>
                  <td style={{padding:'8px 12px',color:'#fff'}}>{s.sessions}</td>
                  <td style={{padding:'8px 12px',color:'#fff'}}>{s.wins}</td>
                  <td style={{padding:'8px 12px',color: s.earnings>0 ? '#2ecc71' : '#aaa', fontWeight:700}}>
                    {s.earnings > 0 ? `+₹${s.earnings.toFixed(2)}` : '₹0'}
                  </td>
                  <td style={{padding:'8px 12px',color: s.refunds>0 ? '#3498db' : '#aaa', fontWeight:700}}>
                    {s.refunds > 0 ? `↩₹${s.refunds.toFixed(2)}` : '₹0'}
                  </td>
                  <td style={{padding:'8px 12px',color: total>0 ? '#f5a623' : '#aaa', fontWeight:700}}>
                    {total > 0 ? `₹${total.toFixed(2)}` : '₹0'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── MAIN EXPORT ──────────────────────────────────────────────────────────────
export default function PredictionTab({ matches }) {
  const [myPlayer,    setMyPlayer]    = useState(() => localStorage.getItem('vois_pred_identity') || null)
  const [allPredData, setAllPredData] = useState({})
  const [loadingPred, setLoadingPred] = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [activeMatch, setActiveMatch] = useState(null)
  const [view,        setView]        = useState('active')

  const loadPred = useCallback(async () => {
    if (PRED_BIN_ID === 'PASTE_YOUR_NEW_JSONBIN_ID_HERE') return
    setLoadingPred(true)
    const data = await fetchPredData()
    setAllPredData(data)
    setLoadingPred(false)
  }, [])

  useEffect(() => { loadPred() }, [loadPred])

  // Single-session save — uses current allPredData state, NO extra GET call
  const handleSave = useCallback(async (matchno, sessionKey, pred, summary) => {
    if (!myPlayer) return
    setSaving(true)
    try {
      const updated = clone(allPredData)
      if (!updated[matchno]) updated[matchno] = { playerPredictions:{}, editHistory:{} }
      if (!updated[matchno].playerPredictions) updated[matchno].playerPredictions = {}
      if (!updated[matchno].playerPredictions[myPlayer]) updated[matchno].playerPredictions[myPlayer] = {}
      if (!updated[matchno].editHistory) updated[matchno].editHistory = {}
      if (!updated[matchno].editHistory[myPlayer]) updated[matchno].editHistory[myPlayer] = {}
      if (!updated[matchno].editHistory[myPlayer][sessionKey]) updated[matchno].editHistory[myPlayer][sessionKey] = []

      updated[matchno].editHistory[myPlayer][sessionKey].push({ ts: new Date().toISOString(), summary })
      updated[matchno].playerPredictions[myPlayer][sessionKey] = pred

      const ok = await savePredData(updated)
      if (ok) {
        setAllPredData(updated)
        return true
      } else {
        alert('❌ Save failed. Check your network connection.')
        return false
      }
    } finally {
      setSaving(false)
    }
  }, [myPlayer, allPredData])

  // Batch save — writes ALL sessions in ONE single API call
  const handleSaveAll = useCallback(async (matchno, sessions) => {
    // sessions = [{ sessionKey, pred, summary }, ...]
    if (!myPlayer || sessions.length === 0) return
    setSaving(true)
    try {
      const updated = clone(allPredData)
      if (!updated[matchno]) updated[matchno] = { playerPredictions:{}, editHistory:{} }
      if (!updated[matchno].playerPredictions) updated[matchno].playerPredictions = {}
      if (!updated[matchno].playerPredictions[myPlayer]) updated[matchno].playerPredictions[myPlayer] = {}
      if (!updated[matchno].editHistory) updated[matchno].editHistory = {}
      if (!updated[matchno].editHistory[myPlayer]) updated[matchno].editHistory[myPlayer] = {}

      for (const { sessionKey, pred, summary } of sessions) {
        if (!updated[matchno].editHistory[myPlayer][sessionKey]) updated[matchno].editHistory[myPlayer][sessionKey] = []
        updated[matchno].editHistory[myPlayer][sessionKey].push({ ts: new Date().toISOString(), summary })
        updated[matchno].playerPredictions[myPlayer][sessionKey] = pred
      }

      const ok = await savePredData(updated)
      if (ok) {
        setAllPredData(updated)
        return true
      } else {
        alert('❌ Save failed. Check your network connection.')
        return false
      }
    } finally {
      setSaving(false)
    }
  }, [myPlayer, allPredData])

  const handleDelete = useCallback(async (matchno, sessionKey) => {
    if (!myPlayer) return
    if (!window.confirm('Delete your prediction for this session? This cannot be undone.')) return
    setSaving(true)
    try {
      const updated = clone(allPredData)
      if (updated[matchno]?.playerPredictions?.[myPlayer]?.[sessionKey] !== undefined) {
        delete updated[matchno].playerPredictions[myPlayer][sessionKey]
      }
      const ok = await savePredData(updated)
      if (ok) {
        setAllPredData(updated)
        alert('🗑️ Prediction deleted.')
      } else {
        alert('❌ Delete failed.')
      }
    } finally {
      setSaving(false)
    }
  }, [myPlayer, allPredData])

  // Upcoming = not completed (includes locked/in-progress)
  // Past = completed
  const upcomingMatches = useMemo(() =>
    matches.filter(m => m.teams && !isMatchCompleted(m))
      .sort((a,b) => (getMatchDateTime(a)||0) - (getMatchDateTime(b)||0)),
    [matches])
  const pastMatches = useMemo(() =>
    matches.filter(m => m.teams && isMatchCompleted(m))
      .sort((a,b) => (getMatchDateTime(b)||0) - (getMatchDateTime(a)||0)),
    [matches])
  const displayMatches = view === 'past' ? pastMatches : upcomingMatches

  const isIdentityLocked = !!localStorage.getItem('vois_pred_identity_locked')

  if (!myPlayer) return <IdentityGate onIdentified={name => { setMyPlayer(name); loadPred() }} />

  if (PRED_BIN_ID === 'PASTE_YOUR_NEW_JSONBIN_ID_HERE') {
    return (
      <div style={{padding:30,textAlign:'center',color:'#e74c3c',fontFamily:"'Rajdhani',sans-serif",fontSize:15}}>
        ⚙️ <b>Setup Required:</b> Open <code>PredictionTab.jsx</code> and paste your new JSONBin ID into <code>PRED_BIN_ID</code>.
      </div>
    )
  }

  return (
    <div className="section">
      {/* Header */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10}}>
        <div>
          <div className="sec-title" style={{marginBottom:2}}>🔮 Match Predictions</div>
          <div style={{fontSize:12, color:'#8899bb', display:'flex', alignItems:'center', gap:8}}>
            Playing as: <b style={{color: PLAYER_COLORS[myPlayer]}}>{myPlayer}</b>
            <span style={{fontSize:10, color:'rgba(231,76,60,0.7)', padding:'1px 6px', border:'1px solid rgba(231,76,60,0.2)', borderRadius:4}}>🔒 Locked Identity</span>
          </div>
        </div>
        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          {['active','past','leaderboard'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding:'7px 14px', borderRadius:10, cursor:'pointer', fontSize:13,
              fontFamily:"'Rajdhani',sans-serif", fontWeight:700, letterSpacing:0.5, border:'none',
              background: view===v ? '#f5a623' : 'rgba(255,255,255,0.07)',
              color: view===v ? '#000' : '#8899bb', transition:'all 0.2s'
            }}>
              {v==='active' ? '🟢 Upcoming' : v==='past' ? '📜 Past' : '🏆 Leaderboard'}
            </button>
          ))}
          <button onClick={loadPred} disabled={loadingPred} style={{
            padding:'7px 12px', borderRadius:10, cursor:'pointer', fontSize:13,
            fontFamily:"'Rajdhani',sans-serif", fontWeight:700, border:'1px solid rgba(255,255,255,0.1)',
            background:'rgba(255,255,255,0.05)', color: loadingPred ? '#555' : '#8899bb',
            opacity: loadingPred ? 0.6 : 1
          }}>{loadingPred ? '⏳' : '⟳'} Refresh</button>
        </div>
      </div>

      {loadingPred && (
        <div style={{textAlign:'center', padding:20, color:'#8899bb', fontSize:13}}>⏳ Loading predictions...</div>
      )}

      {view === 'leaderboard' && <PredLeaderboard allPredData={allPredData} />}

      {view !== 'leaderboard' && (
        displayMatches.length === 0
          ? <div style={{textAlign:'center',padding:30,color:'#8899bb',fontSize:13}}>No {view==='past'?'past':'upcoming'} matches found.</div>
          : displayMatches.map(m => (
              <MatchPredCard
                key={m.matchno}
                match={m}
                myPlayer={myPlayer}
                allMatchPred={allPredData}
                onSave={handleSave}
                onSaveAll={handleSaveAll}
                onDelete={handleDelete}
                saving={saving}
              />
            ))
      )}

      {/* Rules quick ref */}
      <details style={{marginTop:20, borderRadius:12, border:'1px solid rgba(255,255,255,0.08)', overflow:'hidden'}}>
        <summary style={{padding:'12px 16px', cursor:'pointer', fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:14, color:'#f5a623', background:'rgba(255,255,255,0.02)'}}>
          📖 Quick Rules Reference
        </summary>
        <div style={{padding:'14px 16px', fontSize:12, color:'#aaa', lineHeight:1.8}}>
          <b style={{color:'#fff'}}>Base Bet:</b> ₹10/session/player. All 5 sessions run per match.<br/>
          <b style={{color:'#fff'}}>Session 1:</b> Toss winner — pick Team 1 or Team 2.<br/>
          <b style={{color:'#fff'}}>Sessions 2 & 4:</b> Predict PP1 runs & wickets (1st / 2nd innings). Closest runs wins; tie broken by fewer wkts predicted.<br/>
          <b style={{color:'#fff'}}>Session 3:</b> Full 1st innings score. Same runs/wkts logic.<br/>
          <b style={{color:'#fff'}}>Session 5:</b> Match winner — pick Team 1 or Team 2.<br/>
          <b style={{color:'#fff'}}>No Winner (S1):</b> If all predict same team (right or wrong) → full pool carries to S2/S3/S4/S5 equally (+₹ base_bet ÷ 4 each).<br/>
          <b style={{color:'#fff'}}>Session 5 Special:</b> All same & correct → split pool equally. All wrong → full refund.<br/>
          <b style={{color:'#fff'}}>Disabled Sessions:</b> Admin can disable sessions if match is short — entry fee refunded.<br/>
          <b style={{color:'#fff'}}>Mandatory:</b> All session predictions required. No empty fields.<br/>
          <b style={{color:'#fff'}}>Edit Deadline:</b> 30 minutes before match start (7:00 PM for 7:30 PM match; 3:00 PM for 3:30 PM match).<br/>
          <b style={{color:'#fff'}}>Results Visibility:</b> All predictions shown once editing locks. Winners revealed after admin enters actual scores.
        </div>
      </details>
    </div>
  )
}
