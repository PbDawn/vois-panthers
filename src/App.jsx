import { useState, useEffect, useRef, useCallback } from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, RadialLinearScale, Title, Tooltip, Legend, Filler } from 'chart.js'
import { Line, Bar, Doughnut, PolarArea } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, RadialLinearScale, Title, Tooltip, Legend, Filler)

// ─── CONSTANTS ────────────────────────────────────────────────
const PLAYERS = ['Ashish','Kalpesh','Nilesh','Prabhat','Pritam','Sudhir','Swapnil']
const COLORS  = ['#f5a623','#3498db','#2ecc71','#e74c3c','#9b59b6','#1abc9c','#e67e22']
const PLAYER_IMAGES = { Ashish:'/vois-panthers/ashish.jpg', Kalpesh:'/vois-panthers/kalpesh.jpg', Nilesh:'/vois-panthers/nilesh.jpeg', Prabhat:'/vois-panthers/prabhat.jpg', Pritam:'/vois-panthers/pritam.jpeg', Sudhir:'/vois-panthers/sudhir.jpg', Swapnil:'/vois-panthers/swapnil.jpg' }
const JSONBIN_BASE   = 'https://api.jsonbin.io/v3/b'
const HARDCODED_BIN_ID = '69c84b985fdde574550bf9f7'
const DAILY_LIMIT    = 20
const COOLDOWN_MS    = 30000

// ─── PURE LOGIC HELPERS ───────────────────────────────────────

// ✅ SYNCED FROM ADMIN: Full tie-splitting prize calculation
// Returns: { 1: prizePerRank1Winner, 2: prizePerRank2Winner, winnerCount: N, totalPool: N }
function calculatePrizes(m) {
  const paidCount = PLAYERS.filter(p => m.players[p]?.joined && m.players[p]?.paid).length
  const fee = parseFloat(m.fee) || 0
  const matchNum = parseInt(m.matchno) || 0

  // Step 1: Calculate total prize pots based on paidCount rules
  let pot1 = 0, pot2 = 0, winnerCountLimit = 0
  if (matchNum >= 3) {
    if (paidCount >= 2 && paidCount <= 5) { pot1 = fee * paidCount; winnerCountLimit = 1 }
    else if (paidCount === 6) { pot1 = fee * 4; pot2 = fee * 2; winnerCountLimit = 2 }
    else if (paidCount === 7) { pot1 = fee * 5; pot2 = fee * 2; winnerCountLimit = 2 }
  } else {
    pot1 = fee * paidCount
    winnerCountLimit = paidCount >= 1 ? 1 : 0
  }

  // Step 2: Identify eligible PAID winners with points > 0 for tie-splitting
  const eligiblePaid = PLAYERS
    .filter(p => m.players?.[p]?.paid && m.players?.[p]?.points > 0)
    .map(p => ({ name: p, points: m.players[p].points }))
    .sort((a, b) => b.points - a.points)

  let paidRanks = {}
  let currentRank = 1
  eligiblePaid.forEach((p, i) => {
    if (i > 0 && p.points < eligiblePaid[i - 1].points) currentRank++
    paidRanks[p.name] = currentRank
  })

  const r1Count = eligiblePaid.filter(p => paidRanks[p.name] === 1).length
  const r2Count = eligiblePaid.filter(p => paidRanks[p.name] === 2).length

  return {
    1: r1Count > 0 ? pot1 / r1Count : 0,
    2: (winnerCountLimit === 2 && r2Count > 0) ? pot2 / r2Count : 0,
    winnerCount: winnerCountLimit,  // kept as 'winnerCount' for public page compatibility
    winnerCountLimit,               // also expose for completeness
    totalPool: pot1 + pot2,
    _paidRanks: paidRanks,          // expose internally for reuse
    _r1Count: r1Count,
    _r2Count: r2Count,
  }
}

function getMatchDateTime(m) {
  if (!m.date || !m.matchTime) return null
  const [h, min] = m.matchTime.split(':').map(Number)
  const dt = new Date(m.date + 'T00:00:00')
  dt.setHours(h, min, 0, 0)
  return dt
}

function formatMatchTimeLabel(t) {
  if (t === '15:30') return '3:30 PM IST'
  if (t === '19:30') return '7:30 PM IST'
  return t || ''
}

function formatCountdown(ms) {
  if (ms <= 0) return '00:00:00'
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600)
  const min = Math.floor((s % 3600) / 60), sec = s % 60
  if (d > 0) return `${d}d ${String(h).padStart(2,'0')}h ${String(min).padStart(2,'0')}m`
  return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit' })
}

function findNextUpcomingMatch(matches) {
  const now = new Date()
  let next = null
  matches.forEach(m => {
    const done = m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—'
    if (done || !m.matchTime) return
    const dt = getMatchDateTime(m)
    if (dt && dt > now && (!next || dt < getMatchDateTime(next))) next = m
  })
  return next
}

function getRefreshStats() {
  const today = new Date().toISOString().split('T')[0]
  let s = JSON.parse(localStorage.getItem('vois_refresh_stats') || '{}')
  if (s.date !== today) s = { date: today, count: 0 }
  return s
}

