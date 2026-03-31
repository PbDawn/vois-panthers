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
function calculatePrizes(m) {
  const paidCount = PLAYERS.filter(p => m.players[p] && m.players[p].joined && m.players[p].paid).length;
  const fee = parseFloat(m.fee) || 0;
  const matchNum = parseInt(m.matchno) || 0;
  
  let dist = { 1: 0, 2: 0, winnerCountLimit: 0, totalPool: 0 };

  // 1. Define the Prize Pool Rules
  if (matchNum >= 3) {
    if (paidCount >= 2 && paidCount <= 5) {
      dist[1] = fee * paidCount;
      dist.winnerCountLimit = 1;
    } else if (paidCount === 6) {
      dist[1] = fee * 4;
      dist[2] = fee * 2;
      dist.winnerCountLimit = 2;
    } else if (paidCount === 7) {
      dist[1] = fee * 5;
      dist[2] = fee * 2;
      dist.winnerCountLimit = 2;
    }
  } else {
    rank1Pot = fee * paidCount;
    dist.winnerCountLimit = (paidCount >= 1) ? 1 : 0;
  }

  // 2. Critical: Sum the pots so the Pool column isn't ₹0
  dist.totalPool = dist[1] + dist[2];
  return dist;
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

function computePlayerStats(matches) {
  let stats = {}
  PLAYERS.forEach(p => { stats[p] = { matchesPlayed:0, contested:0, paidContests:0, wins:0, totalInvested:0, totalWon:0, bestPoints:0, carryFwd:0, totalPointsSum:0, pointsMatchCount:0, recentForm:[], activeDeposits: 0 } })
  let cf = {}; PLAYERS.forEach(p => { cf[p] = 0 })
  matches.forEach(m => {
    // CRITICAL FIX: Only process matches that are actually completed
    const matchIsComplete = m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—';
        
    const done = m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—'
    const prizes = calculatePrizes(m)
    PLAYERS.forEach(p => {
      const pd = m.players[p]
      if (!pd || !pd.joined) return
      const s = stats[p]
      // Logic for UPCOMING or ONGOING matches
      if (!matchIsComplete) {
        if (m.contest === 'yes' && pd.paid) {
          s.activeDeposits += m.fee; // Amount deposited for future match
        }
        return; // Skip main stats (Played/Won/Rank) for this match
      }

      // Logic for COMPLETED matches only
      s.matchesPlayed++;
      
      if (m.contest === 'yes') {
        s.contested++
        if (pd.paid) {
          s.paidContests++
          if (cf[p] <= 0) s.totalInvested += m.fee; else cf[p] -= m.fee
          if (pd.points > 0) { s.totalPointsSum += pd.points; s.pointsMatchCount++ }
          if (pd.points > s.bestPoints) s.bestPoints = pd.points
          if (done) {
            const rank = m.joinedRanks ? m.joinedRanks[p] : null
            const isRank1 = rank === 1, isRank2 = rank === 2 && prizes.winnerCount === 2
            if (isRank1 || isRank2) {
              s.wins++
              const won = isRank1 ? prizes[1] : prizes[2]
              
              // FIXED: Check individual player status in the transferred object
              const isPlayerPaid = (m.transferred && typeof m.transferred === 'object')
                ? m.transferred[p] === true
                : m.transferred === true; // Fallback for old data
            
              if (isPlayerPaid) {
                s.totalWon += won; 
              } else {
                cf[p] += won; // Correctly moves amount to Carry Forward if Pending
              }
              
              s.recentForm.push(isRank1 ? 'win1' : 'win2')
            } else { s.recentForm.push('loss') }
          }
        } else { if (done) s.recentForm.push('skip') }
      }
    })
  })
  PLAYERS.forEach(p => { stats[p].carryFwd = cf[p] > 0 ? cf[p] : 0; stats[p].recentForm = stats[p].recentForm.slice(-5) })
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
    if (maxWins > 0 && s.wins === maxWins)                         badges[p].push({ icon:'👑', label:'The Legend',     cls:'badge-legend' })
    if (maxBestPts > 0 && s.bestPoints === maxBestPts)             badges[p].push({ icon:'🎯', label:'Point Sniper',   cls:'badge-sniper' })
    if (maxAvgPts > 0 && avg === maxAvgPts && s.pointsMatchCount > 0) badges[p].push({ icon:'⚙️', label:'Points Machine', cls:'badge-machine' })
    if (maxWinPct > 0 && winPct === maxWinPct && s.paidContests >= 2) badges[p].push({ icon:'🛡️', label:'Iron Consistent',cls:'badge-ironman' })
    if (maxContests > 0 && s.paidContests === maxContests)         badges[p].push({ icon:'🐉', label:'Dragon Grinder', cls:'badge-dragon' })
    if (maxProfit > 0 && profit === maxProfit)                     badges[p].push({ icon:'🔥', label:'Phoenix Profit', cls:'badge-phoenix' })
    if (s.wins >= 3)                                               badges[p].push({ icon:'📜', label:'Hat-Trick Hero', cls:'badge-scholar' })
  })
  return badges
}

