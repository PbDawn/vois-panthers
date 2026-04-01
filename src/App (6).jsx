import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import AdminLogin from './AdminLogin'
import AdminPage  from './AdminPage'
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

// ─── LIVE IPL SCORE ENGINE ────────────────────────────────────
// Uses rotating free CORS proxies to scrape Cricbuzz public JSON feed.
// No API key, no rate limits. Rotates proxies to avoid bans.
// Auto-refreshes every 25s silently. Falls back gracefully.

const CORS_PROXIES = [
  'https://api.allorigins.win/get?url=',
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest=',
]

const IPL_LIVE_URL = 'https://www.cricbuzz.com/api/cricket-match/commentary/0'
const IPL_SCHEDULE_URL = 'https://www.cricbuzz.com/cricket-series/9237/indian-premier-league-2026/matches'

async function tryFetchWithProxies(targetUrl, parseHTML = false) {
  for (let i = 0; i < CORS_PROXIES.length; i++) {
    try {
      const proxy = CORS_PROXIES[i]
      const res = await fetch(`${proxy}${encodeURIComponent(targetUrl)}`, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      const data = await res.json()
      // allorigins returns { contents: "..." }, others return raw
      const text = data.contents || data.body || (typeof data === 'string' ? data : JSON.stringify(data))
      if (!text) continue
      return text
    } catch (_) { /* try next proxy */ }
  }
  return null
}

async function fetchIPLLiveData() {
  // Strategy 1: Cricbuzz public match-list API (no auth needed)
  const LIVE_API = 'https://www.cricbuzz.com/api/cricket-match/live-matches'
  let text = await tryFetchWithProxies(LIVE_API)
  if (text) {
    try {
      const json = JSON.parse(text)
      // Find live IPL match
      const allMatches = json.matchDetails || []
      for (const group of allMatches) {
        const series = group.matchDetailsMap?.match || []
        for (const item of series) {
          const mi = item.matchInfo
          const ms = item.matchScore
          if (!mi) continue
          const seriesName = (mi.seriesName || '').toLowerCase()
          if (!seriesName.includes('premier league') && !seriesName.includes('ipl')) continue
          if (mi.state !== 'In Progress') continue

          const t1 = mi.team1?.teamSName || mi.team1?.teamName || 'Team1'
          const t2 = mi.team2?.teamSName || mi.team2?.teamName || 'Team2'
          const inn1 = ms?.team1Score?.inngs1
          const inn2 = ms?.team2Score?.inngs1
          const inn1s = inn1 ? `${inn1.runs}-${inn1.wickets ?? 0} (${inn1.overs ?? 0})` : null
          const inn2s = inn2 ? `${inn2.runs}-${inn2.wickets ?? 0} (${inn2.overs ?? 0})` : null

          return {
            isLive: true,
            teams: `${t1} vs ${t2}`,
            fullTeams: `${mi.team1?.teamName || t1} vs ${mi.team2?.teamName || t2}`,
            inn1: inn1 ? { team: t1, score: inn1s, runs: inn1.runs, wkts: inn1.wickets ?? 0, overs: inn1.overs ?? 0 } : null,
            inn2: inn2 ? { team: t2, score: inn2s, runs: inn2.runs, wkts: inn2.wickets ?? 0, overs: inn2.overs ?? 0 } : null,
            status: mi.status || '',
            venue: mi.venueInfo?.ground || mi.venueInfo?.city || '',
            matchDesc: mi.matchDesc || '',
            seriesName: mi.seriesName || 'IPL 2026',
            lastUpdated: new Date().toLocaleTimeString('en-IN'),
          }
        }
      }
      // Check for upcoming IPL match
      for (const group of allMatches) {
        const series = group.matchDetailsMap?.match || []
        for (const item of series) {
          const mi = item.matchInfo
          if (!mi) continue
          const seriesName = (mi.seriesName || '').toLowerCase()
          if (!seriesName.includes('premier league') && !seriesName.includes('ipl')) continue
          if (mi.state === 'Preview' || mi.state === 'Upcoming') {
            const t1 = mi.team1?.teamSName || 'TBA'
            const t2 = mi.team2?.teamSName || 'TBA'
            const startTime = mi.startDate ? new Date(parseInt(mi.startDate)) : null
            return {
              isLive: false,
              isUpcoming: true,
              teams: `${t1} vs ${t2}`,
              fullTeams: `${mi.team1?.teamName || t1} vs ${mi.team2?.teamName || t2}`,
              status: mi.status || '',
              venue: mi.venueInfo?.ground || mi.venueInfo?.city || '',
              matchDesc: mi.matchDesc || '',
              seriesName: mi.seriesName || 'IPL 2026',
              startTime: startTime ? startTime.toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '',
              lastUpdated: new Date().toLocaleTimeString('en-IN'),
            }
          }
          if (mi.state === 'Complete') {
            const t1 = mi.team1?.teamSName || 'Team1'
            const t2 = mi.team2?.teamSName || 'Team2'
            const ms = item.matchScore
            const inn1 = ms?.team1Score?.inngs1
            const inn2 = ms?.team2Score?.inngs1
            const inn1s = inn1 ? `${inn1.runs}-${inn1.wickets ?? 0} (${inn1.overs ?? 0})` : null
            const inn2s = inn2 ? `${inn2.runs}-${inn2.wickets ?? 0} (${inn2.overs ?? 0})` : null
            return {
              isLive: false,
              isCompleted: true,
              teams: `${t1} vs ${t2}`,
              fullTeams: `${mi.team1?.teamName || t1} vs ${mi.team2?.teamName || t2}`,
              inn1: inn1 ? { team: t1, score: inn1s } : null,
              inn2: inn2 ? { team: t2, score: inn2s } : null,
              status: mi.status || mi.result || '',
              venue: mi.venueInfo?.ground || '',
              matchDesc: mi.matchDesc || '',
              seriesName: mi.seriesName || 'IPL 2026',
              lastUpdated: new Date().toLocaleTimeString('en-IN'),
            }
          }
        }
      }
    } catch (_) {}
  }

  // Strategy 2: Try ESPN Cricinfo public feed
  const ESPN_URL = 'https://www.espncricinfo.com/matches/engine/match/series.json?series=1411166'
  text = await tryFetchWithProxies(ESPN_URL)
  if (text) {
    try {
      const json = JSON.parse(text)
      const matches = json.matches || []
      const live = matches.find(m => m.match_status === 'Live' || m.status_id === '1')
      if (live) {
        return {
          isLive: true,
          teams: `${live.team1_abbr || 'TBA'} vs ${live.team2_abbr || 'TBA'}`,
          fullTeams: `${live.team1 || 'TBA'} vs ${live.team2 || 'TBA'}`,
          status: live.status || '',
          inn1: live.innings && live.innings[0] ? { team: live.innings[0].batting_team_short, score: `${live.innings[0].runs}-${live.innings[0].wickets} (${live.innings[0].overs})` } : null,
          inn2: live.innings && live.innings[1] ? { team: live.innings[1].batting_team_short, score: `${live.innings[1].runs}-${live.innings[1].wickets} (${live.innings[1].overs})` } : null,
          venue: live.ground_name || '',
          matchDesc: live.general_string || '',
          seriesName: 'IPL 2026',
          lastUpdated: new Date().toLocaleTimeString('en-IN'),
        }
      }
    } catch (_) {}
  }

  return null
}

// ─── LIVE SCORE DISPLAY CARD ─────────────────────────────────
function LiveScoreCard({ match, loading, error, onRefresh, lastChecked }) {
  if (loading && !match) {
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', color: '#8899bb' }}>
          <div style={{ width: 16, height: 16, border: '2px solid #3498db', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          Fetching live IPL score...
        </div>
      </div>
    )
  }

  if (error && !match) {
    return (
      <div style={cardStyle}>
        <div style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 8 }}>⚠️ {error}</div>
        <button onClick={onRefresh} style={refreshBtnStyle}>🔄 Try Again</button>
      </div>
    )
  }

  if (!match) {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>🏏</div>
        <div style={{ color: '#8899bb', fontSize: 14 }}>No IPL match currently live.</div>
        <div style={{ color: '#8899bb', fontSize: 11, marginTop: 6 }}>Next match info will appear here when available.</div>
        {lastChecked && <div style={{ color: '#445577', fontSize: 10, marginTop: 10 }}>Last checked: {lastChecked}</div>}
        <button onClick={onRefresh} style={{ ...refreshBtnStyle, marginTop: 12 }}>🔄 Check Again</button>
      </div>
    )
  }

  const liveTag = match.isLive ? (
    <span style={{ background: '#e74c3c', color: '#fff', fontSize: 9, fontWeight: 900, padding: '2px 7px', borderRadius: 20, letterSpacing: 1.5, textTransform: 'uppercase', marginLeft: 8, verticalAlign: 'middle', animation: 'liveFlash 1.2s ease-in-out infinite' }}>● LIVE</span>
  ) : match.isUpcoming ? (
    <span style={{ background: '#f5a623', color: '#000', fontSize: 9, fontWeight: 900, padding: '2px 7px', borderRadius: 20, letterSpacing: 1.5, textTransform: 'uppercase', marginLeft: 8, verticalAlign: 'middle' }}>UPCOMING</span>
  ) : (
    <span style={{ background: '#2ecc71', color: '#000', fontSize: 9, fontWeight: 900, padding: '2px 7px', borderRadius: 20, letterSpacing: 1.5, textTransform: 'uppercase', marginLeft: 8, verticalAlign: 'middle' }}>COMPLETED</span>
  )

  return (
    <div style={cardStyle}>
      <style>{`
        @keyframes liveFlash { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { to{transform:rotate(360deg)} }
      `}</style>

      {/* Series + Match Tag */}
      <div style={{ fontSize: 10, color: '#8899bb', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
        {match.seriesName || 'IPL 2026'} · {match.matchDesc || ''}
      </div>

      {/* Teams */}
      <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
        {match.fullTeams || match.teams}{liveTag}
      </div>

      {/* Venue */}
      {match.venue && <div style={{ fontSize: 11, color: '#8899bb', marginBottom: 12 }}>📍 {match.venue}</div>}

      {/* Innings scores — Crex.com style */}
      {(match.inn1 || match.inn2) && (
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          {match.inn1 && (
            <div style={innsCardStyle(match.isLive && !match.inn2)}>
              <div style={{ fontSize: 11, color: '#8899bb', marginBottom: 2 }}>{match.inn1.team}</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: match.isLive && !match.inn2 ? '#2ecc71' : '#fff', letterSpacing: 1 }}>
                {match.inn1.score}
              </div>
              {match.isLive && !match.inn2 && (
                <div style={{ fontSize: 9, color: '#2ecc71', marginTop: 2, letterSpacing: 1 }}>BATTING</div>
              )}
            </div>
          )}
          {match.inn2 && (
            <div style={innsCardStyle(match.isLive)}>
              <div style={{ fontSize: 11, color: '#8899bb', marginBottom: 2 }}>{match.inn2.team}</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: match.isLive ? '#2ecc71' : '#fff', letterSpacing: 1 }}>
                {match.inn2.score}
              </div>
              {match.isLive && (
                <div style={{ fontSize: 9, color: '#2ecc71', marginTop: 2, letterSpacing: 1 }}>BATTING</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Upcoming: show start time */}
      {match.isUpcoming && match.startTime && (
        <div style={{ fontSize: 14, color: '#f5a623', fontWeight: 700, marginBottom: 8 }}>
          🕐 Starts: {match.startTime}
        </div>
      )}

      {/* Status line */}
      {match.status && (
        <div style={{ fontSize: 13, color: match.isLive ? '#f5a623' : '#2ecc71', fontWeight: 600, marginTop: 4, maxWidth: 360, margin: '4px auto 0' }}>
          {match.status}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
        <div style={{ fontSize: 10, color: '#445577' }}>
          {loading ? '⟳ Updating...' : `🕐 ${match.lastUpdated || lastChecked}`}
        </div>
        <button onClick={onRefresh} style={refreshBtnStyle} disabled={loading}>
          {loading ? '⟳' : '🔄 Refresh'}
        </button>
      </div>
      {match.isLive && (
        <div style={{ fontSize: 9, color: '#445577', marginTop: 6 }}>Auto-refreshes every 25 seconds</div>
      )}
    </div>
  )
}

const cardStyle = {
  marginBottom: 20, padding: '18px 20px', background: 'linear-gradient(135deg,#0d1625 0%,#161f38 100%)',
  borderRadius: 14, border: '1px solid rgba(245,166,35,0.35)', textAlign: 'center',
  boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
}

const innsCardStyle = (isCurrent) => ({
  background: isCurrent ? 'rgba(46,204,113,0.08)' : 'rgba(255,255,255,0.04)',
  border: `1px solid ${isCurrent ? 'rgba(46,204,113,0.3)' : 'rgba(255,255,255,0.08)'}`,
  borderRadius: 10, padding: '10px 20px', minWidth: 120,
})

const refreshBtnStyle = {
  background: 'transparent', border: '1px solid #3498db', color: '#3498db',
  padding: '4px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
  fontWeight: 700, letterSpacing: 0.5,
}

// ─── MATCH LOG COMPONENT ──────────────────────────────────────
// PUBLIC-ONLY: Includes Live IPL Score panel (scraping-based, no API key)
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
  const [liveError, setLiveError] = useState('')
  const [lastChecked, setLastChecked] = useState('')
  const liveIntervalRef = useRef(null)

  const fetchIPLScore = useCallback(async () => {
    setLiveLoading(true)
    setLiveError('')
    try {
      const data = await fetchIPLLiveData()
      setLiveMatch(data)
      setLastChecked(new Date().toLocaleTimeString('en-IN'))
      if (!data) setLiveError('')
    } catch (err) {
      setLiveError('Score feed temporarily unavailable. Will retry.')
    } finally {
      setLiveLoading(false)
    }
  }, [])

  useEffect(() => {
    if (showLiveScore) {
      fetchIPLScore()
      // Auto-refresh: 25s if live match, 60s if not
      liveIntervalRef.current = setInterval(() => {
        fetchIPLScore()
      }, 25000)
    } else {
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current)
      setLiveMatch(null)
      setLiveError('')
    }
    return () => { if (liveIntervalRef.current) clearInterval(liveIntervalRef.current) }
  }, [showLiveScore, fetchIPLScore])

  return (
    <div className="section">
      <div className="sec-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Match Log</span>
        <button
          onClick={() => setShowLiveScore(!showLiveScore)}
          className={`btn-sm ${showLiveScore ? 'btn-danger' : 'btn-success'}`}
          style={{ padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
        >
          {showLiveScore ? '🛑 Hide Live Score' : '📡 IPL Live Score'}
        </button>
      </div>

      {showLiveScore && (
        <LiveScoreCard
          match={liveMatch}
          loading={liveLoading}
          error={liveError}
          onRefresh={fetchIPLScore}
          lastChecked={lastChecked}
        />
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

// ─── OLYMPIC PODIUM ───────────────────────────────────────────
const PODIUM_CSS = `
@keyframes pdRiseUp   {from{transform:scaleY(0);transform-origin:bottom;opacity:0}to{transform:scaleY(1);transform-origin:bottom;opacity:1}}
@keyframes pdFloatIn  {from{opacity:0;transform:translateY(-50px) scale(0.6)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes pdMedalPop {0%{transform:scale(0) rotate(-30deg)}70%{transform:scale(1.2) rotate(8deg)}100%{transform:scale(1) rotate(0deg)}}
@keyframes pdFadeUp   {from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes pdShimmer  {0%{background-position:200% 0}100%{background-position:-200% 0}}
@keyframes pdConfetti {0%{opacity:1;transform:translateY(-10px) rotate(0deg)}100%{opacity:0;transform:translateY(500px) rotate(800deg)}}
@keyframes pdGoldGlow {0%,100%{box-shadow:0 0 18px 4px rgba(245,166,35,0.45),0 0 40px rgba(245,166,35,0.2)}50%{box-shadow:0 0 34px 8px rgba(245,166,35,0.75),0 0 70px rgba(245,166,35,0.4)}}
@keyframes pdSilGlow  {0%,100%{box-shadow:0 0 14px 3px rgba(192,192,192,0.4)}50%{box-shadow:0 0 28px 6px rgba(192,192,192,0.7)}}
@keyframes pdBrzGlow  {0%,100%{box-shadow:0 0 12px 2px rgba(205,127,50,0.35)}50%{box-shadow:0 0 24px 5px rgba(205,127,50,0.65)}}

/* Body bounce — each rank has different rhythm */
@keyframes pdBounce1  {0%,100%{transform:translateY(0) rotate(0deg)}30%{transform:translateY(-20px) rotate(-5deg)}65%{transform:translateY(-10px) rotate(4deg)}}
@keyframes pdBounce2  {0%,100%{transform:translateY(0) rotate(0deg)}35%{transform:translateY(-14px) rotate(-4deg)}70%{transform:translateY(-7px) rotate(3deg)}}
@keyframes pdBounce3  {0%,100%{transform:translateY(0)}40%{transform:translateY(-9px) rotate(-2deg)}75%{transform:translateY(-5px) rotate(2deg)}}

/* Arms */
@keyframes pdArmL1    {0%,100%{transform:rotate(-15deg)}50%{transform:rotate(55deg)}}
@keyframes pdArmR1    {0%,100%{transform:rotate(15deg)}50%{transform:rotate(-55deg)}}
@keyframes pdArmL2    {0%,100%{transform:rotate(-12deg)}50%{transform:rotate(40deg)}}
@keyframes pdArmR2    {0%,100%{transform:rotate(12deg)}50%{transform:rotate(-40deg)}}
@keyframes pdArmL3    {0%,100%{transform:rotate(-8deg)}50%{transform:rotate(25deg)}}
@keyframes pdArmR3    {0%,100%{transform:rotate(8deg)}50%{transform:rotate(-25deg)}}

/* Medal swing */
@keyframes pdMedalSwing {0%,100%{transform:rotate(-18deg)}50%{transform:rotate(18deg)}}

/* Crown float */
@keyframes pdCrown    {0%,100%{transform:translateY(0) rotate(-6deg) scale(1)}50%{transform:translateY(-9px) rotate(6deg) scale(1.12)}}

/* Stars sparkle */
@keyframes pdSparkle  {0%,100%{opacity:0;transform:scale(0.4) rotate(0deg)}50%{opacity:1;transform:scale(1.3) rotate(180deg)}}

/* Trophy wave */
@keyframes pdTrophy   {0%,100%{transform:rotate(-8deg) scale(1)}50%{transform:rotate(8deg) scale(1.2)}}

.pd-outer{
  position:relative;overflow:hidden;border-radius:20px;margin-bottom:32px;
  background:linear-gradient(155deg,#05080f 0%,#0b1528 40%,#080d1a 100%);
  border:1px solid #1e2d50;padding:28px 10px 16px;
}
.pd-outer::after{
  content:'';position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(ellipse 80% 50% at 50% 100%,rgba(245,166,35,0.07) 0%,transparent 70%);
}
.pd-confetti-layer{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:0;}
.pd-dot{position:absolute;border-radius:50%;opacity:0;animation:pdConfetti linear infinite;}
.pd-title{text-align:center;font-family:'Bebas Neue',sans-serif;font-size:clamp(20px,4vw,34px);letter-spacing:7px;color:#f5a623;text-shadow:0 0 28px rgba(245,166,35,0.55);position:relative;z-index:2;}
.pd-subtitle{text-align:center;font-size:10px;color:#8899bb;letter-spacing:3.5px;text-transform:uppercase;margin-bottom:26px;position:relative;z-index:2;}

.pd-stage{display:flex;align-items:flex-end;justify-content:center;gap:clamp(4px,2vw,20px);position:relative;z-index:2;padding:0 4px;}

/* ── Slot shell ── */
.pd-slot{display:flex;flex-direction:column;align-items:center;}

/* ── Crown ── */
.pd-crown{font-size:26px;margin-bottom:3px;animation:pdCrown 1.8s ease-in-out infinite;filter:drop-shadow(0 0 8px #FFD700);}

/* ── Character body ── */
.pd-char{display:flex;flex-direction:column;align-items:center;position:relative;}
.pd-slot.pr1 .pd-char{animation:pdBounce1 1.1s ease-in-out infinite;}
.pd-slot.pr2 .pd-char{animation:pdBounce2 1.4s ease-in-out infinite;}
.pd-slot.pr3 .pd-char{animation:pdBounce3 1.8s ease-in-out infinite;}

/* ── Arms ── */
.pd-arm-wrap{position:relative;width:0;height:0;}
.pd-arm{position:absolute;height:7px;border-radius:4px;}
.pd-slot.pr1 .pd-arm.left {width:20px;left:-36px;top:22px;transform-origin:right center;animation:pdArmL1 1.1s ease-in-out infinite;}
.pd-slot.pr1 .pd-arm.right{width:20px;right:-36px;top:22px;transform-origin:left center;animation:pdArmR1 1.1s ease-in-out infinite;}
.pd-slot.pr2 .pd-arm.left {width:17px;left:-31px;top:19px;transform-origin:right center;animation:pdArmL2 1.4s ease-in-out infinite;}
.pd-slot.pr2 .pd-arm.right{width:17px;right:-31px;top:19px;transform-origin:left center;animation:pdArmR2 1.4s ease-in-out infinite;}
.pd-slot.pr3 .pd-arm.left {width:14px;left:-26px;top:17px;transform-origin:right center;animation:pdArmL3 1.8s ease-in-out infinite;}
.pd-slot.pr3 .pd-arm.right{width:14px;right:-26px;top:17px;transform-origin:left center;animation:pdArmR3 1.8s ease-in-out infinite;}

/* ── Head / photo ring ── */
.pd-ring-wrap{position:relative;}
.pd-ring{border-radius:50%;overflow:hidden;border:4px solid;background:#1b2540;position:relative;}
.pd-slot.pr1 .pd-ring{width:88px;height:88px;border-color:#FFD700;animation:pdGoldGlow 2.2s ease-in-out infinite;}
.pd-slot.pr2 .pd-ring{width:74px;height:74px;border-color:#C0C0C0;animation:pdSilGlow  2.5s ease-in-out infinite;}
.pd-slot.pr3 .pd-ring{width:65px;height:65px;border-color:#CD7F32;animation:pdBrzGlow  2.8s ease-in-out infinite;}
.pd-ring img{width:100%;height:100%;object-fit:cover;object-position:center top;filter:saturate(1.25) contrast(1.08);}
.pd-ring-fallback{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:30px;}

/* ── Medal badge on ring ── */
.pd-ring-medal{position:absolute;bottom:-8px;right:-8px;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2.5px solid #05080f;}
.pd-slot.pr1 .pd-ring-medal{background:#FFD700;animation:pdMedalPop 0.5s cubic-bezier(.34,1.56,.64,1) 1s both;}
.pd-slot.pr2 .pd-ring-medal{background:#C0C0C0;animation:pdMedalPop 0.5s cubic-bezier(.34,1.56,.64,1) 1.2s both;}
.pd-slot.pr3 .pd-ring-medal{background:#CD7F32;animation:pdMedalPop 0.5s cubic-bezier(.34,1.56,.64,1) 1.4s both;}

/* ── Jersey body ── */
.pd-jersey{border-radius:8px 8px 14px 14px;margin-top:-4px;display:flex;align-items:center;justify-content:center;position:relative;}
.pd-slot.pr1 .pd-jersey{width:56px;height:40px;}
.pd-slot.pr2 .pd-jersey{width:48px;height:34px;}
.pd-slot.pr3 .pd-jersey{width:42px;height:30px;}

/* ── Hanging medal ── */
.pd-hang-medal{display:flex;flex-direction:column;align-items:center;position:absolute;bottom:-14px;left:50%;transform:translateX(-50%);}
.pd-hang-string{width:1.5px;height:10px;background:rgba(255,255,255,0.35);}
.pd-hang-emoji{animation:pdMedalSwing 2s ease-in-out infinite;display:block;line-height:1;}
.pd-slot.pr1 .pd-hang-emoji{font-size:20px;}
.pd-slot.pr2 .pd-hang-emoji{font-size:17px;}
.pd-slot.pr3 .pd-hang-emoji{font-size:15px;}

/* ── Name + stats above block ── */
.pd-name{font-family:'Bebas Neue',sans-serif;letter-spacing:2.5px;text-align:center;margin-top:20px;animation:pdFadeUp 0.5s 0.5s both;}
.pd-slot.pr1 .pd-name{font-size:19px;color:#FFD700;text-shadow:0 0 14px rgba(255,215,0,0.55);}
.pd-slot.pr2 .pd-name{font-size:16px;color:#C0C0C0;}
.pd-slot.pr3 .pd-name{font-size:15px;color:#CD7F32;}

.pd-prize{border-radius:20px;padding:4px 12px;font-size:12px;font-weight:800;white-space:nowrap;margin-top:4px;margin-bottom:3px;animation:pdFadeUp 0.5s 0.65s both;font-family:'Orbitron',sans-serif;}
.pd-profit-pos{background:rgba(46,204,113,0.14);border:1px solid rgba(46,204,113,0.45);color:#2ecc71;}
.pd-profit-neg{background:rgba(231,76,60,0.14);border:1px solid rgba(231,76,60,0.45);color:#e74c3c;}

.pd-wintag{font-size:10px;color:#8899bb;text-align:center;margin-bottom:8px;animation:pdFadeUp 0.5s 0.8s both;letter-spacing:0.5px;}

/* ── Trophy icon above block ── */
.pd-trophy-icon{font-size:22px;animation:pdTrophy 2.2s ease-in-out infinite;filter:drop-shadow(0 2px 6px rgba(245,166,35,0.5));}
.pd-slot.pr2 .pd-trophy-icon,.pd-slot.pr3 .pd-trophy-icon{font-size:16px;}

/* ── Podium block ── */
.pd-block{border-radius:10px 10px 0 0;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;}
.pd-slot.pr1 .pd-block{width:clamp(108px,16vw,130px);height:112px;background:linear-gradient(175deg,#ffe066 0%,#f5a623 45%,#8a5500 100%);animation:pdRiseUp 0.8s cubic-bezier(.22,1,.36,1) 0.05s both;}
.pd-slot.pr2 .pd-block{width:clamp(94px,14vw,114px);height:78px; background:linear-gradient(175deg,#e8e8e8 0%,#C0C0C0 45%,#666    100%);animation:pdRiseUp 0.8s cubic-bezier(.22,1,.36,1) 0.22s both;}
.pd-slot.pr3 .pd-block{width:clamp(84px,12vw,102px);height:54px; background:linear-gradient(175deg,#e8b07a 0%,#CD7F32 45%,#5a330e 100%);animation:pdRiseUp 0.8s cubic-bezier(.22,1,.36,1) 0.4s  both;}
.pd-block-num{font-family:'Bebas Neue',sans-serif;line-height:1;color:rgba(0,0,0,0.22);user-select:none;}
.pd-slot.pr1 .pd-block-num{font-size:72px;}
.pd-slot.pr2 .pd-block-num{font-size:56px;}
.pd-slot.pr3 .pd-block-num{font-size:44px;}

/* ── Base bar ── */
.pd-base{height:10px;background:linear-gradient(90deg,#f5a623,#2ecc71,#3498db,#e74c3c,#f5a623);background-size:400% 100%;border-radius:0 0 10px 10px;animation:pdShimmer 4s linear infinite;margin:0 6px 18px;opacity:0.5;position:relative;z-index:2;}

/* ── Stat chips below ── */
.pd-chips{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;animation:pdFadeUp 0.6s 1.1s both;position:relative;z-index:2;}
.pd-chip{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:8px 14px;text-align:center;min-width:88px;}
.pd-chip-lbl{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#8899bb;}
.pd-chip-name{font-family:'Bebas Neue',sans-serif;font-size:17px;letter-spacing:2px;margin-top:2px;}
.pd-chip-sub{font-size:10px;color:#8899bb;margin-top:2px;}
`

const RANK_COLORS = { 1:'#FFD700', 2:'#C0C0C0', 3:'#CD7F32' }
const RANK_MEDALS = { 1:'🥇', 2:'🥈', 3:'🥉' }

function OlympicPodium({ sorted }) {
  const top3 = sorted.slice(0, 3)
  if (top3.length < 1) return null

  useEffect(() => {
    if (!document.getElementById('podium-styles')) {
      const s = document.createElement('style')
      s.id = 'podium-styles'
      s.textContent = PODIUM_CSS
      document.head.appendChild(s)
    }
    // Confetti particles
    const wrap = document.getElementById('pd-confetti-inner')
    if (!wrap || wrap.children.length > 0) return
    const colors = ['#f5a623','#2ecc71','#3498db','#e74c3c','#9b59b6','#C0C0C0','#FFD700','#1abc9c','#e67e22','#fff']
    for (let i = 0; i < 40; i++) {
      const d = document.createElement('div')
      d.className = 'pd-dot'
      const sz = 4 + Math.random() * 6
      d.style.cssText = `left:${Math.random()*100}%;top:-14px;width:${sz}px;height:${sz}px;background:${colors[i%colors.length]};animation-duration:${3+Math.random()*3.5}s;animation-delay:${Math.random()*6}s;border-radius:${Math.random()>0.5?'50%':'2px'};`
      wrap.appendChild(d)
    }
  }, [])

  // Olympic order: Silver | Gold | Bronze
  const displayOrder = [top3[1], top3[0], top3[2]].filter(Boolean)
  const displayRanks = [2, 1, 3]
  const displayCls   = ['pr2','pr1','pr3']

  return (
    <div className="pd-outer">
      <div className="pd-confetti-layer"><div id="pd-confetti-inner" /></div>

      <div className="pd-title">🏆 Season Champions Podium 🏆</div>
      <div className="pd-subtitle">VOIS Panthers · IPL 2026 · Fantasy League Top Warriors</div>

      <div className="pd-stage">
        {displayOrder.map((p, oi) => {
          if (!p) return null
          const rank    = displayRanks[oi]
          const cls     = displayCls[oi]
          const profit  = p.totalWon - p.totalInvested
          const mc      = RANK_COLORS[rank]
          const imgPath = PLAYER_IMAGES[p.name]
          const isPos   = profit >= 0

          return (
            <div className={`pd-slot ${cls}`} key={p.name}>
              {/* Crown only for #1 */}
              {rank === 1 && <div className="pd-crown">👑</div>}

              {/* Animated character */}
              <div className="pd-char">
                {/* Arms (positioned relative to jersey) */}
                <div className="pd-arm-wrap">
                  <div className="pd-arm left"  style={{background: p.color+'cc'}} />
                  <div className="pd-arm right" style={{background: p.color+'cc'}} />
                </div>

                {/* Photo head ring */}
                <div className="pd-ring-wrap">
                  <div className="pd-ring">
                    {imgPath
                      ? <img src={imgPath} alt={p.name} onError={e=>{e.target.style.display='none';e.target.nextSibling.style.display='flex'}} />
                      : null}
                    <div className="pd-ring-fallback" style={{display:imgPath?'none':'flex',background:p.color+'22',color:p.color}}>{p.name[0]}</div>
                  </div>
                  <div className="pd-ring-medal">{RANK_MEDALS[rank]}</div>
                </div>

                {/* Jersey */}
                <div className="pd-jersey" style={{background:`linear-gradient(160deg,${p.color}dd,${p.color}88)`}}>
                  <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:rank===1?14:12,fontWeight:900,color:'#fff',opacity:0.9,letterSpacing:1}}>{p.name[0]}</span>
                  {/* Hanging medal on string */}
                  <div className="pd-hang-medal">
                    <div className="pd-hang-string" />
                    <span className="pd-hang-emoji">{RANK_MEDALS[rank]}</span>
                  </div>
                </div>
              </div>

              {/* Name */}
              <div className="pd-name">{p.name}</div>

              {/* Prize money */}
              <div className={`pd-prize ${isPos?'pd-profit-pos':'pd-profit-neg'}`}>
                {isPos?'+':''}₹{profit.toFixed(2)}
              </div>
              <div className="pd-wintag">🏏 {p.wins} win{p.wins!==1?'s':''} · {p.paidContests} paid contests</div>

              {/* Trophy then block */}
              <div className="pd-trophy-icon">{rank===1?'🏆':rank===2?'🥈':'🥉'}</div>
              <div className="pd-block">
                <div className="pd-block-num">{rank}</div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="pd-base" />

      {/* Summary chips */}
      <div className="pd-chips">
        {top3.map((p, i) => {
          const profit  = p.totalWon - p.totalInvested
          const mc      = [RANK_COLORS[1],RANK_COLORS[2],RANK_COLORS[3]][i]
          return (
            <div className="pd-chip" key={p.name} style={{borderColor: mc+'44'}}>
              <div className="pd-chip-lbl" style={{color:mc}}>{['🥇 Gold','🥈 Silver','🥉 Bronze'][i]}</div>
              <div className="pd-chip-name" style={{color:mc}}>{p.name}</div>
              <div className="pd-chip-sub">P/L: {profit>=0?'+':''}₹{profit.toFixed(2)}</div>
              <div className="pd-chip-sub">{p.wins}W · {p.paidContests} paid</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── LEADERBOARD ──────────────────────────────────────────────
function Leaderboard({ matches }) {
  const stats = computePlayerStats(matches)
  const sorted = PLAYERS.map((p, i) => ({ name:p, color:COLORS[i], ...stats[p] }))
    .sort((a, b) => (b.totalWon - b.totalInvested) - (a.totalWon - a.totalInvested))

  // Assign proper tied ranks
  let currentRank = 1, lastProfit = null
  const ranked = sorted.map(p => {
    const profit = p.totalWon - p.totalInvested
    if (lastProfit !== null && profit < lastProfit) currentRank++
    lastProfit = profit
    return { ...p, profit, rank: currentRank }
  })

  return (
    <div className="section">
      <div className="sec-title">Leaderboard</div>

      {/* 🏆 ANIMATED OLYMPIC PODIUM — TOP 3 */}
      <OlympicPodium sorted={ranked} />

      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:4,color:'#8899bb',marginBottom:12,paddingLeft:4}}>FULL STANDINGS</div>
      <div className="lb-grid">
        {ranked.map((p) => {
          const winpct = p.paidContests > 0 ? ((p.wins / p.paidContests) * 100).toFixed(1) : '0.0'
          const rankClass = p.rank===1?'rank1':p.rank===2?'rank2':p.rank===3?'rank3':''
          const rankDisplay = p.rank===1?'🥇':p.rank===2?'🥈':p.rank===3?'🥉':p.rank
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
                <div className={`lb-profit ${p.profit>0?'pos':p.profit<0?'neg':'neu'}`}>{p.profit>=0?'+':''}₹{p.profit.toFixed(2)}</div>
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

  // ── Admin view state ──────────────────────────────────────────
  // 'public' | 'login' | 'admin'
  const [adminView, setAdminView] = useState(() => {
    try {
      const raw = sessionStorage.getItem('vois_admin_session')
      if (raw) { const { expiry } = JSON.parse(raw); if (Date.now() < expiry) return 'admin' }
    } catch {}
    return 'public'
  })

  const updateRefreshUI = useCallback(() => {
    const s = getRefreshStats()
    setRefreshLeft(Math.max(0, DAILY_LIMIT - s.count))
  }, [])

  const fetchFromCloud = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setLiveState({ dot:'stale', label:'CONNECTING...', info:'Fetching latest data...' })
    try {
      // Try cache first for instant render
      const cached = sessionStorage.getItem('vois_match_cache')
      if (cached && !silent) {
        try {
          const { data: cachedData, ts } = JSON.parse(cached)
          if (Date.now() - ts < 120000) { // 2 min cache
            setMatches(cachedData.matches || cachedData || [])
            setLiveState({ dot:'', label:'🟢 LIVE', info:`Cached · Refreshing in background...` })
            setLoading(false)
          }
        } catch (_) {}
      }

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
      sessionStorage.setItem('vois_match_cache', JSON.stringify({ data, ts: Date.now() }))
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
      {/* ── Admin routing ─────────────────────────────────────── */}
      {adminView === 'login' && (
        <AdminLogin
          onLoginSuccess={() => setAdminView('admin')}
          onBack={() => setAdminView('public')}
        />
      )}
      {adminView === 'admin' && (
        <AdminPage onLogout={() => setAdminView('public')} />
      )}

      {/* ── Public site (hidden but mounted while admin is open) ─ */}
      <div style={adminView !== 'public' ? { display:'none' } : {}}>
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
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div className="season-badge">IPL 2026</div>
            <button
              onClick={() => setAdminView('login')}
              title="Admin Login"
              style={{
                fontFamily:"'Rajdhani',sans-serif",fontWeight:800,fontSize:12,letterSpacing:2,
                padding:'5px 13px',borderRadius:20,border:'1px solid rgba(231,76,60,0.5)',
                background:'rgba(231,76,60,0.1)',color:'#e74c3c',cursor:'pointer',
                textTransform:'uppercase',transition:'all 0.2s',whiteSpace:'nowrap'
              }}
            >🔐 Admin</button>
          </div>
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
      </div>{/* end public wrapper */}
    </>
  )
}