// ✅ SYNCED FROM ADMIN: Full tie-splitting computePlayerStats
// Also retains public-only: activeDeposits tracking
function computePlayerStats(matches) {
  let stats = {}
  PLAYERS.forEach(p => {
    stats[p] = {
      matchesPlayed: 0, contested: 0, paidContests: 0, wins: 0,
      totalInvested: 0, totalWon: 0, bestPoints: 0, carryFwd: 0,
      totalPointsSum: 0, pointsMatchCount: 0, recentForm: [],
      activeDeposits: 0  // PUBLIC-ONLY: track deposits in pending/ongoing matches
    }
  })
  let cf = {}; PLAYERS.forEach(p => { cf[p] = 0 })

  matches.forEach(m => {
    const matchIsComplete = m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—'
    const prizes = calculatePrizes(m)

    // Identify paid-only winners with tie-split logic (ADMIN approach)
    const eligiblePaid = PLAYERS
      .filter(p => m.players?.[p]?.paid && m.players?.[p]?.points > 0)
      .map(p => ({ name: p, points: m.players[p].points }))
      .sort((a, b) => b.points - a.points)

    let paidRanks = {}
    let currentR = 1
    eligiblePaid.forEach((player, i) => {
      if (i > 0 && player.points < eligiblePaid[i - 1].points) currentR++
      paidRanks[player.name] = currentR
    })

    const r1Count = eligiblePaid.filter(p => paidRanks[p.name] === 1).length
    const r2Count = eligiblePaid.filter(p => paidRanks[p.name] === 2).length

    PLAYERS.forEach(p => {
      const pd = m.players[p]
      if (!pd || !pd.joined) return
      const s = stats[p]

      // PUBLIC-ONLY: track active deposits for upcoming/ongoing matches
      if (!matchIsComplete) {
        if (m.contest === 'yes' && pd.paid) {
          s.activeDeposits += m.fee
        }
        return // skip completed-match stats for incomplete matches
      }

      // COMPLETED MATCH STATS (now using admin tie-split approach)
      s.matchesPlayed++

      if (m.contest === 'yes') {
        s.contested++
        if (pd.paid) {
          s.paidContests++
          if (cf[p] <= 0) s.totalInvested += m.fee; else cf[p] -= m.fee

          if (pd.points > 0) {
            s.totalPointsSum += pd.points
            s.pointsMatchCount++
            if (pd.points > s.bestPoints) s.bestPoints = pd.points
          }

          if (matchIsComplete) {
            const pRank = paidRanks[p]
            const isR1Win = pRank === 1
            const isR2Win = pRank === 2 && prizes.winnerCountLimit === 2

            if (isR1Win || isR2Win) {
              s.wins++
              // SYNCED FROM ADMIN: tie-split prize share
              const prizeShare = isR1Win ? (prizes[1]) : (prizes[2])

              const isDone = (m.transferred && typeof m.transferred === 'object')
                ? m.transferred[p] === true
                : m.transferred === true

              if (isDone) {
                s.totalWon += prizeShare
              } else {
                cf[p] += prizeShare
              }
              s.recentForm.push(isR1Win ? 'win1' : 'win2')
            } else {
              s.recentForm.push('loss')
            }
          }
        } else {
          if (matchIsComplete) s.recentForm.push('skip')
        }
      }
    })
  })

  PLAYERS.forEach(p => {
    stats[p].carryFwd = cf[p] > 0 ? cf[p] : 0
    stats[p].recentForm = stats[p].recentForm.slice(-5)
    stats[p].totalWon = parseFloat(stats[p].totalWon.toFixed(2))
    stats[p].carryFwd = parseFloat(stats[p].carryFwd.toFixed(2))
  })
  return stats
}

function computeHoFBadges(stats) {
  const maxWins = Math.max(...PLAYERS.map(p => stats[p].wins))
  const maxBestPts = Math.max(...PLAYERS.map(p => stats[p].bestPoints))
  const maxAvgPts = Math.max(...PLAYERS.map(p => stats[p].pointsMatchCount > 0 ? stats[p].totalPointsSum / stats[p].pointsMatchCount : 0))
  const maxWinPct = Math.max(...PLAYERS.map(p => stats[p].paidContests > 0 ? stats[p].wins / stats[p].paidContests : 0))
  const maxContests = Math.max(...PLAYERS.map(p => stats[p].paidContests))
  const maxProfit = Math.max(...PLAYERS.map(p => stats[p].totalWon - stats[p].totalInvested))
  const badges = {}
  PLAYERS.forEach(p => {
    badges[p] = []
    const s = stats[p], avg = s.pointsMatchCount > 0 ? s.totalPointsSum / s.pointsMatchCount : 0
    const winPct = s.paidContests > 0 ? s.wins / s.paidContests : 0, profit = s.totalWon - s.totalInvested
    if (maxWins > 0 && s.wins === maxWins)                              badges[p].push({ icon:'👑', label:'The Legend',     cls:'badge-legend' })
    if (maxBestPts > 0 && s.bestPoints === maxBestPts)                  badges[p].push({ icon:'🎯', label:'Point Sniper',   cls:'badge-sniper' })
    if (maxAvgPts > 0 && avg === maxAvgPts && s.pointsMatchCount > 0)  badges[p].push({ icon:'⚙️', label:'Points Machine', cls:'badge-machine' })
    if (maxWinPct > 0 && winPct === maxWinPct && s.paidContests >= 2)  badges[p].push({ icon:'🛡️', label:'Iron Consistent',cls:'badge-ironman' })
    if (maxContests > 0 && s.paidContests === maxContests)              badges[p].push({ icon:'🐉', label:'Dragon Grinder', cls:'badge-dragon' })
    if (maxProfit > 0 && profit === maxProfit)                          badges[p].push({ icon:'🔥', label:'Phoenix Profit', cls:'badge-phoenix' })
    if (s.wins >= 3)                                                    badges[p].push({ icon:'📜', label:'Hat-Trick Hero', cls:'badge-scholar' })
  })
  return badges
}