function getRefreshStats() {
  const today = new Date().toISOString().split('T')[0]
  let s = JSON.parse(localStorage.getItem('vois_refresh_stats') || '{}')
  if (s.date !== today) s = { date: today, count: 0 }
  return s
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

// ─── MATCH LOG ────────────────────────────────────────────────
function MatchLog({ matches }) {
  const nextUpcoming = findNextUpcomingMatch(matches)
  const finished = matches.filter(m => m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—')
  const totalPool = finished.reduce((s, m) => s + (m.pool || 0), 0)
  const totalContests = finished.filter(m => m.contest === 'yes').length
  
  // Updated to count individual transfers from the new object structure
    const totalTransferred = finished.reduce((count, m) => {
    if (m.transferred && typeof m.transferred === 'object') {
      return count + Object.values(m.transferred).filter(v => v === true).length;
    }
    return count + (m.transferred === true ? 1 : 0);
  }, 0);

  const [showLiveScore, setShowLiveScore] = useState(false);
  const [liveMatch, setLiveMatch] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchIPLScore = async () => {
    if (!showLiveScore) return;
    setLoading(true);
    setErrorMsg('');
    const options = {
      method: 'GET',
      headers: {
        'x-rapidapi-key': '6db820e94emsh24dd09b8e658f4cp15f50ejsn4febbb8496be', 
        'x-rapidapi-host': 'cricbuzz-cricket.p.rapidapi.com'
      }
    };
    try {
      const response = await fetch('https://cricbuzz-cricket.p.rapidapi.com/matches/v1/live', options);
      if (!response.ok) throw new Error(`Server Error: ${response.status}`);
      const text = await response.text();
      if (!text || text.trim().length === 0) {
        setLiveMatch(null);
        return;
      }
     const result = JSON.parse(text);
      const leagueGroup = result.typeMatches?.find(group => group.matchType === "League");
      
      // 1. We define it as iplSeries here
      const iplSeries = leagueGroup?.seriesMatches?.find(s => 
        s.seriesAdWrapper?.seriesName.toLowerCase().includes("indian premier league")
      );

      // 2. CRITICAL FIX: Change 'ipl' to 'iplSeries' to match the variable above
      if (iplSeries && iplSeries.seriesAdWrapper.matches.length > 0) {
        const match = iplSeries.seriesAdWrapper.matches[0];
        const info = match.matchInfo;
        const score = match.matchScore;
        
        // Default to "---" if score hasn't loaded yet
        let liveScoreText = "---";
        
                if (score) {
          const battingTeamId = score.battingTeamId;
          const battingTeam = battingTeamId === info.team1.teamId ? info.team1.teamName : info.team2.teamName;
          const scoreObj = battingTeamId === info.team1.teamId ? score.team1Score : score.team2Score;
          
          if (scoreObj && scoreObj.inngs1) {
            const runs = scoreObj.inngs1.runs;
            const wickets = scoreObj.inngs1.wickets || 0;
            const overs = scoreObj.inngs1.overs || 0;
            // This will now show "GT: 15-0 (2.2)" instead of "---"
            liveScoreText = `${battingTeam}: ${runs}-${wickets} (${overs})`;
          }
        }
      
        setLiveMatch({
          teams: `${info.team1.teamName} vs ${info.team2.teamName}`,
          runs: liveScoreText,
          status: info.status,
          venue: info.venueInfo.ground
        });
      } else {
        setLiveMatch(null);
      }
    } catch (err) {
      console.error("Fetch Failed:", err.message);
      setErrorMsg("API is temporarily unavailable or limit reached.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (showLiveScore) {
      fetchIPLScore();
      const interval = setInterval(fetchIPLScore, 180000); 
      return () => clearInterval(interval);
    }
  }, [showLiveScore]);
  
  return (
    <div className="section">
      <div className="sec-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Match Log</span>
        <button 
          onClick={() => setShowLiveScore(!showLiveScore)}
          className={`btn-sm ${showLiveScore ? 'btn-danger' : 'btn-success'}`}
          style={{ padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }}
        >
          {showLiveScore ? '🛑 Hide Live Score' : '📡 Show  Live'}
        </button>
      </div>

      {showLiveScore && (
        <div style={{ marginBottom: '20px', padding: '20px', background: '#161f38', borderRadius: '12px', border: '1px solid #f5a623', textAlign: 'center' }}>
          {loading && !liveMatch ? (
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
            <div style={{ color: '#8899bb' }}>No  match is currently Live. <br/><span style={{color: '#f5a623'}}>Stay Tuned for updates!</span></div>
          )}
        </div>
      )}
      
      <div className="totals-bar">
        {[['Total Matches', matches.length], ['Contests Played', totalContests], ['Total Pool', `₹${totalPool}`], ['Payouts Done', totalTransferred]].map(([label, val]) => (
          <div className="total-chip" key={label}><div className="total-chip-label">{label}</div><div className="total-chip-val">{val}</div></div>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {['Match','Date','Teams','Team Won','Match Time','Contest','Joined','Fee(₹)','Pool(₹)','Fantasy Winner','Payout(₹)','Transferred'].map(h => <th key={h}>{h}</th>)}
              {PLAYERS.map(p => <th key={p}><div style={{fontSize:11,whiteSpace:'nowrap',padding: '10px 5px'}}>{p}<br/><span style={{color:'var(--text2)',fontSize:9}}>J/P/Pts/Rk</span></div></th>)}
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
              const matchStartTime = getMatchDateTime(m);
              const hasStarted = matchStartTime ? (new Date() > matchStartTime) : done;
              
              // --- START UPDATED TIE-HANDLING LOGIC ---
              let winnersInfo = []
              if (done) {
                // 1. Identify ALL paid players at Rank 1 and Rank 2
                const r1Players = PLAYERS.filter(p => m.joinedRanks?.[p] === 1 && m.players[p]?.paid);
                const r2Players = PLAYERS.filter(p => m.joinedRanks?.[p] === 2 && m.players[p]?.paid);

                // 2. Split Rank 1 Pot among ALL tied Rank 1 players
                if (r1Players.length > 0) {
                  const splitPrize1 = prizes[1] / r1Players.length;
                  r1Players.forEach(p => {
                    winnersInfo.push({ name: p, rank: 1, prize: splitPrize1 });
                  });
                }

                // 3. Split Rank 2 Pot among ALL tied Rank 2 players (if rules allow rank 2)
                if (prizes.winnerCount === 2 && r2Players.length > 0) {
                  const splitPrize2 = prizes[2] / r2Players.length;
                  r2Players.forEach(p => {
                    winnersInfo.push({ name: p, rank: 2, prize: splitPrize2 });
                  });
                }
              }
              // --- END UPDATED TIE-HANDLING LOGIC ---

                            // Winners Name Column
              const winnerNamesHtml = winnersInfo.map(w =>
                <div key={w.name} style={{fontSize:11, height:22, display:'flex', alignItems:'center'}}>
                  {w.rank===1?'🥇':'🥈'} <b>{w.name}</b>
                </div>
              ) || '—';
              
              // Payout Amount Column
              const winnerPrizesHtml = winnersInfo.map(w =>
                <div key={w.name} style={{fontSize:11, height:22, display:'flex', alignItems:'center', color:'var(--green)'}}>
                  ₹{w.prize.toFixed(2)}
                </div>
              ) || '—';
              
              // Transferred Status Column
              const transferStatusHtml = winnersInfo.map(w => {
                const isDone = (m.transferred && typeof m.transferred === 'object') 
                  ? m.transferred[w.name] === true 
                  : m.transferred === true;
              
                return (
                  <div key={w.name} style={{height:22, display:'flex', alignItems:'center', marginBottom:2}}>
                    {isDone 
                      ? <span className="transfer-done" style={{fontSize:10}}>✅ Done</span> 
                      : <span className="transfer-pending" style={{fontSize:10}}>⏳ Pending</span>
                    }
                  </div>
                );
              }) || '—';

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
                  <td style={{color:'var(--green)',fontWeight:700,fontSize:11}}>₹{m.pool}</td>
                  <td style={{fontSize:11}}>{winnersInfo.length > 0 ? winnersInfo.map(w => <div key={w.name} style={{fontSize:11, height:22, display:'flex', alignItems:'center'}}>{w.rank===1?'🥇':'🥈'} <b>{w.name}</b></div>) : '—'}</td>
                  <td style={{fontSize:11}}>{winnersInfo.length > 0 ? winnersInfo.map(w => <div key={w.name} style={{fontSize:11, height:22, display:'flex', alignItems:'center', color:'var(--green)'}}>₹{w.prize.toFixed(2)}</div>) : '—'}</td>
                  <td>{m.contest === 'yes' && winnersInfo.length > 0 ? transferStatusHtml : '—'}</td>
                  {PLAYERS.map(p => {
                    const pd = m.players[p]
                    if (!pd || !pd.joined) return <td key={p} style={{color:'var(--text2)',fontSize:13}}>—</td>
                    const rawRank = m.joinedRanks?.[p] ?? '?';
                    const rank = (done || pd.points > 0) ? rawRank : '—';
                    const isWinner = done && pd.paid && (rank===1 || (rank===2 && prizes.winnerCount===2))
                    if (isWinner) return (
                      <td key={p}>
                        <div className={rank===1?'rank-1-box':'rank-2-box'}>
                          <div style={{fontSize:9}}>✅ Joined 💰 Paid</div>
                          <div style={{fontSize:14,fontWeight:900,color:'var(--accent)'}}>{pd.points}</div>
                          <div style={{fontSize:13}}>{rank===1?'🥇':'🥈'} <span style={{fontSize:10}}>#{rank}</span></div>
                        </div>
                      </td>
                    )
                    return (
                      <td key={p}>
                        <div style={{fontSize:9}}>✅ Joined</div>
                        <div className={pd.paid?'paid-yes':'paid-no'} style={{fontSize:9}}>{pd.paid?'💰 Paid':'❌ Unpaid'}</div>
                        <div style={{fontSize:12,fontWeight:700}}>{pd.points}</div>
                        <div className={`rank-${rank}`} style={{fontSize:10}}>{rank !== '—' ? `#${rank}` : '—'}</div>
                        {!pd.paid && <button className="pay-now-btn" style={{padding:'2px 4px',fontSize:8}} onClick={()=>alert(`🏏 IPL Season is On! 🏆\n\nEntry fee is still pending. Check the pinned message in WhatsApp group: \"_VOIS Dream 11\" to pay via UPI QR code.\n\nGood luck! 🔥`)}>💸 Pay Now</button>}
                      </td>
                    )
                  })}
                  <td style={{textAlign:'center'}}>
                    {m.contestLink && !hasStarted ? (
                      <a href={m.contestLink} target="_blank" rel="noreferrer" className="app-link-btn" style={{fontSize:9, padding:'5px 8px', display:'block', lineHeight:1.2}}>🏆 Click Here to join the Contest</a>
                    ) : (
                      <span style={{color:'var(--text2)', fontSize:10}}>{done ? '—' : 'Contest Closed'}</span>
                    )}
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
                        })}
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
                {/* NEW ENTRY: Show deposit for matches yet to be completed */}
                {s.activeDeposits > 0 && (
                  <div className="p-stat-row" style={{borderBottom: '1px solid rgba(52, 152, 219, 0.3)', paddingBottom: '8px', marginBottom: '8px'}}>
                    <span className="p-stat-label" style={{color: '#3498db', fontWeight: 'bold'}}>💰 Active Deposit</span>
                    <div style={{textAlign: 'right'}}>
                      <span className="p-stat-val" style={{color: '#3498db'}}>₹{s.activeDeposits}</span>
                      <div style={{fontSize: '9px', color: 'var(--text2)'}}>Match pending/ongoing</div>
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
                {/* <div className="lb-stats">
                  {[['Matches',p.matchesPlayed],['Paid',p.paidContests],['Wins',p.wins],['Win%',winpct+'%'],['Invested','₹'+p.totalInvested],['Won','₹'+p.totalWon.toFixed(2)]].map(([k,v])=>(
                    <div className="lb-stat" key={k}>{k}: <span>{v}</span></div>
                  ))}
                  {p.carryFwd > 0 && <div className="lb-stat">Carry Fwd: <span className="cf-tag">₹{p.carryFwd.toFixed(2)}</span></div>}
                </div> */}
                <div className="lb-stats">
                  {[
                    ['Matches', p.matchesPlayed],
                    ['Paid', p.paidContests],
                    ['Wins', p.wins],
                    ['Win%', winpct + '%'],
                    ['Invested', '₹' + p.totalInvested],
                    ['Won', '₹' + p.totalWon.toFixed(2)],
                    // This adds the Active Deposit row ONLY if the amount is greater than 0
                    ...(p.activeDeposits > 0 ? [['Active Deposit', '₹' + p.activeDeposits]] : [])
                  ].map(([k, v]) => (
                    <div className="lb-stat" key={k}>
                      {k}: <span className={k === 'Active Deposit' ? 'active-amt' : ''}>{v}</span>
                    </div>
                  ))}
                
                  {/* Carry Forward logic remains untouched below */}
                  {p.carryFwd > 0 && (
                    <div className="lb-stat">
                      Carry Fwd: <span className="cf-tag">₹{p.carryFwd.toFixed(2)}</span>
                    </div>
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
        if (done && pd.paid && m.transferred) {
          const prizes = calculatePrizes(m), rank = m.joinedRanks?.[p]
          if (rank === 1) cum += prizes[1]
          else if (rank === 2 && prizes.winnerCount === 2) cum += prizes[2]
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
  const poolData = { labels, datasets: [{ label:'Pool (₹)', data: matches.map(m=>m.pool), backgroundColor: matches.map(m=>m.pool>0?'rgba(245,166,35,0.5)':'rgba(100,100,100,0.3)'), borderColor: matches.map(m=>m.pool>0?'#f5a623':'#555'), borderWidth:1 }] }
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

  // Initial load
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
