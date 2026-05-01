// ─── PredictionTab.jsx ──────────────────────────────────────────────────────
// Drop-in component for VOIS Panthers IPL 2026 – Match Prediction Fantasy Game
// Usage in App.jsx:
//   import PredictionTab from './PredictionTab'
//   ...add { id:'prediction', label:'🔮 Prediction' } to navItems (ipl2026 only)
//   ...add <div style={activeSection==='prediction'?{}:{display:'none'}}><PredictionTab matches={matches} /></div>
//
// Storage: all prediction data lives in a SEPARATE JSONBin.
//   ► Create a new PUBLIC bin on jsonbin.io and paste its ID into PRED_BIN_ID below.
//   ► Shape: { predictions: { [matchno]: { sessions: {...}, playerPredictions: {...}, editHistory: {...} } } }
//
// Authentication: ONE-TIME name selection stored in localStorage under 'vois_pred_identity'.
//   Players pick their own name; they cannot see others' predictions before match starts.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'

// ── CONFIG ──────────────────────────────────────────────────────────────────
const PLAYERS       = ['Ashish','Kalpesh','Nilesh','Prabhat','Pritam','Sudhir','Swapnil']
const PLAYER_COLORS = {
  Ashish:'#f5a623', Kalpesh:'#3498db', Nilesh:'#2ecc71',
  Prabhat:'#e74c3c', Pritam:'#e056fd', Sudhir:'#00cec9', Swapnil:'#fd9644'
}
const PRED_BIN_ID   = '69f4599e856a6821899363fd'  // ← create a fresh PUBLIC bin
const JSONBIN_BASE  = 'https://api.jsonbin.io/v3/b'
const BASE_BET      = 10   // ₹ per session per player
const SESSION_COUNT = 5