// ─── CHART OPTIONS ────────────────────────────────────────────
function chartOpts(unit) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color:'#8899bb', font:{ family:'Rajdhani', size:12 } } }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${unit}${ctx.parsed.y ?? ctx.parsed}` } } },
    scales: { x: { ticks:{ color:'#8899bb', font:{ family:'Rajdhani', size:11 } }, grid:{ color:'#1e2d5044' } }, y: { ticks:{ color:'#8899bb', font:{ family:'Rajdhani', size:11 }, callback: v => `${unit}${v}` }, grid:{ color:'#1e2d5044' } } }
  }
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════

// ─── COUNTDOWN CELL ───────────────────────────────────────────
function CountdownCell({ match, isNextUpcoming }) {
  const [display, setDisplay] = useState('')
  const done = match.teamwon && match.teamwon.trim() !== '' && match.teamwon !== '—'
  useEffect(() => {
    if (!isNextUpcoming || !match.matchTime || done) return
    const target = getMatchDateTime(match)
    if (!target) return
    const tick = () => setDisplay(formatCountdown(target - new Date()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [match, isNextUpcoming, done])
  if (done) return <><div className="completed-badge">✅ Completed</div>{match.matchTime && <div className="scheduled-time">{formatMatchTimeLabel(match.matchTime)}</div>}</>
  if (isNextUpcoming && match.matchTime) return <><div className="scheduled-time" style={{color:'var(--text2)',marginBottom:3}}>{formatMatchTimeLabel(match.matchTime)}</div><div className="time-countdown">⏱ Starts in: <span>{display || '--:--:--'}</span></div></>
  if (match.matchTime) return <div style={{fontSize:12,fontWeight:700,color:'var(--text)'}}>{formatMatchTimeLabel(match.matchTime)}</div>
  return <span style={{color:'var(--text2)'}}>—</span>
}

// ─── MATCH LOG COMPONENT ──────────────────────────────────────
// PUBLIC-ONLY: Includes Live IPL Score panel (Cricbuzz API)
function MatchLog({ matches }) {
  const nextUpcoming = findNextUpcomingMatch(matches)
  const finished = matches.filter(m => m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—')

  const totalPool = finished.reduce((s, m) => s + (calculatePrizes(m).totalPool || 0), 0)
  const totalContests = finished.filter(m => m.contest === 'yes').length

  const totalTransferred = finished.reduce((count, m) => {
    if (m.transferred && typeof m.transferred === 'object') {
      return count + Object.values(m.transferred).filter(v => v === true).length
    }
    return count + (m.transferred === true ? 1 : 0)
  }, 0)

  const [showLiveScore, setShowLiveScore] = useState(false)
  const [liveMatch, setLiveMatch] = useState(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const fetchIPLScore = async () => {
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
      const leagueGroup = result.typeMatches?.find(group => group.matchType === "League")
      const iplSeries = leagueGroup?.seriesMatches?.find(s =>
        s.seriesAdWrapper?.seriesName.toLowerCase().includes("indian premier league")
      )
      if (iplSeries?.seriesAdWrapper?.matches?.length > 0) {
        const match = iplSeries.seriesAdWrapper.matches[0]
        const info = match.matchInfo
        const score = match.matchScore
        let liveScoreText = "---"
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
      setErrorMsg("API is temporarily unavailable.")
    } finally {
      setLiveLoading(false)
    }
  }

  useEffect(() => {
    if (showLiveScore) {
      fetchIPLScore()
      const interval = setInterval(fetchIPLScore, 180000)
      return () => clearInterval(interval)
    }
  }, [showLiveScore])

  return (
    <div className="section">
      <div className="sec-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Match Log</span>
        <button
          onClick={() => setShowLiveScore(!showLiveScore)}
          className={`btn-sm ${showLiveScore ? 'btn-danger' : 'btn-success'}`}
          style={{ padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }}
        >
          {showLiveScore ? '🛑 Hide Live Score' : '📡 Show Live'}
        </button>
      </div>

      {showLiveScore && (
        <div style={{ marginBottom: '20px', padding: '20px', background: '#161f38', borderRadius: '12px', border: '1px solid #f5a623', textAlign: 'center' }}>
          {liveLoading && !liveMatch ? (
            <div style={{ color: '#8899bb' }}>Updating live feed...</div>
          ) : errorMsg ? (
            <div style={{ color: '#ff4d4d', fontSize: '12px' }}>{errorMsg}</div>
          ) : liveMatch ? (
            <div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '5px' }}>{liveMatch.teams}</div>
              <div style={{ fontSize: '26px', color: '#2ecc71', fontWeight: 'bold', margin: '10px 0' }}>{liveMatch.runs}</div>
              <div style={{ fontSize: '14px', color: '#f5a623' }}>{liveMatch.status}</div>
              <div style={{ fontSize: '11px', color: '#8899bb', marginTop: '10px' }}>📍 {liveMatch.venue}</div>
              <button onClick={fetchIPLScore} style={{ marginTop: '15px', background: 'transparent', border: '1px solid #3498db', color: '#3498db', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>🔄 Refresh Now</button>
            </div>
          ) : (
            <div style={{ color: '#8899bb' }}>No match is currently Live.</div>
          )}
        </div>
      )}

      <div className="totals-bar">
        <div className="total-chip"><div className="total-chip-label">Total Matches</div><div className="total-chip-val">{matches.length}</div></div>
        <div className="total-chip"><div className="total-chip-label">Contests Played</div><div className="total-chip-val">{totalContests}</div></div>
        <div className="total-chip"><div className="total-chip-label">Total Pool</div><div className="total-chip-val">₹{totalPool.toFixed(0)}</div></div>
        <div className="total-chip"><div className="total-chip-label">Payouts Done</div><div className="total-chip-val">{totalTransferred}</div></div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {['Match','Date','Teams','Team Won','Match Time','Contest','Joined','Fee(₹)','Pool(₹)','Fantasy Winner','Payout(₹)','Transferred'].map(h => <th key={h}>{h}</th>)}
              {PLAYERS.map(p => <th key={p}><div style={{fontSize:11, whiteSpace:'nowrap'}}>{p}<br/><span style={{color:'var(--text2)',fontSize:9}}>J/P/Pts/Rk</span></div></th>)}
              <th>MyCircle11 App</th>
            </tr>
          </thead>
          <tbody>
            {matches.length === 0 ? (
              <tr><td colSpan={13 + PLAYERS.length} className="no-data">No match data available yet.</td></tr>
            ) : matches.map((m, idx) => {
              const done = m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—'
              const prizes = calculatePrizes(m)
              const isNext = nextUpcoming && nextUpcoming.matchno === m.matchno
              const matchStartTime = getMatchDateTime(m)
              const hasStarted = matchStartTime ? (new Date() > matchStartTime) : done

              // ✅ SYNCED FROM ADMIN: Paid-only tie-handling & split logic
              let winnersInfo = []
              if (done) {
                const eligiblePaid = PLAYERS
                  .filter(p => m.players?.[p]?.paid && m.players?.[p]?.points > 0)
                  .map(p => ({ name: p, points: m.players[p].points }))
                  .sort((a, b) => b.points - a.points)

                let paidRanks = {}
                let currentRank = 1
                eligiblePaid.forEach((p, i) => {
                  if (i > 0 && p.points < eligiblePaid[i - 1].points) currentRank++
                  paidRanks[p.name] = currentRank
                })

                const r1Paid = eligiblePaid.filter(p => paidRanks[p.name] === 1)
                const r2Paid = eligiblePaid.filter(p => paidRanks[p.name] === 2)

                if (r1Paid.length > 0) {
                  const split1 = prizes[1] // already per-winner from calculatePrizes
                  r1Paid.forEach(p => winnersInfo.push({ name: p.name, rank: 1, prize: split1 }))
                }
                if (prizes.winnerCountLimit === 2 && r2Paid.length > 0) {
                  const split2 = prizes[2]
                  r2Paid.forEach(p => winnersInfo.push({ name: p.name, rank: 2, prize: split2 }))
                }
              }

              return (
                <tr key={idx}>
                  <td><span className="match-no-badge">#{m.matchno}</span></td>
                  <td style={{fontSize:11}}>{formatDate(m.date)}</td>
                  <td><span className="team-tag">{m.teams}</span></td>
                  <td style={{fontSize:11,fontWeight:700}}>{m.teamwon || '—'}</td>
                  <td style={{minWidth:120}}><CountdownCell match={m} isNextUpcoming={isNext} /></td>
                  <td>{m.contest === 'yes' ? <span className="won-badge">YES</span> : <span className="lost-badge">NO</span>}</td>
                  <td style={{fontSize:11}}>{m.contest === 'yes' ? `${m.joinedCount}/${PLAYERS.length}` : '—'}</td>
                  <td style={{fontSize:11}}>₹{m.fee}</td>
                  {/* ✅ SYNCED: Pool now uses calculated totalPool not saved m.pool */}
                  <td style={{color:'var(--green)',fontWeight:700,fontSize:11}}>₹{prizes.totalPool || m.pool || 0}</td>

                  <td style={{fontSize:11}}>
                    {winnersInfo.length > 0 ? winnersInfo.map(w => (
                      <div key={w.name} style={{fontSize:11, display:'flex', alignItems:'center', height:22}}>
                        {w.rank===1?'🥇':'🥈'} <b>{w.name}</b>
                      </div>
                    )) : '—'}
                  </td>

                  <td style={{fontSize:11}}>
                    {winnersInfo.length > 0 ? winnersInfo.map(w => (
                      <div key={w.name} style={{fontSize:11, display:'flex', alignItems:'center', height:22, color:'var(--green)'}}>
                        ₹{w.prize.toFixed(2)}
                      </div>
                    )) : '—'}
                  </td>

                  <td>
                    {m.contest === 'yes' && winnersInfo.length > 0 ? winnersInfo.map(w => {
                      const isDone = (m.transferred && typeof m.transferred === 'object')
                        ? m.transferred[w.name] === true
                        : m.transferred === true
                      return (
                        <div key={w.name} style={{height:24, display:'flex', alignItems:'center', marginBottom:2}}>
                          {isDone
                            ? <span className="transfer-done" style={{fontSize:10}}>✅ Done</span>
                            : <span className="transfer-pending" style={{fontSize:10}}>⏳ Pending</span>}
                        </div>
                      )
                    }) : '—'}
                  </td>

                  {PLAYERS.map(p => {
                    const pd = m.players?.[p]
                    if (!pd?.joined) return <td key={p} style={{color:'var(--text2)',fontSize:13}}>—</td>
                    const globalRank = m.joinedRanks?.[p] || '—'
                    const winObj = winnersInfo.find(w => w.name === p)
                    const isWin = !!winObj
                    return (
                      <td key={p}>
                        <div className={isWin ? (winObj.rank === 1 ? 'rank-1-box' : 'rank-2-box') : ''}>
                          <div style={{fontSize:9}}>✅ Joined</div>
                          <div style={{fontSize:9}} className={pd.paid ? 'paid-yes' : 'paid-no'}>{pd.paid ? '💰 Paid' : '❌ Unpaid'}</div>
                          <div style={{fontSize:14,fontWeight:900,color:isWin?'var(--accent)':'inherit'}}>{pd.points}</div>
                          <div style={{fontSize:10}} className={`rank-${isWin ? winObj.rank : globalRank}`}>#{isWin ? winObj.rank : globalRank}</div>
                          {/* ✅ SYNCED FROM ADMIN: Hide Pay button if match is complete */}
                          {!pd.paid && !done && (
                            <button className="pay-now-btn" onClick={() => alert(`🏏 IPL Season is On! 🏆\n\nYour entry fee is pending.\n\n📍 Check the pinned message in WhatsApp group "_VOIS Dream 11" and scan the UPI QR code.\n\nGood luck! 🔥`)}>💸 Pay Now</button>
                          )}
                        </div>
                      </td>
                    )
                  })}

                  <td style={{textAlign:'center'}}>
                    {m.contestLink && !hasStarted ? (
                      <a href={m.contestLink} target="_blank" rel="noreferrer" className="app-link-btn">🏆 Join Contest</a>
                    ) : <span style={{color:'var(--text2)', fontSize:10}}>{done ? '—' : 'Closed'}</span>}
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

// ─── PLAYER STATS ─────────────────────────────────────────────
function PlayerStats({ matches }) {
  const stats = computePlayerStats(matches)
  const hofBadges = computeHoFBadges(stats)
  return (
    <div className="section">
      <div className="sec-title">Player Stats</div>
      <div className="player-cards">
        {PLAYERS.map((p, i) => {
          const s = stats[p], profit = s.totalWon - s.totalInvested
          const winpct = s.paidContests > 0 ? ((s.wins / s.paidContests) * 100).toFixed(1) : '0.0'
          const avgPts = s.pointsMatchCount > 0 ? (s.totalPointsSum / s.pointsMatchCount).toFixed(1) : '—'
          const myBadges = hofBadges[p] || []
          const avatarStyle = PLAYER_IMAGES[p]
            ? { borderColor: COLORS[i], backgroundImage:`url('${PLAYER_IMAGES[p]}')`, backgroundSize:'cover', backgroundPosition:'center', color:'transparent' }
            : { borderColor: COLORS[i], color: COLORS[i], background: `${COLORS[i]}22` }
          return (
            <div className="p-card" key={p}>
              <div className="p-card-header">
                <div className="p-avatar" style={avatarStyle}>{p[0]}</div>
                <div style={{flex:1}}>
                  <div className="p-name">{p}</div>
                  <div className="p-winpct">Win Rate: <span>{winpct}%</span> ({s.wins}/{s.paidContests} paid)</div>
                  <div className="form-strip">
                    <span className="form-label">Form:</span>
                    {s.recentForm.length === 0
                      ? <span style={{fontSize:11,color:'var(--text2)'}}>No data yet</span>
                      : s.recentForm.map((r, ri) => {
                          if (r==='win1') return <div key={ri} className="form-icon form-win1" title="1st Place">🥇</div>
                          if (r==='win2') return <div key={ri} className="form-icon form-win2" title="2nd Place">🥈</div>
                          if (r==='loss') return <div key={ri} className="form-icon form-loss" title="Did not win">❌</div>
                          return <div key={ri} className="form-icon form-skip" title="Joined but not paid">-</div>
                        })
                    }
                  </div>
                </div>
              </div>
              <div className="p-card-body">
                {myBadges.length > 0 && <div className="badges-strip">{myBadges.map(b => <span key={b.label} className={`hof-badge ${b.cls}`}>{b.icon} {b.label}</span>)}</div>}
                {[
                  ['Matches Played', s.matchesPlayed, 'accent'],
                  ['Contests Joined', s.contested, ''],
                  ['Paid Contests', s.paidContests, ''],
                  ['Matches Won', s.wins, '', COLORS[i]],
                  ['Best Points', s.bestPoints, 'accent'],
                ].map(([label, val, cls, color]) => (
                  <div className="p-stat-row" key={label}>
                    <span className="p-stat-label">{label}</span>
                    <span className={`p-stat-val${cls?' '+cls:''}`} style={color?{color}:{}}>{val}</span>
                  </div>
                ))}
                <div className="p-stat-row"><span className="p-stat-label">Avg Points / Match</span><span className="p-stat-val"><span className="avg-pts-val">{avgPts}</span></span></div>
                <div className="p-stat-row"><span className="p-stat-label">Total Invested</span><span className="p-stat-val red">₹{s.totalInvested}</span></div>
                <div className="p-stat-row"><span className="p-stat-label">Total Winnings</span><span className="p-stat-val green">₹{s.totalWon.toFixed(2)}</span></div>
                <div className="p-stat-row"><span className="p-stat-label">Profit / Loss</span><span className={`p-stat-val ${profit>=0?'green':'red'}`}>{profit>=0?'+':''}₹{profit.toFixed(2)}</span></div>
                {/* PUBLIC-ONLY: Active Deposit for pending/ongoing matches */}
                {s.activeDeposits > 0 && (
                  <div className="p-stat-row" style={{borderBottom:'1px solid rgba(52,152,219,0.3)',paddingBottom:'8px',marginBottom:'8px'}}>
                    <span className="p-stat-label" style={{color:'#3498db',fontWeight:'bold'}}>💰 Active Deposit</span>
                    <div style={{textAlign:'right'}}>
                      <span className="p-stat-val" style={{color:'#3498db'}}>₹{s.activeDeposits}</span>
                      <div style={{fontSize:'9px',color:'var(--text2)'}}>Match pending/ongoing</div>
                    </div>
                  </div>
                )}
                {s.carryFwd > 0 && <div className="p-stat-row"><span className="p-stat-label">Carry Forward</span><span className="p-stat-val"><span className="cf-tag">₹{s.carryFwd.toFixed(2)} pending</span></span></div>}
              </div>
            </div>
          )
        })}
      </div>
      <div className="badge-notes">
        <div className="badge-notes-title">🏆 Hall of Fame — Badge Guide</div>
        {[
          ['👑','The Legend','Awarded to the player with the most contest wins this season.'],
          ['🎯','Point Sniper','Holds the single highest score in any paid contest this season.'],
          ['⚙️','Points Machine','Best Average Points per Match (paid contests only, points > 0).'],
          ['🛡️','Iron Consistent','Highest Win % among paid contests (minimum 2 paid entries).'],
          ['🐉','Dragon Grinder','Most paid contests this season. Never backs down from a fight.'],
          ['🔥','Phoenix Profit','Leads in total profit (Winnings minus Investment).'],
          ['📜','Hat-Trick Hero','Has won 3 or more contests this season.'],
        ].map(([icon, title, desc]) => (
          <div className="badge-note-row" key={title}>
            <div className="badge-note-icon">{icon}</div>
            <div className="badge-note-text"><b>{title}</b> — {desc}</div>
          </div>
        ))}
        <div style={{marginTop:10,fontSize:11,color:'var(--text2)',borderTop:'1px solid var(--border)',paddingTop:10}}>
          ℹ️ <b style={{color:'var(--text)'}}>Current Form</b>: Shows last 5 paid contest results. 🥇 = 1st Rank, 🥈 = 2nd Rank, ❌ = Did not win, <span style={{fontSize:12,fontWeight:700,color:'var(--text2)'}}>-</span> = Joined but did not pay entry fee.
        </div>
      </div>
    </div>
  )
}

// ─── LEADERBOARD ──────────────────────────────────────────────
// PUBLIC-ONLY: Properly tracks tied-profit ranks (not just sort index)
function Leaderboard({ matches }) {
  const stats = computePlayerStats(matches)
  const sorted = PLAYERS.map((p, i) => ({ name:p, color:COLORS[i], ...stats[p] }))
    .sort((a, b) => (b.totalWon - b.totalInvested) - (a.totalWon - a.totalInvested))
  let currentRank = 1, lastProfit = null
  return (
    <div className="section">
      <div className="sec-title">Leaderboard</div>
      <div className="lb-grid">
        {sorted.map((p, i) => {
          const profit = p.totalWon - p.totalInvested
          const winpct = p.paidContests > 0 ? ((p.wins / p.paidContests) * 100).toFixed(1) : '0.0'
          if (lastProfit !== null && profit < lastProfit) currentRank++
          const rankClass = currentRank===1?'rank1':currentRank===2?'rank2':currentRank===3?'rank3':''
          const rankDisplay = currentRank===1?'🥇':currentRank===2?'🥈':currentRank===3?'🥉':currentRank
          lastProfit = profit
          return (
            <div key={p.name} className={`lb-card ${rankClass}`}>
              <div className="lb-rank">{rankDisplay}</div>
              <div>
                <div className="lb-name" style={{color:p.color}}>{p.name}</div>
                <div className="lb-stats">
                  {[
                    ['Matches', p.matchesPlayed],
                    ['Paid', p.paidContests],
                    ['Wins', p.wins],
                    ['Win%', winpct + '%'],
                    ['Invested', '₹' + p.totalInvested],
                    ['Won', '₹' + p.totalWon.toFixed(2)],
                    ...(p.activeDeposits > 0 ? [['Active Deposit', '₹' + p.activeDeposits]] : [])
                  ].map(([k, v]) => (
                    <div className="lb-stat" key={k}>
                      {k}: <span className={k === 'Active Deposit' ? 'active-amt' : ''}>{v}</span>
                    </div>
                  ))}
                  {p.carryFwd > 0 && (
                    <div className="lb-stat">Carry Fwd: <span className="cf-tag">₹{p.carryFwd.toFixed(2)}</span></div>
                  )}
                </div>
              </div>
              <div>
                <div className={`lb-profit ${profit>0?'pos':profit<0?'neg':'neu'}`}>{profit>=0?'+':''}₹{profit.toFixed(2)}</div>
                <div className="lb-wins">{p.wins} win{p.wins!==1?'s':''}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── GRAPHS ───────────────────────────────────────────────────
function Graphs({ matches }) {
  const stats = computePlayerStats(matches)
  const labels = matches.map(m => `M${m.matchno}`)
  const pnlDatasets = PLAYERS.map((p, i) => {
    let cum = 0
    const data = matches.map(m => {
      const pd = m.players[p]; if (!pd || !pd.joined) return cum
      const done = m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—'
      if (m.contest === 'yes') {
        if (pd.paid) cum -= m.fee
        // ✅ SYNCED: Use correct transferred check per player
        if (done && pd.paid) {
          const prizes = calculatePrizes(m)
          const paidRanks = prizes._paidRanks || {}
          const pRank = paidRanks[p]
          const isDone = (m.transferred && typeof m.transferred === 'object')
            ? m.transferred[p] === true
            : m.transferred === true
          if (isDone) {
            if (pRank === 1) cum += prizes[1]
            else if (pRank === 2 && prizes.winnerCountLimit === 2) cum += prizes[2]
          }
        }
      }
      return parseFloat(cum.toFixed(2))
    })
    return { label:p, data, borderColor:COLORS[i], backgroundColor:COLORS[i]+'22', fill:false, tension:0.3, pointRadius:5, pointHoverRadius:7, borderWidth:2 }
  })
  const invWinData = { labels: PLAYERS, datasets: [
    { label:'Invested', data: PLAYERS.map(p=>stats[p].totalInvested), backgroundColor: COLORS.map(c=>c+'99'), borderColor: COLORS, borderWidth:1 },
    { label:'Won', data: PLAYERS.map(p=>parseFloat(stats[p].totalWon.toFixed(2))), backgroundColor: COLORS.map(c=>c+'44'), borderColor: COLORS, borderWidth:2 }
  ]}
  const winsData = { labels: PLAYERS, datasets: [{ data: PLAYERS.map(p=>stats[p].wins), backgroundColor: COLORS, borderColor:'#1b2540', borderWidth:2 }] }
  const pointsDatasets = PLAYERS.map((p, i) => ({ label:p, data: matches.map(m => m.players[p]?.joined ? m.players[p].points : null), borderColor: COLORS[i], backgroundColor: COLORS[i]+'33', spanGaps:false, tension:0.3, pointRadius:5, borderWidth:2 }))
  const winPctData = { labels: PLAYERS, datasets: [{ data: PLAYERS.map(p => stats[p].paidContests>0 ? parseFloat(((stats[p].wins/stats[p].paidContests)*100).toFixed(1)) : 0), backgroundColor: COLORS.map(c=>c+'99'), borderColor: COLORS, borderWidth:1 }] }
  const poolData = { labels, datasets: [{ label:'Pool (₹)', data: matches.map(m => calculatePrizes(m).totalPool || m.pool || 0), backgroundColor: matches.map(m=>(calculatePrizes(m).totalPool||m.pool||0)>0?'rgba(245,166,35,0.5)':'rgba(100,100,100,0.3)'), borderColor: matches.map(m=>(calculatePrizes(m).totalPool||m.pool||0)>0?'#f5a623':'#555'), borderWidth:1 }] }
  const doughnutOpts = { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ labels:{ color:'#8899bb', font:{ family:'Rajdhani', size:13 } } } } }
  const polarOpts = { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ labels:{ color:'#8899bb', font:{ family:'Rajdhani', size:12 } } } }, scales:{ r:{ ticks:{ color:'#8899bb' }, grid:{ color:'#1e2d50' } } } }
  return (
    <div className="section">
      <div className="sec-title">Graphs &amp; Analytics</div>
      <div className="graph-grid">
        <div className="chart-card" style={{gridColumn:'1/-1'}}><div className="chart-title">📈 Cumulative Profit/Loss per Player (Season)</div><div className="chart-wrap"><Line data={{labels,datasets:pnlDatasets}} options={chartOpts('₹')} /></div></div>
        <div className="chart-card"><div className="chart-title">💰 Investment vs Winnings (Total)</div><div className="chart-wrap"><Bar data={invWinData} options={chartOpts('₹')} /></div></div>
        <div className="chart-card"><div className="chart-title">🏅 Wins Count by Player</div><div className="chart-wrap"><Doughnut data={winsData} options={doughnutOpts} /></div></div>
        <div className="chart-card" style={{gridColumn:'1/-1'}}><div className="chart-title">📊 Per Match Points Comparison</div><div className="chart-wrap" style={{height:320}}><Line data={{labels,datasets:pointsDatasets}} options={chartOpts('pts')} /></div></div>
        <div className="chart-card"><div className="chart-title">🎯 Win % (among paid contestants)</div><div className="chart-wrap"><PolarArea data={winPctData} options={polarOpts} /></div></div>
        <div className="chart-card"><div className="chart-title">📦 Pool Money per Match</div><div className="chart-wrap"><Bar data={poolData} options={chartOpts('₹')} /></div></div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [matches, setMatches]         = useState([])
  const [loading, setLoading]         = useState(false)
  const [activeSection, setActiveSection] = useState('matchlog')
  const [liveState, setLiveState]     = useState({ dot:'', label:'CONNECTING...', info:'Connecting to cloud...' })
  const [clock, setClock]             = useState('')
  const [refreshLeft, setRefreshLeft] = useState(DAILY_LIMIT)
  const [isCooldown, setIsCooldown]   = useState(false)
  const [btnText, setBtnText]         = useState('⟳ Refresh')
  const lastVersionRef = useRef(null)

  const updateRefreshUI = useCallback(() => {
    const s = getRefreshStats()
    setRefreshLeft(Math.max(0, DAILY_LIMIT - s.count))
  }, [])

  const fetchFromCloud = useCallback(async () => {
    setLoading(true)
    setLiveState({ dot:'stale', label:'CONNECTING...', info:'Fetching latest data...' })
    try {
      let data
      const res = await fetch(`${JSONBIN_BASE}/${HARDCODED_BIN_ID}/latest`, { headers:{ 'X-Bin-Meta':'false' } })
      if (res.status === 401) {
        const res2 = await fetch(`${JSONBIN_BASE}/${HARDCODED_BIN_ID}/latest`)
        if (!res2.ok) throw new Error(`Access denied (${res2.status}). Make sure the bin is set to PUBLIC.`)
        data = await res2.json(); data = data.record || data
      } else {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        data = await res.json()
      }
      const newMatches = data.matches || data || []
      const newVersion = data.version || data.updatedAt || JSON.stringify(newMatches).length
      if (newVersion !== lastVersionRef.current) {
        lastVersionRef.current = newVersion
        setMatches(newMatches)
        const updatedAt = data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString('en-IN') : new Date().toLocaleTimeString('en-IN')
        setLiveState({ dot:'', label:'🟢 LIVE', info:`Updated: ${updatedAt} · Click Refresh for latest scores` })
      } else {
        setLiveState({ dot:'', label:'🟢 LIVE', info:`No changes · Last check: ${new Date().toLocaleTimeString('en-IN')}` })
      }
    } catch (e) {
      setLiveState({ dot:'offline', label:'⚠️ ERROR', info: e.message.substring(0, 70) })
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    updateRefreshUI()
    const id = setInterval(() => setClock(new Date().toLocaleTimeString('en-IN')), 1000)
    fetchFromCloud()
    return () => clearInterval(id)
  }, [fetchFromCloud, updateRefreshUI])

  const manualRefresh = () => {
    const s = getRefreshStats()
    if (s.count >= DAILY_LIMIT) { alert('⚠️ Daily refresh limit reached to save cloud bandwidth! Please check back tomorrow.'); return }
    if (isCooldown) { alert('⏳ Please wait 30 seconds between refreshes.'); return }
    s.count++
    localStorage.setItem('vois_refresh_stats', JSON.stringify(s))
    updateRefreshUI()
    setIsCooldown(true); setBtnText('⏳ Wait...')
    setTimeout(() => { setIsCooldown(false); setBtnText('⟳ Refresh') }, COOLDOWN_MS)
    fetchFromCloud()
  }

  const navItems = [
    { id:'matchlog',    label:'📋 Match Log' },
    { id:'playerstats', label:'👤 Player Stats' },
    { id:'leaderboard', label:'🏆 Leaderboard' },
    { id:'graphs',      label:'📊 Graphs' },
  ]

  return (
    <>
      <div className="watermark">#PbDawn</div>
      {loading && <div className="loading-overlay"><div className="spinner"/><div className="loading-text">Loading live data...</div></div>}

      {/* TICKER */}
      <div className="ticker-bar">
        <div className="ticker-left">
          <div className="live-pill">
            <span className={`live-dot${liveState.dot?' '+liveState.dot:''}`}/>
            <span>{liveState.label}</span>
          </div>
          <span className="ticker-info">{liveState.info}</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span className="ticker-time">{clock}</span>
          <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end'}}>
            <button className="refresh-btn" onClick={manualRefresh} style={isCooldown?{opacity:0.5}:{}}>{btnText}</button>
            <span className="refresh-counter">{refreshLeft} left today</span>
          </div>
        </div>
      </div>

      {/* HEADER */}
      <header>
        <div className="header-inner">
          <div className="logo-area">
            <div className="logo-icon">🏏</div>
            <div>
              <div className="title-main">VOIS Panthers IPL 2026 Fantasy League Tracker</div>
              <div className="title-sub"><span className="title-live-dot"/>&nbsp;MyCircle11 Private Contest · Season 2026</div>
            </div>
          </div>
          <div className="season-badge">IPL 2026</div>
        </div>
      </header>

      {/* NAV */}
      <nav>
        <div className="nav-inner">
          {navItems.map(n => (
            <button key={n.id} className={`nav-btn${activeSection===n.id?' active':''}`} onClick={() => setActiveSection(n.id)}>{n.label}</button>
          ))}
        </div>
      </nav>

      {/* SECTIONS */}
      {activeSection === 'matchlog'    && <MatchLog    matches={matches} />}
      {activeSection === 'playerstats' && <PlayerStats matches={matches} />}
      {activeSection === 'leaderboard' && <Leaderboard matches={matches} />}
      {activeSection === 'graphs'      && <Graphs      matches={matches} />}

      <div className="pb-footer">&copy;&trade; Designed and Developed by <span>Prabhat Singh</span></div>
    </>
  )
}