// ── HELPERS ─────────────────────────────────────────────────────────────────
function getMatchDateTime(m) {
  if (!m?.date || !m?.matchTime) return null
  const [h, min] = m.matchTime.split(':').map(Number)
  const dt = new Date(m.date + 'T00:00:00')
  dt.setHours(h, min, 0, 0)
  return dt
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
// Deep clone safe for plain objects
const clone = v => JSON.parse(JSON.stringify(v))

// ── WINNING CALC ─────────────────────────────────────────────────────────────
/**
 * Calculate session winners and distribute money.
 * @param {string[]} joined       - players who joined the match
 * @param {object}   predictions  - { [player]: prediction }
 * @param {string}   sessionKey   - 's1'...'s5'
 * @param {object}   actual       - { team, runs, wkts } depending on session
 * @param {number}   betPerPerson - ₹ this session
 * @returns { winners: string[], losers: string[], each: number, refund: boolean,
 *            carryForwardAmount: number, noWinner: boolean }
 */
function calcSessionResult(joined, predictions, sessionKey, actual, betPerPerson) {
  const participants = joined.filter(p => predictions[p]?.[sessionKey] !== undefined)
  if (participants.length === 0) return { winners:[], losers:[], each:0, noWinner:true, refund:false, carryForwardAmount: betPerPerson * joined.length }

  const pool = betPerPerson * participants.length
  let winners = []

  if (sessionKey === 's1' || sessionKey === 's5') {
    // Team pick sessions
    const correctTeam = actual.team
    const correct = participants.filter(p => predictions[p][sessionKey]?.team === correctTeam)
    const all = participants.length
    const allSame = new Set(participants.map(p => predictions[p][sessionKey]?.team)).size === 1
    if (allSame) {
      // All same choice → check if they're all right or all wrong
      if (correct.length === all) {
        // All correct & all same → no winner (edge: everyone wins = no loser to fund)
        // Per rules: if all predicted same team that lost = no winner
        // Also if all predicted same team that won = no winner (all right but no losers)
        return { winners:[], losers:[], each:0, noWinner:true,
                 refund: sessionKey === 's5', // Session 5 special: refund
                 carryForwardAmount: pool }
      } else {
        // All wrong
        if (sessionKey === 's5') {
          // Refund
          return { winners:[], losers:[], each:0, noWinner:true, refund:true, carryForwardAmount:0, pool }
        }
        return { winners:[], losers:[], each:0, noWinner:true, refund:false, carryForwardAmount: pool }
      }
    }
    winners = correct
    if (winners.length === 0) {
      if (sessionKey === 's5') return { winners:[], losers:[], each:0, noWinner:true, refund:true, carryForwardAmount:0, pool }
      return { winners:[], losers:[], each:0, noWinner:true, refund:false, carryForwardAmount: pool }
    }
  } else {
    // Runs + Wickets sessions (s2, s3, s4)
    const actualRuns = actual.runs
    const actualWkts = actual.wkts
    // Find closest run prediction
    const diffs = participants.map(p => ({
      p,
      runDiff: Math.abs((predictions[p][sessionKey]?.runs || 0) - actualRuns),
      predWkts: predictions[p][sessionKey]?.wkts || 0
    }))
    const minDiff = Math.min(...diffs.map(d => d.runDiff))
    let closest = diffs.filter(d => d.runDiff === minDiff)
    // Tiebreak: fewer wickets predicted (closer to actual if equal diff)
    // Rule: whoever gave LESS wkts among tie wins
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
    const r = await fetch(`${JSONBIN_BASE}/${PRED_BIN_ID}/latest`, { headers:{ 'X-Bin-Meta':'false' } })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const d = await r.json()
    return d.predictions || {}
  } catch(e) {
    console.error('PredFetch:', e)
    return {}
  }
}

async function savePredData(predictions) {
  try {
    const r = await fetch(`${JSONBIN_BASE}/${PRED_BIN_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type':'application/json' },
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
  const [confirmed, setConfirmed] = useState(false)

  const handleConfirm = () => {
    if (!chosen) return
    localStorage.setItem('vois_pred_identity', chosen)
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
          <b style={{color:'#e74c3c'}}>This is a one-time setup and cannot be changed.</b>
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
            ⚠️ You're about to lock in as <b>{chosen}</b>. Once set, this cannot be changed.
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
  const sorted = [...history].reverse() // latest on top
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

// ── SESSION CARD ─────────────────────────────────────────────────────────────
function SessionCard({
  sessionNum, sessionKey, label, match, myPrediction, myHistory,
  locked, allPredictions, actual, betAmount, result,
  onSave, saving
}) {
  const teams = getTeams(match)
  const [t1, t2] = teams
  const started  = isMatchStarted(match)
  const completed = isMatchCompleted(match)
  const hasPred  = myPrediction?.[sessionKey] !== undefined

  // Local form state
  const [teamPick, setTeamPick] = useState(myPrediction?.[sessionKey]?.team || '')
  const [runs,     setRuns]     = useState(myPrediction?.[sessionKey]?.runs ?? '')
  const [wkts,     setWkts]     = useState(myPrediction?.[sessionKey]?.wkts ?? '')

  const isTeamSession  = sessionKey === 's1' || sessionKey === 's5'
  const isScoreSession = !isTeamSession

  const canEdit = !locked && !started
  const hasResult = !!actual && completed

  // How many participants
  const participants = PLAYERS.filter(p => allPredictions[p]?.[sessionKey] !== undefined)

  function buildSummary() {
    if (isTeamSession) return `Picked: ${teamPick}`
    return `Runs: ${runs}, Wkts: ${wkts}`
  }

  function handleSave() {
    let pred = {}
    if (isTeamSession) {
      if (!teamPick) return alert('Please select a team!')
      pred = { team: teamPick }
    } else {
      const r = parseInt(runs), w = parseInt(wkts)
      if (isNaN(r) || isNaN(w) || r < 0 || w < 0 || w > 10) return alert('Enter valid whole numbers (Runs ≥ 0, Wickets 0–10)')
      pred = { runs: r, wkts: w }
    }
    onSave(sessionKey, pred, buildSummary())
  }

  const winnerList = result?.winners || []
  const amIWinner = winnerList.includes(/* injected from parent */undefined)

  return (
    <div style={{
      marginBottom:16, borderRadius:14,
      border:`1px solid ${hasResult ? 'rgba(46,204,113,0.3)' : locked ? 'rgba(231,76,60,0.2)' : 'rgba(255,255,255,0.1)'}`,
      background:'rgba(255,255,255,0.02)', overflow:'hidden'
    }}>
      {/* Header */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'10px 14px',
        background: hasResult ? 'rgba(46,204,113,0.06)' : 'rgba(255,255,255,0.03)',
        borderBottom:'1px solid rgba(255,255,255,0.06)'
      }}>
        <div style={{fontFamily:"'Rajdhani',sans-serif", fontWeight:800, fontSize:14, color:'#f5a623'}}>
          Session {sessionNum}: {label}
        </div>
        <div style={{display:'flex', gap:6, alignItems:'center'}}>
          <span style={{
            fontSize:11, padding:'3px 8px', borderRadius:20,
            background: hasPred ? 'rgba(46,204,113,0.15)' : 'rgba(255,255,255,0.05)',
            color: hasPred ? '#2ecc71' : '#8899bb',
            border: hasPred ? '1px solid rgba(46,204,113,0.3)' : '1px solid rgba(255,255,255,0.1)'
          }}>{hasPred ? '✅ Predicted' : '⏳ Pending'}</span>
          {locked && !started && <span style={{fontSize:11,color:'#e74c3c',padding:'3px 8px',border:'1px solid rgba(231,76,60,0.3)',borderRadius:20}}>🔒 Saved</span>}
          {started && <span style={{fontSize:11,color:'#e056fd',padding:'3px 8px',border:'1px solid rgba(224,86,253,0.3)',borderRadius:20}}>🔐 Locked</span>}
        </div>
      </div>

      <div style={{padding:'12px 14px'}}>
        {/* Bet amount */}
        <div style={{fontSize:12, color:'#8899bb', marginBottom:10}}>
          💰 Bet: <b style={{color:'#f5a623'}}>₹{betAmount.toFixed(2)}</b> per player this session
          {participants.length > 0 && <> · Pool: <b style={{color:'#2ecc71'}}>₹{(betAmount * participants.length).toFixed(2)}</b></>}
        </div>

        {/* INPUT AREA — only if not started */}
        {!started && (
          <div style={{marginBottom:10}}>
            {isTeamSession ? (
              <div style={{display:'flex',gap:8, marginBottom:8}}>
                {[t1, t2].map(team => (
                  <button
                    key={team}
                    onClick={() => canEdit && setTeamPick(team)}
                    disabled={!canEdit}
                    style={{
                      flex:1, padding:'10px 6px', borderRadius:10, cursor: canEdit?'pointer':'not-allowed',
                      border: teamPick===team ? '2px solid #f5a623' : '2px solid rgba(255,255,255,0.1)',
                      background: teamPick===team ? 'rgba(245,166,35,0.15)' : 'rgba(255,255,255,0.04)',
                      color: teamPick===team ? '#f5a623' : '#aaa',
                      fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:13, transition:'all 0.2s'
                    }}
                  >{team}</button>
                ))}
              </div>
            ) : (
              <div style={{display:'flex', gap:10, marginBottom:8}}>
                <div style={{flex:1}}>
                  <label style={{fontSize:11,color:'#8899bb',display:'block',marginBottom:4}}>Runs (whole number)</label>
                  <input
                    type="number" min="0" step="1"
                    value={runs} onChange={e => canEdit && setRuns(e.target.value.replace(/\D/,''))}
                    disabled={!canEdit}
                    style={inputStyle}
                    placeholder="e.g. 56"
                  />
                </div>
                <div style={{flex:1}}>
                  <label style={{fontSize:11,color:'#8899bb',display:'block',marginBottom:4}}>Wickets (0–10)</label>
                  <input
                    type="number" min="0" max="10" step="1"
                    value={wkts} onChange={e => canEdit && setWkts(e.target.value.replace(/\D/,''))}
                    disabled={!canEdit}
                    style={inputStyle}
                    placeholder="e.g. 2"
                  />
                </div>
              </div>
            )}
            {canEdit && (
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  width:'100%', padding:'10px', borderRadius:10, cursor:'pointer',
                  background:'#f5a623', color:'#000', fontFamily:"'Rajdhani',sans-serif",
                  fontWeight:900, fontSize:14, border:'none', letterSpacing:0.5
                }}
              >{saving ? '⏳ Saving...' : hasPred ? '✏️ Update Prediction' : '✅ Save Prediction'}</button>
            )}
          </div>
        )}

        {/* MY CURRENT PREDICTION (when started — hidden till then for others) */}
        {hasPred && (
          <div style={{padding:'8px 12px', background:'rgba(245,166,35,0.06)', borderRadius:8, border:'1px solid rgba(245,166,35,0.2)', marginBottom:10}}>
            <div style={{fontSize:11, color:'#8899bb', marginBottom:3}}>Your Prediction:</div>
            {isTeamSession
              ? <span style={{color:'#f5a623',fontWeight:700,fontFamily:"'Rajdhani',sans-serif",fontSize:15}}>{myPrediction[sessionKey].team}</span>
              : <span style={{color:'#f5a623',fontWeight:700,fontFamily:"'Rajdhani',sans-serif",fontSize:15}}>
                  Runs: {myPrediction[sessionKey].runs} · Wkts: {myPrediction[sessionKey].wkts}
                </span>
            }
          </div>
        )}

        {/* ACTUAL RESULT + ALL PREDICTIONS — only after match starts */}
        {started && (
          <div style={{marginTop:8}}>
            {actual && (
              <div style={{padding:'8px 12px', background:'rgba(46,204,113,0.08)', borderRadius:8, border:'1px solid rgba(46,204,113,0.25)', marginBottom:10, fontSize:13}}>
                <b style={{color:'#2ecc71'}}>✅ Actual Result: </b>
                {isTeamSession
                  ? <span style={{color:'#fff', fontWeight:700}}>{actual.team}</span>
                  : <span style={{color:'#fff', fontWeight:700}}>Runs: {actual.runs} / Wkts: {actual.wkts}</span>
                }
              </div>
            )}

            {/* All predictions revealed */}
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
                    {isWinner && <span style={{color:'#2ecc71', marginLeft:4}}>🏆 +₹{result.each?.toFixed(2)}</span>}
                  </div>
                )
              })}
            </div>

            {/* Result summary */}
            {result && (
              <div style={{
                marginTop:10, padding:'8px 12px', borderRadius:8,
                background: result.noWinner ? 'rgba(231,76,60,0.07)' : 'rgba(46,204,113,0.07)',
                border: result.noWinner ? '1px solid rgba(231,76,60,0.25)' : '1px solid rgba(46,204,113,0.3)',
                fontSize:12, color:'#aaa'
              }}>
                {result.refund
                  ? `🔄 No winner — ₹${result.pool?.toFixed(2)} refunded to all players.`
                  : result.noWinner
                  ? `📤 No winner — ₹${(result.carryForwardAmount || 0).toFixed(2)} carried forward (÷4 extra per session).`
                  : `🏆 Winners: ${result.winners.join(', ')} — each receives ₹${result.each?.toFixed(2)}`
                }
              </div>
            )}
          </div>
        )}

        {/* Edit history — only my own */}
        {myHistory?.[sessionKey]?.length > 0 && (
          <EditHistoryPanel history={myHistory[sessionKey]} />
        )}
      </div>
    </div>
  )
}

const inputStyle = {
  width:'100%', padding:'9px 12px', borderRadius:8,
  border:'1px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.06)',
  color:'#fff', fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:15,
  outline:'none', boxSizing:'border-box'
}

// ── MATCH PREDICTION CARD ────────────────────────────────────────────────────
function MatchPredCard({ match, myPlayer, allMatchPred, onSave, saving }) {
  const [t1, t2] = getTeams(match)
  const started  = isMatchStarted(match)
  const completed = isMatchCompleted(match)

  const matchno = String(match.matchno)
  const mpData  = allMatchPred[matchno] || {}

  // sessions config
  const sessionsConfig = [
    { key:'s1', label:`Toss Winner (${t1} vs ${t2})`, num:1 },
    { key:'s2', label:'PP1 Score — 1st Innings (6 Overs)', num:2 },
    { key:'s3', label:'1st Innings Final Score', num:3 },
    { key:'s4', label:'PP1 Score — 2nd Innings (6 Overs)', num:4 },
    { key:'s5', label:`Match Winner (${t1} vs ${t2})`, num:5 },
  ]

  // Build per-player predictions (map: player → { s1, s2, ... })
  const allPlayerPreds = {}
  PLAYERS.forEach(p => { allPlayerPreds[p] = mpData.playerPredictions?.[p] || {} })

  // My predictions & history
  const myPreds   = allPlayerPreds[myPlayer] || {}
  const myHistory = mpData.editHistory?.[myPlayer] || {}

  // Bet amounts per session (carried forward if no winner in prev session)
  const sessionBets = useMemo(() => {
    const base = Array(SESSION_COUNT).fill(BASE_BET)
    const joined = PLAYERS.filter(p => allPlayerPreds[p] && Object.keys(allPlayerPreds[p]).length > 0)

    // We can only compute actual carry if actuals are stored
    const actuals = mpData.actuals || {}
    const results = mpData.results || {}

    let carry = 0
    for (let i = 0; i < SESSION_COUNT; i++) {
      const sk = `s${i+1}`
      base[i] = BASE_BET + carry / (joined.length || 1) // distribute carry per head
      const r = results[sk]
      if (r?.noWinner && !r?.refund && r?.carryForwardAmount > 0) {
        const remaining = SESSION_COUNT - i - 1
        if (remaining > 0) carry = r.carryForwardAmount / remaining
        else carry = 0
      } else {
        carry = 0
      }
    }
    return base
  }, [mpData])

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
            {match.matchTime ? ` · ${match.matchTime === '15:30' ? '3:30 PM' : '7:30 PM'} IST` : ''}
            {started && !completed && <span style={{marginLeft:8,color:'#e056fd',fontWeight:700}}>🔴 LIVE / LOCKED</span>}
            {completed && <span style={{marginLeft:8,color:'#2ecc71',fontWeight:700}}>✅ Completed</span>}
            {!started && <span style={{marginLeft:8,color:'#2ecc71',fontWeight:700}}>🟢 Open for Predictions</span>}
          </div>
        </div>
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

      <div style={{padding:'14px 18px'}}>
        {sessionsConfig.map((sc, i) => (
          <SessionCard
            key={sc.key}
            sessionNum={sc.num}
            sessionKey={sc.key}
            label={sc.label}
            match={match}
            myPrediction={myPreds}
            myHistory={myHistory}
            locked={!!(myPreds[sc.key])}   // locked once saved (can edit till match start)
            allPredictions={allPlayerPreds}
            actual={mpData.actuals?.[sc.key]}
            betAmount={sessionBets[i]}
            result={mpData.results?.[sc.key]}
            onSave={(sessionKey, pred, summary) => onSave(matchno, sessionKey, pred, summary)}
            saving={saving}
          />
        ))}
      </div>
    </div>
  )
}

// ── LEADERBOARD PANEL ────────────────────────────────────────────────────────
function PredLeaderboard({ allPredData }) {
  const scores = useMemo(() => {
    const acc = {}
    PLAYERS.forEach(p => { acc[p] = { wins:0, earnings:0, sessions:0 } })
    Object.values(allPredData).forEach(mpData => {
      const results = mpData.results || {}
      Object.values(results).forEach(r => {
        if (!r || !r.winners) return
        r.winners.forEach(p => {
          if (!acc[p]) return
          acc[p].wins++
          acc[p].earnings += r.each || 0
        })
        const pp = mpData.playerPredictions || {}
        PLAYERS.forEach(p => {
          if (pp[p] && Object.keys(pp[p]).length > 0) acc[p].sessions++
        })
      })
    })
    return PLAYERS.map(p => ({ name:p, ...acc[p] }))
      .sort((a,b) => b.earnings - a.earnings || b.wins - a.wins)
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
              {['Rank','Player','Session Wins','Total Earned (₹)'].map(h => (
                <th key={h} style={{padding:'8px 12px',textAlign:'left',color:'#8899bb',fontWeight:700,fontFamily:"'Rajdhani',sans-serif",borderBottom:'1px solid rgba(255,255,255,0.08)'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scores.map((s,i) => (
              <tr key={s.name} style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                <td style={{padding:'8px 12px',color:'#f5a623',fontWeight:700,fontFamily:"'Rajdhani',sans-serif"}}>#{i+1}</td>
                <td style={{padding:'8px 12px'}}>
                  <span style={{color: PLAYER_COLORS[s.name], fontWeight:700, fontFamily:"'Rajdhani',sans-serif"}}>{s.name}</span>
                </td>
                <td style={{padding:'8px 12px',color:'#fff'}}>{s.wins}</td>
                <td style={{padding:'8px 12px',color: s.earnings>0 ? '#2ecc71' : '#aaa', fontWeight:700}}>
                  {s.earnings > 0 ? `+₹${s.earnings.toFixed(2)}` : '₹0'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── MAIN EXPORT ──────────────────────────────────────────────────────────────
export default function PredictionTab({ matches }) {
  const [myPlayer,    setMyPlayer]    = useState(() => localStorage.getItem('vois_pred_identity') || null)
  const [allPredData, setAllPredData] = useState({}) // { [matchno]: mpData }
  const [loadingPred, setLoadingPred] = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [activeMatch, setActiveMatch] = useState(null)
  const [view,        setView]        = useState('active') // 'active' | 'past' | 'leaderboard'
  const lastSaveRef = useRef(0)

  // Load prediction data
  const loadPred = useCallback(async () => {
    if (PRED_BIN_ID === 'PASTE_YOUR_NEW_JSONBIN_ID_HERE') return
    setLoadingPred(true)
    const data = await fetchPredData()
    setAllPredData(data)
    setLoadingPred(false)
  }, [])

  useEffect(() => { loadPred() }, [loadPred])

  // Auto-reload every 30s
  useEffect(() => {
    const id = setInterval(loadPred, 300000)
    return () => clearInterval(id)
  }, [loadPred])

  // Save a session prediction
  const handleSave = useCallback(async (matchno, sessionKey, pred, summary) => {
    if (!myPlayer) return
    const now = Date.now()
    if (now - lastSaveRef.current < 3000) { alert('Please wait a moment before saving again.'); return }
    lastSaveRef.current = now

    setSaving(true)
    const fresh = await fetchPredData()
    const updated = clone(fresh)
    if (!updated[matchno]) updated[matchno] = { playerPredictions:{}, editHistory:{} }
    if (!updated[matchno].playerPredictions[myPlayer]) updated[matchno].playerPredictions[myPlayer] = {}
    if (!updated[matchno].editHistory) updated[matchno].editHistory = {}
    if (!updated[matchno].editHistory[myPlayer]) updated[matchno].editHistory[myPlayer] = {}
    if (!updated[matchno].editHistory[myPlayer][sessionKey]) updated[matchno].editHistory[myPlayer][sessionKey] = []

    // Log edit
    updated[matchno].editHistory[myPlayer][sessionKey].push({ ts: new Date().toISOString(), summary })
    // Save prediction
    updated[matchno].playerPredictions[myPlayer][sessionKey] = pred

    const ok = await savePredData(updated)
    setSaving(false)
    if (ok) {
      setAllPredData(updated)
      alert('✅ Prediction saved!')
    } else {
      alert('❌ Save failed. Check your JSONBin config or network.')
    }
  }, [myPlayer])

  // Upcoming & past matches (with contest or at least teams set)
  const upcomingMatches = useMemo(() =>
    matches.filter(m => m.teams && !isMatchCompleted(m))
      .sort((a,b) => (getMatchDateTime(a)||0) - (getMatchDateTime(b)||0)),
    [matches])
  const pastMatches = useMemo(() =>
    matches.filter(m => m.teams && isMatchCompleted(m))
      .sort((a,b) => (getMatchDateTime(b)||0) - (getMatchDateTime(a)||0)),
    [matches])
  const displayMatches = view === 'past' ? pastMatches : upcomingMatches

  if (!myPlayer) return <IdentityGate onIdentified={name => { setMyPlayer(name); loadPred() }} />

  if (PRED_BIN_ID === 'PASTE_YOUR_NEW_JSONBIN_ID_HERE') {
    return (
      <div style={{padding:30,textAlign:'center',color:'#e74c3c',fontFamily:"'Rajdhani',sans-serif",fontSize:15}}>
        ⚙️ <b>Setup Required:</b> Open <code>PredictionTab.jsx</code> and paste your new JSONBin ID into <code>PRED_BIN_ID</code>.
        <br/><br/>
        Create a free public bin at <a href="https://jsonbin.io" target="_blank" rel="noreferrer" style={{color:'#f5a623'}}>jsonbin.io</a>,
        put <code>{'{"predictions":{}}'}</code> as initial content.
      </div>
    )
  }

  return (
    <div className="section">
      {/* Header */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10}}>
        <div>
          <div className="sec-title" style={{marginBottom:2}}>🔮 Match Predictions</div>
          <div style={{fontSize:12, color:'#8899bb'}}>
            Playing as: <b style={{color: PLAYER_COLORS[myPlayer]}}>{myPlayer}</b>
            <button
              onClick={() => { if(window.confirm('Change identity? This should only be done if you selected the wrong name.')) { localStorage.removeItem('vois_pred_identity'); setMyPlayer(null) } }}
              style={{marginLeft:8, fontSize:10, color:'#e74c3c', background:'transparent', border:'1px solid rgba(231,76,60,0.3)', borderRadius:6, padding:'2px 7px', cursor:'pointer'}}
            >Change</button>
          </div>
        </div>
        <div style={{display:'flex', gap:8}}>
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
          <button onClick={loadPred} style={{
            padding:'7px 12px', borderRadius:10, cursor:'pointer', fontSize:13,
            fontFamily:"'Rajdhani',sans-serif", fontWeight:700, border:'1px solid rgba(255,255,255,0.1)',
            background:'rgba(255,255,255,0.05)', color:'#8899bb'
          }}>⟳</button>
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
          <b style={{color:'#fff'}}>No Winner:</b> If all predict same team & wrong, or if there's no divergence → session amount carried to remaining sessions (÷ remaining sessions).<br/>
          <b style={{color:'#fff'}}>Session 5 Special:</b> If no winner in S5 → full refund. No carry-forward.<br/>
          <b style={{color:'#fff'}}>Lock:</b> Predictions lock at match start time. Edit history is saved with timestamps.
        </div>
      </details>
    </div>
  )
}
