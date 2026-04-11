
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import ReactDOM from 'react-dom'
import AdminLogin from './AdminLogin'
import AdminPage  from './AdminPage'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, RadialLinearScale, Title, Tooltip, Legend, Filler } from 'chart.js'
import { Line, Bar, Doughnut, PolarArea } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, RadialLinearScale, Title, Tooltip, Legend, Filler)

// ─── CONSTANTS  ────────────────────────────────────────────────
const PLAYERS = ['Ashish','Kalpesh','Nilesh','Prabhat','Pritam','Sudhir','Swapnil']
const COLORS  = ['#f5a623','#3498db','#2ecc71','#e74c3c','#e056fd','#00cec9','#fd9644']
const PLAYER_IMAGES = { Ashish:'/vois-panthers/ashish.jpg', Kalpesh:'/vois-panthers/kalpesh.jpg', Nilesh:'/vois-panthers/nilesh.jpeg', Prabhat:'/vois-panthers/prabhat.jpg', Pritam:'/vois-panthers/pritam.jpeg', Sudhir:'/vois-panthers/sudhir.jpg', Swapnil:'/vois-panthers/swapnil.jpg' }
const JSONBIN_BASE   = 'https://api.jsonbin.io/v3/b'
const HARDCODED_BIN_ID = '69c84b985fdde574550bf9f7'
const DAILY_LIMIT    = 20
const COOLDOWN_MS    = 30000
const ROWS_PER_PAGE  = 7

// ─── PURE LOGIC ‐----------
function generateBreakingNews(matches, stats) {
  const completed = matches.filter(m => m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—');
  if (completed.length === 0) return ["WELCOME TO IPL 2026: MARKET OPEN. AWAITING FIRST MATCH RESULTS..."];

  const lastM = completed[completed.length - 1];
  const timeStamp = `${formatDate(lastM.date)} ${formatMatchTimeLabel(lastM.matchTime)}`;
  let headlines = [];

  // --- 1. LEADERBOARD & GLOBAL RECORDS ---
  const currentProfits = PLAYERS.map(p => ({ name: p, profit: stats[p].totalWon - stats[p].totalInvested }));
  const sortedProfits = [...currentProfits].sort((a, b) => b.profit - a.profit);
  const currentLeader = sortedProfits[0];
  const maxBestPts = Math.max(...PLAYERS.map(p => stats[p].bestPoints));
  const seasonPointKing = PLAYERS.find(p => stats[p].bestPoints === maxBestPts);

  if (currentLeader.profit > 0) {
    headlines.push(`👑 LEADERBOARD ALPHA (${timeStamp}): ${currentLeader.name.toUpperCase()} hits a season high profit of ₹${currentLeader.profit.toFixed(0)}!`);
  }
  headlines.push(`🏆 SEASON ELITE (${timeStamp}): ${seasonPointKing.toUpperCase()} holds the highest score of the season (${maxBestPts} pts)!`);

  // --- 2. INDIVIDUAL PERFORMANCE & MARKET DATA ---
  PLAYERS.forEach(p => {
    const s = stats[p];
    const pd = lastM.players[p];
    const streak = s.paidWinStreak || [];
    const len = streak.length;
    const profit = s.totalWon - s.totalInvested;
    const roi = s.totalInvested > 0 ? ((s.totalWon - s.totalInvested) / s.totalInvested * 100) : 0;

    // Trigger: Broken Average Points
    const avg = s.pointsMatchCount > 1 ? (s.totalPointsSum / s.pointsMatchCount) : 0;
    if (pd?.points > avg && avg > 0) {
      headlines.push(`📈 STAT BURST (${timeStamp}): ${p.toUpperCase()} smashed their season average of ${avg.toFixed(1)} by scoring ${pd.points} pts!`);
    }

    // Trigger: Broken Personal ATH Points
    if (pd?.points === s.bestPoints && s.matchesPlayed > 1) {
      headlines.push(`🎯 PERSONAL RECORD (${timeStamp}): ${p.toUpperCase()} just hit their personal best of ${pd.points} points!`);
    }

    // Trigger: Winning Streaks (2 and 3 in a row) [cite: 53-54]
    if (len >= 2 && streak[len-1] && streak[len-2]) {
      const count = (len >= 3 && streak[len-3]) ? "3" : "2";
      headlines.push(`🔥 HOT STREAK (${timeStamp}): ${p.toUpperCase()} has won ${count} matches in a row!`);
    }

    // Trigger: Broken 3+ Loss Streak
    if (streak[len-1] === true) {
      let losses = 0;
      for (let i = len - 2; i >= 0; i--) { if (streak[i] === false) losses++; else break; }
      if (losses >= 3) {
        headlines.push(`🌅 THE RECOVERY (${timeStamp}): ${p.toUpperCase()} finally breaks a ${losses}-match losing streak!`);
      }
    }

    // Trigger: Index ATH / ATL [cite: 43-44]
    if (s.currentIndex >= s.indexATH && s.currentIndex > 100) {
      headlines.push(`🚀 BULL MARKET (${timeStamp}): ${p.toUpperCase()} Index has soared to an ALL-TIME HIGH of ₹${s.currentIndex.toFixed(0)}!`);
    }
    if (s.currentIndex <= s.indexATL && s.currentIndex < 100) {
      headlines.push(`📉 BEAR TRAP (${timeStamp}): ${p.toUpperCase()} Index has slumped to an All-Time Low of ₹${s.currentIndex.toFixed(0)}.`);
    }

    // --- NEW SUGGESTED HEADLINES ---
    // Trigger: High ROI 
    if (roi > 50) {
      headlines.push(`🚀 VENTURE CAPITALIST (${timeStamp}): ${p.toUpperCase()} is delivering a staggering ${roi.toFixed(0)}% ROI!`);
    }
    
    // Trigger: Debt Clearance (Coming out of negative PnL)
    const prevPnL = s.lastMatchPnL || 0;
    if (prevPnL < 0 && profit >= 0) {
      headlines.push(`💸 DEBT FREE (${timeStamp}): ${p.toUpperCase()} has cleared all losses and is officially back in the Green!`);
    }

    // Trigger: Most Expensive Asset (Portfolio Value)
    const maxWon = Math.max(...PLAYERS.map(pl => stats[pl].totalWon));
    if (s.totalWon === maxWon && maxWon > 0) {
      headlines.push(`💎 BLUE CHIP ASSET (${timeStamp}): ${p.toUpperCase()} is the league's most valued player with ₹${s.totalWon.toFixed(0)} in total winnings!`);
    }

    // Trigger: Consistency Guard (Win Rate) 
    const winPct = s.paidContests > 0 ? (s.wins / s.paidContests) : 0;
    if (winPct > 0.5 && s.paidContests >= 3) {
      headlines.push(`🛡️ IRON GUARD (${timeStamp}): ${p.toUpperCase()} maintains a deadly ${(winPct * 100).toFixed(0)}% win rate!`);
    }
  });

  // --- 3. RANDOMIZATION (THE SHUFFLE) [cite: 14-15] ---
  for (let i = headlines.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [headlines[i], headlines[j]] = [headlines[j], headlines[i]];
  }

  return headlines;
}

function computeH2H(matches, p1, p2) {
  let stats = {
    commonMatches: 0,
    p1Wins: 0, p2Wins: 0,
    p1Points: 0, p2Points: 0,
    p1Invested: 0, p2Invested: 0,
    p1Won: 0, p2Won: 0
  };

  matches.forEach(m => {
    const pd1 = m.players[p1];
    const pd2 = m.players[p2];
    
    // 1. Check if match is COMPLETED
    const isMatchDone = m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—';
    
    // 2. Check if BOTH players Joined, Paid, and have points > 0
    const p1Valid = pd1?.joined && pd1?.paid && (pd1?.points > 0);
    const p2Valid = pd2?.joined && pd2?.paid && (pd2?.points > 0);

    // Only process if all conditions are met for a "Completed Contest"
    if (isMatchDone && m.contest === 'yes' && p1Valid && p2Valid) {
      stats.commonMatches++;
      stats.p1Invested += m.fee;
      stats.p2Invested += m.fee;
      stats.p1Points += pd1.points;
      stats.p2Points += pd2.points;
      
      const prizes = calculatePrizes(m);
      const ranks = prizes._paidRanks || {};
      
      // Calculate Winnings for ROI
      if (ranks[p1] === 1) stats.p1Won += prizes[1];
      else if (ranks[p1] === 2 && prizes.winnerCountLimit === 2) stats.p1Won += prizes[2];
      
      if (ranks[p2] === 1) stats.p2Won += prizes[1];
      else if (ranks[p2] === 2 && prizes.winnerCountLimit === 2) stats.p2Won += prizes[2];

      // Direct Head-to-Head: Who had the better score?
      if (pd1.points > pd2.points) stats.p1Wins++;
      else if (pd2.points > pd1.points) stats.p2Wins++;
    }
  });

  return stats;
}

function calculatePrizes(m) {
  const paidCount = PLAYERS.filter(p => m.players[p]?.joined && m.players[p]?.paid).length
  const fee = parseFloat(m.fee) || 0
  const matchNum = parseInt(m.matchno) || 0

  let pot1 = 0, pot2 = 0, winnerCountLimit = 0
  if (matchNum >= 3) {
    if (paidCount >= 2 && paidCount <= 5) { pot1 = fee * paidCount; winnerCountLimit = 1 }
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
    winnerCount: winnerCountLimit,
    winnerCountLimit,
    totalPool: pot1 + pot2,
    _paidRanks: paidRanks,
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

// ✅ SYNCED FROM ADMIN + Feature 4: Hat-Trick detection added
function computePlayerStats(matches) {
  let stats = {}
  PLAYERS.forEach(p => {
    stats[p] = {
      matchesPlayed: 0, contested: 0, paidContests: 0, wins: 0,
      totalInvested: 0, totalWon: 0, bestPoints: 0, carryFwd: 0,
      totalPointsSum: 0, pointsMatchCount: 0, recentForm: [],
      activeDeposits: 0,
      paidWinStreak: [],    // track consecutive paid match wins for hat-trick
      hasHatTrick: false,   // Feature 4: hat-trick flag
      ath: 0,
      atl: 0,
      pnlHistory: [], // To store PnL after every match
      prevIndexSnapshot: 100, // Initialize at listing price
      currentIndex: 100,    // Current Sentiment Index
      indexATH: 100,        // NEW: All-time high index
      indexATL: null,         // NEW: All-time low index
      winsRank1: 0, // NEW: Track 1st ranks
      winsRank2: 0 // NEW: Track 2nd ranks
    }
  })
  let cf = {}; PLAYERS.forEach(p => { cf[p] = 0 })

  matches.forEach(m => {
    const matchIsComplete = m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—'
    const prizes = calculatePrizes(m)

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

    PLAYERS.forEach(p => {      
      const pd = m.players[p]
      if (!pd || !pd.joined) return
      const s = stats[p]

      if (!matchIsComplete) {
        if (m.contest === 'yes' && pd.paid) {
          s.activeDeposits += m.fee
        }
        return
      }

      const pts = pd.points || 0;
      const prevIndex = s.currentIndex;
      // Save this specifically to calculate the "Day Change" in the Ticker
      s.prevIndexSnapshot = prevIndex;

      let newIndexBase = (pts * 0.4) + (prevIndex * 0.6);
      // 4. FORM-BASED MULTIPLIERS (Confidence Kickers)
      const pRank = paidRanks[p] || 0; // Assuming paidRanks is calculated earlier in the loop 
      let multiplier = 1.0;
    
      if (pRank === 1) multiplier = 1.20;      // +20% for 1st Rank
      else if (pRank === 2) multiplier = 1.10; // +10% for 2nd Rank
      else if (pRank === 3) multiplier = 1.05; // +5% for 3rd Rank
      else if (pRank === 4 || pRank === 5) multiplier = 1.00; // Neutral
      else if (pRank === 6) multiplier = 0.95; // -5% for 6th Rank
      else if (pRank === 7) multiplier = 0.90; // -10% for 7th Rank
    
      // Apply the multiplier to the base index
      s.currentIndex = newIndexBase * multiplier;

      
      //s.currentIndex = (pts * 0.7) + (prevIndex * 0.3); // Existing calculation

      const currentPnL = s.totalWon - s.totalInvested;
      
      // Save this snapshot to history
      s.pnlHistory.push(currentPnL);

      // Check if this is the highest they've ever been (ATH)
      if (currentPnL > s.ath) s.ath = currentPnL;

      // Check if this is the lowest they've ever been (ATL)
      if (currentPnL < s.atl) s.atl = currentPnL;

      // ADD THESE TWO LINES HERE:
      if (s.currentIndex > s.indexATH) s.indexATH = s.currentIndex;
      if (s.indexATL === null || s.currentIndex < s.indexATL) s.indexATL = s.currentIndex;

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

            // Store current as "last" before we move to the next iteration
            s.lastMatchPnL = s.pnlHistory.length > 0 ? s.pnlHistory[s.pnlHistory.length - 1] : 0;
            
            const currentPnL = s.totalWon - s.totalInvested;
            s.pnlHistory.push(currentPnL);
            if (currentPnL > s.ath) s.ath = currentPnL;
            if (currentPnL < s.atl) s.atl = currentPnL;

            if (isR1Win || isR2Win) {
              s.wins++
              if (isR1Win) s.winsRank1++; // Increment Gold
              if (isR2Win) s.winsRank2++; // Increment Silver
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
              // Feature 4: track paid wins for hat-trick
              s.paidWinStreak.push(true)
            } else {
              s.recentForm.push('loss')
              // Feature 4: any paid loss breaks streak reset tracking
              s.paidWinStreak.push(false)
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
    // Feature 4: Check for 3 consecutive paid wins anywhere in history
    const streak = stats[p].paidWinStreak
    for (let i = 0; i <= streak.length - 3; i++) {
      if (streak[i] && streak[i+1] && streak[i+2]) {
        stats[p].hasHatTrick = true
        break
      }
    }
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
    if (profit >= 0)                                                    badges[p].push({ icon:'💵', label:'Profitable Investor', cls:'badge-scholar' })
    // Feature 4: Hat-Trick Wins badge
    if (s.hasHatTrick)                                                  badges[p].push({ icon:'🎩', label:'Hat-Trick Hero',  cls:'badge-hattrick' })
  })
  return badges
}

// ─── CHART OPTIONS — theme-aware ──────────────────────────
function chartOpts(unit, isDark = true) {
  const gridColor  = isDark ? '#1e2d5044' : 'rgba(100,140,220,0.12)'
  const tickColor  = isDark ? '#8899bb'   : '#5565a0'
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: tickColor, font:{ family:'Rajdhani', size:12 } } },
      tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${unit}${ctx.parsed.y ?? ctx.parsed}` } }
    },
    scales: {
      x: { ticks:{ color:tickColor, font:{ family:'Rajdhani', size:11 } }, grid:{ color:gridColor } },
      y: { ticks:{ color:tickColor, font:{ family:'Rajdhani', size:11 }, callback: v => `${unit}${v}` }, grid:{ color:gridColor } }
    }
  }
}

// ─── MATCH LOG COMPONENT ──────────────────────────────────────
function MatchLog({ matches }) {
  const nextUpcoming = useMemo(() => findNextUpcomingMatch(matches), [matches])
  const finished = useMemo(() => matches.filter(m => m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—'), [matches])

  const totalPool = useMemo(() => finished.reduce((s, m) => s + (calculatePrizes(m).totalPool || 0), 0), [finished])
  const totalContests = useMemo(() => finished.filter(m => m.contest === 'yes').length, [finished])

  // Feature 2: Payouts Pending count
  const { totalTransferred, totalPending } = useMemo(() => {
    let done = 0, pending = 0
    finished.forEach(m => {
      if (m.contest !== 'yes') return
      const prizes = calculatePrizes(m)
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
      eligiblePaid.forEach(p => {
        const r = paidRanks[p.name]
        const isWinner = r === 1 || (r === 2 && prizes.winnerCountLimit === 2)
        if (!isWinner) return
        const isDone = (m.transferred && typeof m.transferred === 'object')
          ? m.transferred[p.name] === true
          : m.transferred === true
        const isPending = (m.transferred && typeof m.transferred === 'object')
          ? m.transferred[p.name] === 'Pending' || m.transferred[p.name] === false || m.transferred[p.name] === undefined
          : m.transferred === false || m.transferred === 'Pending'
        if (isDone) done++
        else if (isPending && m.transferred !== null && m.transferred !== undefined && m.transferred !== '') pending++
      })
    })
    return { totalTransferred: done, totalPending: pending }
  }, [finished])

  const [showLiveScore, setShowLiveScore] = useState(false)
  const [liveMatch, setLiveMatch] = useState(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [selectedMatch, setSelectedMatch] = useState(null)

  // Feature 1: Pagination — always start on page that has the latest match
  const totalPages = Math.ceil(matches.length / ROWS_PER_PAGE)
  const [currentPage, setCurrentPage] = useState(() => totalPages || 1)

  // When matches load/change, jump to last page (which has latest records)
  useEffect(() => {
    const pages = Math.ceil(matches.length / ROWS_PER_PAGE)
    setCurrentPage(pages || 1)
  }, [matches.length])

  const paginatedMatches = useMemo(() => {
    const start = (currentPage - 1) * ROWS_PER_PAGE
    return matches.slice(start, start + ROWS_PER_PAGE)
  }, [matches, currentPage])

  /*
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
  } */

  /*
  useEffect(() => {
    if (showLiveScore) {
      fetchIPLScore()
      const interval = setInterval(fetchIPLScore, 180000)
      return () => clearInterval(interval)
    }
  }, [showLiveScore]) */

  return (
    <div className="section">
      <div className="sec-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Match Log</span>
        {  /* <button
          onClick={() => setShowLiveScore(!showLiveScore)}
          className={`btn-sm ${showLiveScore ? 'btn-danger' : 'btn-success'}`}
          style={{ padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }}
        >
          {showLiveScore ? '🛑 Hide Live Score' : '📡 Show Live Score'}
        </button>*/}
      </div>

      {/*
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
      )} */}

      {/* Totals bar — Feature 2: added Payouts Pending chip */}
      <div className="totals-bar">
        <div className="total-chip"><div className="total-chip-label">Total Matches</div><div className="total-chip-val">{matches.length}</div></div>
        <div className="total-chip"><div className="total-chip-label">Contests Played</div><div className="total-chip-val">{totalContests}</div></div>
        <div className="total-chip"><div className="total-chip-label">Total Pool</div><div className="total-chip-val">₹{totalPool.toFixed(0)}</div></div>
        <div className="total-chip"><div className="total-chip-label">Payouts Done</div><div className="total-chip-val">{totalTransferred}</div></div>
        {totalPending > 0 && (
          <div className="total-chip" style={{borderColor:'rgba(231,76,60,0.4)',background:'rgba(231,76,60,0.06)'}}>
            <div className="total-chip-label" style={{color:'#e74c3c'}}>⏳ Payouts Pending</div>
            <div className="total-chip-val" style={{color:'#e74c3c'}}>{totalPending}</div>
          </div>
        )}
      </div>

      {/* Feature 1: Pagination controls (top) */}
      {totalPages > 1 && (
        <div style={paginationStyle.wrap}>
          <span style={paginationStyle.info}>
            Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
            &nbsp;·&nbsp; Matches {(currentPage-1)*ROWS_PER_PAGE+1}–{Math.min(currentPage*ROWS_PER_PAGE, matches.length)} of {matches.length}
          </span>
          <div style={paginationStyle.btnGroup}>
            <button style={paginationStyle.btn} disabled={currentPage===1} onClick={() => setCurrentPage(1)}>«</button>
            <button style={paginationStyle.btn} disabled={currentPage===1} onClick={() => setCurrentPage(p => p-1)}>‹ Prev</button>
            {Array.from({length: totalPages}, (_, i) => i+1).map(pg => (
              <button
                key={pg}
                style={{...paginationStyle.btn, ...(pg===currentPage ? paginationStyle.btnActive : {})}}
                onClick={() => setCurrentPage(pg)}
              >{pg}</button>
            ))}
            <button style={paginationStyle.btn} disabled={currentPage===totalPages} onClick={() => setCurrentPage(p => p+1)}>Next ›</button>
            <button style={paginationStyle.btn} disabled={currentPage===totalPages} onClick={() => setCurrentPage(totalPages)}>»</button>
          </div>
        </div>
      )}

      {/* Sticky thead is handled by CSS on .table-wrap + thead */}
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
            {paginatedMatches.length === 0 ? (
              <tr><td colSpan={13 + PLAYERS.length} className="no-data">No match data available yet.</td></tr>
            ) : paginatedMatches.map((m, idx) => {
              const done = m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—'
              const prizes = calculatePrizes(m)
              const isNext = nextUpcoming && nextUpcoming.matchno === m.matchno
              const matchStartTime = getMatchDateTime(m)
              const hasStarted = matchStartTime ? (new Date() > matchStartTime) : done

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
                  const split1 = prizes[1]
                  r1Paid.forEach(p => winnersInfo.push({ name: p.name, rank: 1, prize: split1 }))
                }
                if (prizes.winnerCountLimit === 2 && r2Paid.length > 0) {
                  const split2 = prizes[2]
                  r2Paid.forEach(p => winnersInfo.push({ name: p.name, rank: 2, prize: split2 }))
                }
              }

              return (
                <tr key={idx} className={done ? 'clickable-match-row' : ''} onClick={() => done && setSelectedMatch(m)} title={done ? 'Click to view full match result' : ''}>
                  <td><span className="match-no-badge">#{m.matchno}</span></td>
                  <td style={{fontSize:11}}>{formatDate(m.date)}</td>
                  <td><span className="team-tag">{m.teams}</span></td>
                  <td style={{fontSize:11,fontWeight:700}}>{m.teamwon || '—'}</td>
                  <td style={{minWidth:120}}><CountdownCell match={m} isNextUpcoming={isNext} /></td>
                  <td>{m.contest === 'yes' ? <span className="won-badge">YES</span> : <span className="lost-badge">NO</span>}</td>
                  <td style={{fontSize:11}}>{m.contest === 'yes' ? `${m.joinedCount}/${PLAYERS.length}` : '—'}</td>
                  <td style={{fontSize:11}}>₹{m.fee}</td>
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

      {/* Feature 1: Pagination controls (bottom) */}
      {totalPages > 1 && (
        <div style={{...paginationStyle.wrap, marginTop:12, marginBottom:4}}>
          <span style={paginationStyle.info}>
            Showing page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
          </span>
          <div style={paginationStyle.btnGroup}>
            <button style={paginationStyle.btn} disabled={currentPage===1} onClick={() => setCurrentPage(1)}>« First</button>
            <button style={paginationStyle.btn} disabled={currentPage===1} onClick={() => setCurrentPage(p => p-1)}>‹ Prev</button>
            <button style={paginationStyle.btn} disabled={currentPage===totalPages} onClick={() => setCurrentPage(p => p+1)}>Next ›</button>
            <button style={paginationStyle.btn} disabled={currentPage===totalPages} onClick={() => setCurrentPage(totalPages)}>Last »</button>
          </div>
        </div>
      )}

      {/* Click tip */}
      <div style={{textAlign:'center',fontSize:10,color:'#8899bb',marginTop:8,letterSpacing:1,opacity:0.7}}>
        💡 Tap any completed match row to view full detailed result
      </div>
      {selectedMatch && (
        <MatchDetailModal match={selectedMatch} onClose={() => setSelectedMatch(null)} />
      )}
    </div>
  )
}

// Pagination styles
const paginationStyle = {
  wrap: {
    display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'space-between',
    gap:8, marginBottom:10, padding:'8px 12px',
    background:'rgba(255,255,255,0.03)', borderRadius:10, border:'1px solid rgba(255,255,255,0.07)'
  },
  info: { fontSize:12, color:'#8899bb', fontFamily:"'Rajdhani',sans-serif", letterSpacing:0.5 },
  btnGroup: { display:'flex', gap:5, flexWrap:'wrap' },
  btn: {
    fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:12,
    padding:'5px 11px', borderRadius:7, cursor:'pointer', border:'1px solid rgba(255,255,255,0.12)',
    background:'rgba(255,255,255,0.05)', color:'#8899bb', transition:'all 0.15s',
  },
  btnActive: {
    background:'rgba(245,166,35,0.2)', borderColor:'rgba(245,166,35,0.5)', color:'#f5a623',
  }
}


// ─── PLAYER STATS ─────────────────────────────────────────────
function H2HModal({ p1, p2, matches, onClose }) {
  const data = useMemo(() => computeH2H(matches, p1, p2), [p1, p2, matches]);
  const getROI = (won, inv) => inv > 0 ? ((won - inv) / inv * 100).toFixed(1) : '0';
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="h2h-content" onClick={e => e.stopPropagation()}>
        <div className="h2h-header">
          <div className="h2h-player">
            <img src={PLAYER_IMAGES[p1]} alt={p1} className="h2h-img" style={{borderColor: COLORS[PLAYERS.indexOf(p1)]}} />
            <h3 style={{fontFamily:'Bebas Neue', letterSpacing:2}}>{p1}</h3>
          </div>
          <div className="h2h-vs">VS</div>
          <div className="h2h-player">
            <img src={PLAYER_IMAGES[p2]} alt={p2} className="h2h-img" style={{borderColor: COLORS[PLAYERS.indexOf(p2)]}} />
            <h3 style={{fontFamily:'Bebas Neue', letterSpacing:2}}>{p2}</h3>
          </div>
        </div>
        <div className="h2h-body">
          <div className="h2h-stat-title" style={{textAlign:'center', color:'var(--accent)', fontSize:12, marginBottom:15}}>COMMON CONTESTS: {data.commonMatches}</div>
          {[
            ['Direct Wins', data.p1Wins, data.p2Wins],
            ['Avg Points', (data.p1Points/data.commonMatches || 0).toFixed(1), (data.p2Points/data.commonMatches || 0).toFixed(1)],
            ['Total Won', `₹${data.p1Won.toFixed(0)}`, `₹${data.p2Won.toFixed(0)}`],
            ['ROI %', `${getROI(data.p1Won, data.p1Invested)}%`, `${getROI(data.p2Won, data.p2Invested)}%`]
          ].map(([label, v1, v2]) => (
            <div className="h2h-row" key={label}>
              <div className={`h2h-val ${parseFloat(v1) > parseFloat(v2) ? 'win' : ''}`}>{v1}</div>
              <div className="h2h-label">{label}</div>
              <div className={`h2h-val ${parseFloat(v2) > parseFloat(v1) ? 'win' : ''}`}>{v2}</div>
            </div>
          ))}
        </div>
        <button className="h2h-close" onClick={onClose}>CLOSE RIVALRY</button>
      </div>
    </div>
  );
}


function PlayerStats({ matches, h2hPlayers, setH2hPlayers }) {
  const stats = useMemo(() => computePlayerStats(matches), [matches])
  const hofBadges = useMemo(() => computeHoFBadges(stats), [stats])
  return (
    <div className="section">
      <div className="sec-title">Player Stats</div>

      <div style={{
          background: 'rgba(245, 166, 35, 0.1)', 
          border: '1px dashed var(--accent)', 
          padding: '10px', 
          borderRadius: '8px', 
          marginBottom: '15px', 
          fontSize: '13px', 
          color: 'var(--accent)',
          textAlign: 'center'
        }}>
          {h2hPlayers.p1 
            ? <span>⚔️ <b>{h2hPlayers.p1}</b> selected. Now click another player to start the <b>Versus Battle</b>!</span>
            : <span>💡 <b>Pro Tip:</b> Click any player's photo to compare them Head-to-Head with another!</span>
          }
      </div>
      
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
                {/*<div className="p-avatar" style={avatarStyle}>{p[0]}</div>*/}
                <div 
                  className="p-avatar" 
                  title={!h2hPlayers.p1 ? "Click to select Player 1 for Comparison" : `Click to compare ${h2hPlayers.p1} with ${p}`}
                  style={{
                    ...avatarStyle, 
                    cursor: 'pointer',
                    position: 'relative',
                    // Glow effect for selected players
                    borderWidth: (h2hPlayers.p1 === p || h2hPlayers.p2 === p) ? '4px' : '2px',
                    boxShadow: (h2hPlayers.p1 === p || h2hPlayers.p2 === p) ? `0 0 20px ${COLORS[i]}` : 'none',
                    transform: (h2hPlayers.p1 === p || h2hPlayers.p2 === p) ? 'scale(1.15)' : 'scale(1)',
                    transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                  }} 
                  onClick={() => {
                    if (!h2hPlayers.p1) {
                      setH2hPlayers({ ...h2hPlayers, p1: p });
                    } else if (h2hPlayers.p1 === p) {
                      // De-select if clicking the same person
                      setH2hPlayers({ ...h2hPlayers, p1: null });
                    } else {
                      setH2hPlayers({ ...h2hPlayers, p2: p });
                    }
                  }}
                >
                  {p[0]}
                  {/* Small "Selected" Badge */}
                  {h2hPlayers.p1 === p && <div style={{position:'absolute', bottom:-5, right:-5, background:'var(--accent)', color:'#000', borderRadius:'50%', width:18, height:18, fontSize:10, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, border:'2px solid var(--card)'}}>1</div>}
                </div>
                
                <div style={{flex:1}}>
                  <div className="p-name">{p}</div>
                  <div className="p-winpct">Win Rate: <span>{winpct}%</span> ({s.wins}/{s.paidContests} paid)</div>

                   {/* NEW: Rank Breakdown Display */}
                  <div style={{ display: 'flex', gap: '12px', marginTop: '4px', marginBottom: '4px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text)' }}>
                      🥇 1st: <span style={{ color: '#FFD700', fontWeight: 'bold' }}>{s.winsRank1}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text)' }}>
                      🥈 2nd: <span style={{ color: '#C0C0C0', fontWeight: 'bold' }}>{s.winsRank2}</span>
                    </div>
                  </div>
                 
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
          ['💵','Profitable Investor','Has Green Portfolio this season with winning amount exceeding the investment amount.'],
          ['🎩','Hat-Trick Hero','Won 3 consecutive paid matches in a row. A rare feat of sustained dominance and nerves of steel!'],
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
@keyframes pdBounce1  {0%,100%{transform:translateY(0) rotate(0deg)}30%{transform:translateY(-20px) rotate(-5deg)}65%{transform:translateY(-10px) rotate(4deg)}}
@keyframes pdBounce2  {0%,100%{transform:translateY(0) rotate(0deg)}35%{transform:translateY(-14px) rotate(-4deg)}70%{transform:translateY(-7px) rotate(3deg)}}
@keyframes pdBounce3  {0%,100%{transform:translateY(0)}40%{transform:translateY(-9px) rotate(-2deg)}75%{transform:translateY(-5px) rotate(2deg)}}
@keyframes pdArmL1    {0%,100%{transform:rotate(-15deg)}50%{transform:rotate(55deg)}}
@keyframes pdArmR1    {0%,100%{transform:rotate(15deg)}50%{transform:rotate(-55deg)}}
@keyframes pdArmL2    {0%,100%{transform:rotate(-12deg)}50%{transform:rotate(40deg)}}
@keyframes pdArmR2    {0%,100%{transform:rotate(12deg)}50%{transform:rotate(-40deg)}}
@keyframes pdArmL3    {0%,100%{transform:rotate(-8deg)}50%{transform:rotate(25deg)}}
@keyframes pdArmR3    {0%,100%{transform:rotate(8deg)}50%{transform:rotate(-25deg)}}
@keyframes pdMedalSwing {0%,100%{transform:rotate(-18deg)}50%{transform:rotate(18deg)}}
@keyframes pdCrown    {0%,100%{transform:translateY(0) rotate(-6deg) scale(1)}50%{transform:translateY(-9px) rotate(6deg) scale(1.12)}}
@keyframes pdSparkle  {0%,100%{opacity:0;transform:scale(0.4) rotate(0deg)}50%{opacity:1;transform:scale(1.3) rotate(180deg)}}
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
.pd-slot{display:flex;flex-direction:column;align-items:center;}
.pd-crown{font-size:26px;margin-bottom:3px;animation:pdCrown 1.8s ease-in-out infinite;filter:drop-shadow(0 0 8px #FFD700);}
.pd-char{display:flex;flex-direction:column;align-items:center;position:relative;}
.pd-slot.pr1 .pd-char{animation:pdBounce1 1.1s ease-in-out infinite;}
.pd-slot.pr2 .pd-char{animation:pdBounce2 1.4s ease-in-out infinite;}
.pd-slot.pr3 .pd-char{animation:pdBounce3 1.8s ease-in-out infinite;}
.pd-arm-wrap{position:relative;width:0;height:0;}
.pd-arm{position:absolute;height:7px;border-radius:4px;}
.pd-slot.pr1 .pd-arm.left {width:20px;left:-36px;top:22px;transform-origin:right center;animation:pdArmL1 1.1s ease-in-out infinite;}
.pd-slot.pr1 .pd-arm.right{width:20px;right:-36px;top:22px;transform-origin:left center;animation:pdArmR1 1.1s ease-in-out infinite;}
.pd-slot.pr2 .pd-arm.left {width:17px;left:-31px;top:19px;transform-origin:right center;animation:pdArmL2 1.4s ease-in-out infinite;}
.pd-slot.pr2 .pd-arm.right{width:17px;right:-31px;top:19px;transform-origin:left center;animation:pdArmR2 1.4s ease-in-out infinite;}
.pd-slot.pr3 .pd-arm.left {width:14px;left:-26px;top:17px;transform-origin:right center;animation:pdArmL3 1.8s ease-in-out infinite;}
.pd-slot.pr3 .pd-arm.right{width:14px;right:-26px;top:17px;transform-origin:left center;animation:pdArmR3 1.8s ease-in-out infinite;}
.pd-ring-wrap{position:relative;}
.pd-ring{border-radius:50%;overflow:hidden;border:4px solid;background:#1b2540;position:relative;}
.pd-slot.pr1 .pd-ring{width:88px;height:88px;border-color:#FFD700;animation:pdGoldGlow 2.2s ease-in-out infinite;}
.pd-slot.pr2 .pd-ring{width:74px;height:74px;border-color:#C0C0C0;animation:pdSilGlow  2.5s ease-in-out infinite;}
.pd-slot.pr3 .pd-ring{width:65px;height:65px;border-color:#CD7F32;animation:pdBrzGlow  2.8s ease-in-out infinite;}
.pd-ring img{width:100%;height:100%;object-fit:cover;object-position:center top;filter:saturate(1.25) contrast(1.08);}
.pd-ring-fallback{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:30px;}
.pd-ring-medal{position:absolute;bottom:-8px;right:-8px;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2.5px solid #05080f;}
.pd-slot.pr1 .pd-ring-medal{background:#FFD700;animation:pdMedalPop 0.5s cubic-bezier(.34,1.56,.64,1) 1s both;}
.pd-slot.pr2 .pd-ring-medal{background:#C0C0C0;animation:pdMedalPop 0.5s cubic-bezier(.34,1.56,.64,1) 1.2s both;}
.pd-slot.pr3 .pd-ring-medal{background:#CD7F32;animation:pdMedalPop 0.5s cubic-bezier(.34,1.56,.64,1) 1.4s both;}
.pd-jersey{border-radius:8px 8px 14px 14px;margin-top:-4px;display:flex;align-items:center;justify-content:center;position:relative;}
.pd-slot.pr1 .pd-jersey{width:56px;height:40px;}
.pd-slot.pr2 .pd-jersey{width:48px;height:34px;}
.pd-slot.pr3 .pd-jersey{width:42px;height:30px;}
.pd-hang-medal{display:flex;flex-direction:column;align-items:center;position:absolute;bottom:-14px;left:50%;transform:translateX(-50%);}
.pd-hang-string{width:1.5px;height:10px;background:rgba(255,255,255,0.35);}
.pd-hang-emoji{animation:pdMedalSwing 2s ease-in-out infinite;display:block;line-height:1;}
.pd-slot.pr1 .pd-hang-emoji{font-size:20px;}
.pd-slot.pr2 .pd-hang-emoji{font-size:17px;}
.pd-slot.pr3 .pd-hang-emoji{font-size:15px;}
.pd-name{font-family:'Bebas Neue',sans-serif;letter-spacing:2.5px;text-align:center;margin-top:20px;animation:pdFadeUp 0.5s 0.5s both;}
.pd-slot.pr1 .pd-name{font-size:19px;color:#FFD700;text-shadow:0 0 14px rgba(255,215,0,0.55);}
.pd-slot.pr2 .pd-name{font-size:16px;color:#C0C0C0;}
.pd-slot.pr3 .pd-name{font-size:15px;color:#CD7F32;}
.pd-prize{border-radius:20px;padding:4px 12px;font-size:12px;font-weight:800;white-space:nowrap;margin-top:4px;margin-bottom:3px;animation:pdFadeUp 0.5s 0.65s both;font-family:'Orbitron',sans-serif;}
.pd-profit-pos{background:rgba(46,204,113,0.14);border:1px solid rgba(46,204,113,0.45);color:#2ecc71;}
.pd-profit-neg{background:rgba(231,76,60,0.14);border:1px solid rgba(231,76,60,0.45);color:#e74c3c;}
.pd-wintag{font-size:10px;color:#8899bb;text-align:center;margin-bottom:8px;animation:pdFadeUp 0.5s 0.8s both;letter-spacing:0.5px;}
.pd-trophy-icon{font-size:22px;animation:pdTrophy 2.2s ease-in-out infinite;filter:drop-shadow(0 2px 6px rgba(245,166,35,0.5));}
.pd-slot.pr2 .pd-trophy-icon,.pd-slot.pr3 .pd-trophy-icon{font-size:16px;}
.pd-block{border-radius:10px 10px 0 0;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;}
.pd-slot.pr1 .pd-block{width:clamp(108px,16vw,130px);height:112px;background:linear-gradient(175deg,#ffe066 0%,#f5a623 45%,#8a5500 100%);animation:pdRiseUp 0.8s cubic-bezier(.22,1,.36,1) 0.05s both;}
.pd-slot.pr2 .pd-block{width:clamp(94px,14vw,114px);height:78px; background:linear-gradient(175deg,#e8e8e8 0%,#C0C0C0 45%,#666    100%);animation:pdRiseUp 0.8s cubic-bezier(.22,1,.36,1) 0.22s both;}
.pd-slot.pr3 .pd-block{width:clamp(84px,12vw,102px);height:54px; background:linear-gradient(175deg,#e8b07a 0%,#CD7F32 45%,#5a330e 100%);animation:pdRiseUp 0.8s cubic-bezier(.22,1,.36,1) 0.4s  both;}
.pd-block-num{font-family:'Bebas Neue',sans-serif;line-height:1;color:rgba(0,0,0,0.22);user-select:none;}
.pd-slot.pr1 .pd-block-num{font-size:72px;}
.pd-slot.pr2 .pd-block-num{font-size:56px;}
.pd-slot.pr3 .pd-block-num{font-size:44px;}
.pd-base{height:10px;background:linear-gradient(90deg,#f5a623,#2ecc71,#3498db,#e74c3c,#f5a623);background-size:400% 100%;border-radius:0 0 10px 10px;animation:pdShimmer 4s linear infinite;margin:0 6px 18px;opacity:0.5;position:relative;z-index:2;}
.pd-chips{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;animation:pdFadeUp 0.6s 1.1s both;position:relative;z-index:2;}
.pd-chip{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:8px 14px;text-align:center;min-width:88px;}
.pd-chip-lbl{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#8899bb;}
.pd-chip-name{font-family:'Bebas Neue',sans-serif;font-size:17px;letter-spacing:2px;margin-top:2px;}
.pd-chip-sub{font-size:10px;color:#8899bb;margin-top:2px;}

/* Feature 4: Hat-Trick badge style */
.badge-hattrick{background:linear-gradient(135deg,rgba(155,89,182,0.25),rgba(52,152,219,0.15));border-color:rgba(155,89,182,0.55) !important;color:#c39bd3 !important;}
`

const RANK_COLORS = { 1:'#FFD700', 2:'#C0C0C0', 3:'#CD7F32' }
const RANK_MEDALS = { 1:'🥇', 2:'🥈', 3:'🥉' }

function OlympicPodium({ sorted, sortBy }) {
  const top3 = sorted.slice(0, 3);

  // ── Hooks MUST come before any early return ──────────────
  useEffect(() => {
    if (top3.length < 1) return;
    if (!document.getElementById('podium-styles')) {
      const s = document.createElement('style');
      s.id = 'podium-styles';
      s.textContent = PODIUM_CSS;
      document.head.appendChild(s);
    }
    const wrap = document.getElementById('pd-confetti-inner');
    if (wrap && wrap.children.length === 0) {
      const colors = ['#f5a623','#2ecc71','#3498db','#e74c3c','#9b59b6','#C0C0C0','#FFD700','#1abc9c','#e67e22','#fff'];
      for (let i = 0; i < 40; i++) {
        const d = document.createElement('div');
        d.className = 'pd-dot';
        const sz = 4 + Math.random() * 6;
        d.style.cssText = `left:${Math.random()*100}%;top:-14px;width:${sz}px;height:${sz}px;background:${colors[i%colors.length]};animation-duration:${3+Math.random()*3.5}s;animation-delay:${Math.random()*6}s;border-radius:${Math.random()>0.5?'50%':'2px'};`;
        wrap.appendChild(d);
      }
    }
  }, [top3.length]);

  // 2. DYNAMIC LABEL GENERATOR — early return AFTER hooks
  if (top3.length < 1) return null;

  const getDynamicStat = (p) => {
    switch(sortBy) {
      case 'winPct': return `${p.winPct.toFixed(1)}% Win`;
      case 'totalWon': return `₹${p.totalWon.toFixed(0)} Won`;
      case 'avgPoints': return `${p.avgPoints.toFixed(1)} Pts`;
      case 'roi': return `${p.roi.toFixed(0)}% ROI`;
      default: 
        const profit = p.totalWon - p.totalInvested;
        return `${profit >= 0 ? '+' : '-'}₹${Math.abs(profit).toFixed(2)}`;
    }
  };

  const displayOrder = [top3[1], top3[0], top3[2]].filter(Boolean);
  const displayRanks = [2, 1, 3];
  const displayCls   = ['pr2','pr1','pr3'];

  return (
    <div className="pd-outer">
      <div className="pd-confetti-layer"><div id="pd-confetti-inner" /></div>
      
      {/* DYNAMIC TITLE BASED ON SORT */}
      <div className="pd-title">🏆 {sortBy === 'profit' ? 'PnL' : sortBy.toUpperCase()} LEADERS 🏆</div>
      <div className="pd-subtitle">VOIS Panthers · IPL 2026 · Current Top Warriors</div>
      
      <div className="pd-stage">
        {displayOrder.map((p, oi) => {
          if (!p) return null;
          const rank    = displayRanks[oi];
          const cls     = displayCls[oi];
          // Use the current sort value to determine color theme
          const isPos   = p[sortBy] >= 0; 
          const imgPath = PLAYER_IMAGES[p.name];

          return (
            <div className={`pd-slot ${cls}`} key={p.name}>
              {rank === 1 && <div className="pd-crown">👑</div>}
              <div className="pd-char">
                <div className="pd-arm-wrap">
                  <div className="pd-arm left"  style={{background: p.color+'cc'}} />
                  <div className="pd-arm right" style={{background: p.color+'cc'}} />
                </div>
                <div className="pd-ring-wrap">
                  <div className="pd-ring">
                    {imgPath
                      ? <img src={imgPath} alt={p.name} onError={e=>{e.target.style.display='none';e.target.nextSibling.style.display='flex'}} />
                      : null}
                    <div className="pd-ring-fallback" style={{display:imgPath?'none':'flex',background:p.color+'22',color:p.color}}>{p.name[0]}</div>
                  </div>
                  <div className="pd-ring-medal">{RANK_MEDALS[rank]}</div>
                </div>
                <div className="pd-jersey" style={{background:`linear-gradient(160deg,${p.color}dd,${p.color}88)`}}>
                  <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:rank===1?14:12,fontWeight:900,color:'#fff',opacity:0.9,letterSpacing:1}}>{p.name[0]}</span>
                </div>
              </div>
              
              <div className="pd-name">{p.name}</div>
              
              {/* DYNAMIC PRIZE BOX */}
              <div className={`pd-prize ${isPos ? 'pd-profit-pos' : 'pd-profit-neg'}`}>
                {getDynamicStat(p)}
              </div>

              <div className="pd-wintag">🏏 {p.wins} wins · {p.paidContests} paid</div>
              <div className="pd-trophy-icon">{rank===1?'🏆':rank===2?'🥈':'🥉'}</div>
              <div className="pd-block">
                <div className="pd-block-num">{rank}</div>
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="pd-base" />
      
      <div className="pd-chips">
        {top3.map((p, i) => {
          const mc = [RANK_COLORS[1], RANK_COLORS[2], RANK_COLORS[3]][i];
          return (
            <div className="pd-chip" key={p.name} style={{borderColor: mc+'44'}}>
              <div className="pd-chip-lbl" style={{color:mc}}>{['🥇 Gold','🥈 Silver','🥉 Bronze'][i]}</div>
              <div className="pd-chip-name" style={{color:mc}}>{p.name}</div>
              {/* SYNCED CHIP DATA */}
              <div className="pd-chip-sub">{getDynamicStat(p)}</div>
              <div className="pd-chip-sub">{p.wins}W · {p.paidContests} matches</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SPARKLINE SVG ────────────────────────────────────────
function Sparkline({ data, color, width = 60, height = 22 }) {
  if (!data || data.length < 2) return null
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return [parseFloat(x.toFixed(2)), parseFloat(y.toFixed(2))]
  })
  const pts = points.map(([x,y]) => `${x},${y}`).join(' ')
  const [lastX, lastY] = points[points.length - 1]
  return (
    <svg width={width} height={height} style={{display:'inline-block',verticalAlign:'middle',flexShrink:0}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
    </svg>
  )
}

// ─── COMPUTE STREAK FROM paidWinStreak ───────────────────
function computeCurrentStreak(paidWinStreak) {
  const arr = paidWinStreak || []
  if (!arr.length) return { type: null, count: 0 }
  const last = arr[arr.length - 1]
  let count = 0
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] === last) count++
    else break
  }
  return { type: last ? 'win' : 'loss', count }
}

// ─── LEADERBOARD ──────────────────────────────────────────
function Leaderboard({ matches }) {
  const [sortBy, setSortBy] = useState('profit')
  const stats = useMemo(() => computePlayerStats(matches), [matches])

  const sorted = useMemo(() => {
    return PLAYERS.map((p, i) => {
      const s = stats[p]
      const profit    = s.totalWon - s.totalInvested
      const winPct    = s.paidContests > 0 ? (s.wins / s.paidContests) * 100 : 0
      const avgPoints = s.pointsMatchCount > 0 ? (s.totalPointsSum / s.pointsMatchCount) : 0
      const roi       = s.totalInvested > 0 ? (profit / s.totalInvested) * 100 : 0
      const streak    = computeCurrentStreak(s.paidWinStreak)
      return { ...s, name:p, color:COLORS[i], profit, winPct, avgPoints, roi, streak }
    }).sort((a, b) => b[sortBy] - a[sortBy])
  }, [stats, sortBy])

  let _rank = 1, _lastVal = null
  const ranked = sorted.map(p => {
    const val = p[sortBy]
    if (_lastVal !== null && val < _lastVal) _rank++
    _lastVal = val
    return { ...p, rank: _rank }
  })

  const getDisplayData = (p) => {
    const getCC = (val) => val > 0 ? 'pos-bold' : val < 0 ? 'neg' : 'neu-grey'
    switch(sortBy) {
      case 'winPct':    return { val:`${p.winPct.toFixed(1)}%`,       label:'Accuracy',   cls:getCC(p.winPct) }
      case 'totalWon':  return { val:`₹${p.totalWon.toFixed(0)}`,     label:'Gross Won',  cls:getCC(p.totalWon) }
      case 'avgPoints': return { val:p.avgPoints.toFixed(1),           label:'Avg Points', cls:getCC(p.avgPoints) }
      case 'roi':       return { val:`${p.roi.toFixed(0)}%`,           label:'Efficiency', cls:getCC(p.roi) }
      default: {
        const profit = p.totalWon - p.totalInvested
        return { val:`${profit>0?'+':''}₹${profit.toFixed(0)}`, label:'Net PnL', cls:getCC(profit) }
      }
    }
  }

  const filterOptions = [
    { id:'profit',    label:'PnL',     icon:'💰' },
    { id:'winPct',    label:'Win %',   icon:'🎯' },
    { id:'totalWon',  label:'Won',     icon:'🏆' },
    { id:'avgPoints', label:'Avg Pts', icon:'📊' },
    { id:'roi',       label:'ROI',     icon:'📈' },
  ]

  // Season summary stats — safe against empty data
  const totalPool       = useMemo(() => matches.filter(m=>m.teamwon&&m.teamwon.trim()!==''&&m.teamwon!=='—').reduce((s,m)=>s+(calculatePrizes(m).totalPool||0),0), [matches])
  const totalMatches    = matches.filter(m=>m.teamwon&&m.teamwon.trim()!==''&&m.teamwon!=='—').length
  const topProfit       = ranked.length > 0 ? ranked.reduce((best,p) => p.profit > best ? p.profit : best, ranked[0].profit) : 0
  const topProfitPlayer = ranked.find(p=>p.profit===topProfit)
  const highScore       = PLAYERS.reduce((best,p) => stats[p].bestPoints > best ? stats[p].bestPoints : best, 0)
  const highScorePlayer = PLAYERS.find(p=>stats[p].bestPoints===highScore) || '—'

  return (
    <div className="section">
      <div className="sec-title" style={{paddingBottom:'20px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',width:'100%'}}>
          <span style={{fontSize:'24px',letterSpacing:'2px',fontFamily:'Bebas Neue'}}>LEADERBOARD</span>
          <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
            <span style={{fontSize:'9px',color:'var(--green)',fontWeight:800}}>LIVE</span>
            <div className="live-dot" style={{width:'6px',height:'6px'}}/>
          </div>
        </div>
        {/* Season Summary */}
        <div className="season-summary" style={{marginTop:16}}>
          {[
            { icon:'🏏', label:'Matches Played', val:totalMatches, sub:'completed' },
            { icon:'💰', label:'Total Pool',      val:`₹${totalPool}`, sub:'prize money' },
            { icon:'🏆', label:'Top Profit',      val: topProfit > 0 ? `+₹${topProfit.toFixed(0)}` : '₹0', sub:topProfitPlayer?.name||'—', accent:true },
            { icon:'🎯', label:'Season High',     val:`${highScore > 0 ? highScore : '—'} pts`, sub:highScorePlayer },
          ].map(s=>(
            <div key={s.label} className="ss-card" style={s.accent?{'--accent-tint':'rgba(46,204,113,0.08)'}:{}}>
              <span className="ss-icon">{s.icon}</span>
              <div className="ss-label">{s.label}</div>
              <div className="ss-val" style={s.accent?{color:'var(--green)'}:{}}>{s.val}</div>
              <div className="ss-sub">{s.sub}</div>
            </div>
          ))}
        </div>
        {/* Filter pills */}
        <div className="filter-grid-wrap">
          {filterOptions.map(f=>(
            <button key={f.id} onClick={()=>setSortBy(f.id)} className={`filter-pill ${sortBy===f.id?'active':''}`}>
              <span style={{fontSize:'16px'}}>{f.icon}</span>
              <span>{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      <OlympicPodium sorted={ranked} sortBy={sortBy} />

      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:14,letterSpacing:4,color:'var(--text2)',marginBottom:12,paddingLeft:4,marginTop:8}}>FULL STANDINGS</div>
      <div className="lb-grid" style={{marginTop:'12px'}}>
        {ranked.map((p) => {
          const rankIcon  = p.rank===1?'🥇':p.rank===2?'🥈':p.rank===3?'🥉':p.rank
          const display   = getDisplayData(p)
          const { type: strkType, count: strkCount } = p.streak
          const showStreak = strkCount >= 2
          // Mini sparkline from pnlHistory
          const sparkData  = (p.pnlHistory || []).slice(-8)

          return (
            <div key={p.name} className={`lb-card rank${p.rank <= 3 ? p.rank : ''}`}>
              <div className="lb-rank">{rankIcon}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                  <div className="lb-name" style={{color:p.color}}>{p.name}</div>
                  {/* Streak badge */}
                  {showStreak && (
                    <span className={`streak-badge ${strkType==='win'?'streak-win':'streak-loss'}`}>
                      {strkType==='win'?'🔥':'❄️'} {strkCount}{strkType==='win'?' WIN':' LOSS'} STREAK
                    </span>
                  )}
                  {/* Sparkline */}
                  {sparkData.length >= 2 && (
                    <Sparkline data={sparkData} color={p.color} width={52} height={20} />
                  )}
                </div>
                <div className="lb-stats">
                  <div className="lb-stat">
                    Wins: <span>{p.wins}</span>
                    <span style={{fontSize:'10px',color:'var(--text2)'}}> (🥇:{p.winsRank1} 🥈:{p.winsRank2})</span>
                  </div>
                  <div className="lb-stat">Paid: <span>{p.paidContests}</span></div>
                  <div className="lb-stat">Avg Pts: <span>{p.avgPoints.toFixed(1)}</span></div>
                  <div className="lb-stat">Invested: <span>₹{p.totalInvested}</span></div>
                  <div className="lb-stat">Total Won: <span style={{color:'var(--green)'}}>₹{p.totalWon.toFixed(0)}</span></div>
                  <div className="lb-stat">ROI: <span className={p.roi>=0?'pos-bold':'neg'}>{p.roi.toFixed(0)}%</span></div>
                  {p.activeDeposits > 0 && (
                    <div className="lb-stat">Active Deposit: <span className="active-amt">₹{p.activeDeposits}</span></div>
                  )}
                  {p.carryFwd > 0 && (
                    <div className="lb-stat">Carry Fwd: <span className="cf-tag">₹{p.carryFwd.toFixed(2)}</span></div>
                  )}
                </div>
              </div>
              {/* Dynamic right side */}
              <div style={{textAlign:'right',minWidth:'90px',flexShrink:0}}>
                <div className={`lb-val-big ${display.cls}`}>{display.val}</div>
                <div className="lb-label-small">{display.label}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── GRAPHS ───────────────────────────────────────────────────

function PaginatedMarketSentimentChart({ matches }) {
  const completedMatches = useMemo(() =>
    matches.filter(m => m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—'),
  [matches])

  // Build full history arrays for all players
  const { allLabels, allDatasets } = useMemo(() => {
    const labels = completedMatches.map(m => `M${m.matchno}`)
    const datasets = PLAYERS.map((p, i) => {
      let runningPrice = 100
      let prevPriceSnapshot = 100
      const history = completedMatches.map((m, idx) => {
        const pd = m.players[p]
        if (pd && pd.joined) {
          const eligible = PLAYERS
            .filter(pl => m.players?.[pl]?.paid && m.players?.[pl]?.points > 0)
            .map(pl => ({ name:pl, points:m.players[pl].points }))
            .sort((a,b) => b.points - a.points)
          let matchRank = 0, currentR = 1
          eligible.forEach((player, i) => {
            if (i > 0 && player.points < eligible[i-1].points) currentR++
            if (player.name === p) matchRank = currentR
          })
          if (idx === completedMatches.length - 1) prevPriceSnapshot = runningPrice
          const pts = pd.points || 0
          let multiplier = 1.0
          if      (matchRank === 1) multiplier = 1.20
          else if (matchRank === 2) multiplier = 1.10
          else if (matchRank === 3) multiplier = 1.05
          else if (matchRank === 6) multiplier = 0.95
          else if (matchRank === 7) multiplier = 0.90
          runningPrice = ((pts * 0.4) + (runningPrice * 0.6)) * multiplier
        } else {
          if (idx === completedMatches.length - 1) prevPriceSnapshot = runningPrice
        }
        return parseFloat(runningPrice.toFixed(2))
      })
      const currentVal    = runningPrice
      const lastJoined    = completedMatches[completedMatches.length-1]?.players[p]?.joined
      const change        = lastJoined ? (currentVal - prevPriceSnapshot) : 0
      const isUp          = change > 0
      const changePct     = (lastJoined && prevPriceSnapshot > 0) ? ((change/prevPriceSnapshot)*100).toFixed(1) : '0.0'
      const dynamicLabel  = `${p}: ₹${currentVal.toFixed(0)} ${change===0?'—':isUp?'▲':'▼'}${Math.abs(change).toFixed(0)} (${isUp&&change!==0?'+':''}${changePct}%)`
      return { label:dynamicLabel, data:history, borderColor:COLORS[i], backgroundColor:COLORS[i]+'15',
        fill:true, tension:0.4, pointRadius:3, pointHitRadius:10 }
    })
    return { allLabels:labels, allDatasets:datasets }
  }, [completedMatches])

  const chartOptions = {
    ...chartOpts('₹'),
    interaction:{ mode:'index', intersect:false },
    plugins:{
      ...chartOpts('₹').plugins,
      legend:{ labels:{ color:'#8899bb', font:{ family:'Rajdhani', size:11, weight:'700' }, padding:15, usePointStyle:true } },
      tooltip:{ callbacks:{ label:(ctx) => {
        const playerName = ctx.dataset.label.split(':')[0]
        const cur = ctx.parsed.y, idx = ctx.dataIndex
        const ds  = ctx.dataset.data
        if (idx > 0) {
          const prev = ds[idx-1], diff = cur - prev
          const pct  = ((diff/prev)*100).toFixed(1)
          const icon = diff>0?'▲':diff<0?'▼':'—'
          return `${playerName}: ₹${cur.toFixed(0)} (${icon}${Math.abs(diff).toFixed(0)} / ${diff>0?'+':''}${pct}%)`
        }
        return `${playerName}: ₹${cur.toFixed(0)} (Listing)`
      }}}
    }
  }

  return (
    <div className="chart-card" style={{gridColumn:'1/-1', border:'1px solid #f5a623'}}>
      <div className="chart-title">📊 PLAYER MOMENTUM INDEX (FORM-BASED)
        <span style={{fontSize:10,color:'#8899bb',fontWeight:400,display:'block',marginTop:3,letterSpacing:0.5}}>
          💡 Click a player's name in the legend to toggle · Use Prev/Next to navigate matches
        </span>
      </div>
      <PaginatedLineChart
        allLabels={allLabels}
        allDatasets={allDatasets}
        chartOptions={chartOptions}
        height={300}
        defaultPage="last"
      />
      <div style={{padding:'10px 12px',fontSize:'11px',color:'#8899bb',background:'rgba(0,0,0,0.2)',borderRadius:'0 0 12px 12px',borderTop:'1px solid #1e2d50',marginTop:8}}>
        <b style={{color:'#f5a623'}}>Formula:</b> (40% Match Pts + 60% Prev Index) × Rank Multiplier &nbsp;·&nbsp;
        <b style={{color:'#f5a623'}}>Multipliers:</b> 1st +20% · 2nd +10% · 3rd +5% · 6th -5% · 7th -10%
        <div style={{marginTop:4,fontStyle:'italic',opacity:0.7}}>*Skipped matches = Frozen price (flat line)</div>
      </div>
    </div>
  )
}

function MarketCandleChart({ matches }) {
  const completedMatches = useMemo(() => 
    matches.filter(m => m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—'), 
  [matches]);

  const chartData = useMemo(() => {
    return {
      labels: completedMatches.map(m => `M${m.matchno}`),
      datasets: PLAYERS.map((p, i) => {
        return {
          label: p,
          // Calculate the PnL CHANGE for just this specific match
          data: completedMatches.map(m => {
            const pd = m.players[p];
            if (pd?.joined && pd?.paid && m.contest === 'yes') {
               const prizes = calculatePrizes(m);
               const paidRanks = prizes._paidRanks || {};
               const pRank = paidRanks[p];
               
               const won = (pRank === 1) ? prizes[1] : (pRank === 2 && prizes.winnerCountLimit === 2) ? prizes[2] : 0;
               // Match PnL = Winnings - Entry Fee
               return parseFloat((won - m.fee).toFixed(2));
            }
            return 0;
          }),
          // Green if Profit (>0), Red if Loss (<0)
          backgroundColor: (ctx) => (ctx.raw >= 0 ? '#2ecc71cc' : '#e74c3ccc'),
          borderColor: (ctx) => (ctx.raw >= 0 ? '#2ecc71' : '#e74c3c'),
          borderWidth: 1,
          borderRadius: 2,
          barPercentage: 0.6,
        };
      })
    };
  }, [completedMatches]);

  const candleOpts = {
    ...chartOpts('₹'),
    plugins: {
      ...chartOpts().plugins,
      title: {
        display: true,
        text: '🕯️ DAILY PnL CANDLESTICKS',
        color: '#f5a623',
        font: { family: 'Bebas Neue', size: 18 }
      }
    },
    scales: {
      ...chartOpts().scales,
      y: {
        ...chartOpts().scales.y,
        // Ensure the 0 line (Base) is visible to separate Red/Green
        grid: { color: 'rgba(255, 255, 255, 0.1)' }
      }
    }
  };

  return (
    <div className="chart-card" style={{ gridColumn: '1/-1' }}>
      <div className="chart-wrap" style={{ height: 380 }}>
        {completedMatches.length > 0 ? (
          <Bar data={chartData} options={candleOpts} />
        ) : (
          <div className="no-data">Market Closed: No completed matches.</div>
        )}
      </div>
    </div>
  );
}

// ─── PAGINATED CHART WRAPPER ──────────────────────────────
// Shows MATCHES_PER_PAGE matches at a time with Prev/Next controls
const MATCHES_PER_PAGE_MOBILE = 7
const MATCHES_PER_PAGE_DESKTOP = 10

function usePaginatedData(allLabels, allDatasets, defaultPage) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const perPage  = isMobile ? MATCHES_PER_PAGE_MOBILE : MATCHES_PER_PAGE_DESKTOP
  const total    = allLabels.length
  const totalPages = Math.max(1, Math.ceil(total / perPage))

  const [page, setPage] = useState(() => defaultPage === 'last' ? totalPages : 1)

  // When total changes (data loads), jump to last page so latest matches show
  useEffect(() => {
    if (defaultPage === 'last') setPage(Math.max(1, Math.ceil(total / perPage)))
  }, [total, perPage, defaultPage])

  const start = (page - 1) * perPage
  const end   = Math.min(start + perPage, total)

  const slicedLabels   = allLabels.slice(start, end)
  const slicedDatasets = allDatasets.map(ds => ({ ...ds, data: ds.data.slice(start, end) }))

  return { slicedLabels, slicedDatasets, page, setPage, totalPages, perPage, start, end, total }
}

function ChartPageControls({ page, totalPages, setPage, start, end, total, label }) {
  if (totalPages <= 1) return null
  return (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      flexWrap:'wrap', gap:8, marginTop:10, padding:'8px 2px'
    }}>
      <div style={{fontSize:11,color:'#8899bb',letterSpacing:0.5}}>
        {label && <span style={{color:'#f5a623',fontWeight:700,marginRight:6}}>{label}</span>}
        Showing matches <b style={{color:'#e8eaf6'}}>{start+1}–{end}</b> of <b style={{color:'#e8eaf6'}}>{total}</b>
      </div>
      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
        <button onClick={()=>setPage(1)} disabled={page===1} style={pgBtnStyle(page===1)}>«</button>
        <button onClick={()=>setPage(p=>p-1)} disabled={page===1} style={pgBtnStyle(page===1)}>‹ Prev</button>
        {Array.from({length:totalPages},(_,i)=>i+1).map(pg=>(
          <button key={pg} onClick={()=>setPage(pg)} style={pgBtnStyle(false, pg===page)}>{pg}</button>
        ))}
        <button onClick={()=>setPage(p=>p+1)} disabled={page===totalPages} style={pgBtnStyle(page===totalPages)}>Next ›</button>
        <button onClick={()=>setPage(totalPages)} disabled={page===totalPages} style={pgBtnStyle(page===totalPages)}>»</button>
      </div>
    </div>
  )
}

function pgBtnStyle(disabled, active=false) {
  return {
    fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:12,
    padding:'5px 11px', borderRadius:8, cursor: disabled ? 'default' : 'pointer',
    border: active ? '1px solid #f5a623' : '1px solid rgba(255,255,255,0.12)',
    background: active ? 'rgba(245,166,35,0.2)' : 'rgba(255,255,255,0.05)',
    color: active ? '#f5a623' : disabled ? 'rgba(136,153,187,0.4)' : '#8899bb',
    opacity: disabled ? 0.5 : 1,
    transition:'all 0.15s'
  }
}

// ─── PAGINATED LINE CHART ─────────────────────────────────
function PaginatedLineChart({ allLabels, allDatasets, chartOptions, height=280, defaultPage='last' }) {
  const { slicedLabels, slicedDatasets, page, setPage, totalPages, start, end, total } =
    usePaginatedData(allLabels, allDatasets, defaultPage)

  return (
    <>
      <ChartPageControls page={page} totalPages={totalPages} setPage={setPage} start={start} end={end} total={total} />
      <div style={{position:'relative', height}}>
        <Line data={{labels:slicedLabels, datasets:slicedDatasets}} options={chartOptions} />
      </div>
      <ChartPageControls page={page} totalPages={totalPages} setPage={setPage} start={start} end={end} total={total} />
    </>
  )
}

// ─── PAGINATED BAR CHART ──────────────────────────────────
function PaginatedBarChart({ allLabels, allDatasets, chartOptions, height=280, defaultPage='last' }) {
  const { slicedLabels, slicedDatasets, page, setPage, totalPages, start, end, total } =
    usePaginatedData(allLabels, allDatasets, defaultPage)

  return (
    <>
      <ChartPageControls page={page} totalPages={totalPages} setPage={setPage} start={start} end={end} total={total} />
      <div style={{position:'relative', height}}>
        <Bar data={{labels:slicedLabels, datasets:slicedDatasets}} options={chartOptions} />
      </div>
      <ChartPageControls page={page} totalPages={totalPages} setPage={setPage} start={start} end={end} total={total} />
    </>
  )
}

function Graphs({ matches }) {
  const stats = useMemo(() => computePlayerStats(matches), [matches])

  const completedMatches = useMemo(() =>
    matches.filter(m => m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—'),
  [matches])

  const completedLabels = useMemo(() => completedMatches.map(m => `M${m.matchno}`), [completedMatches])
  const allLabels       = useMemo(() => matches.map(m => `M${m.matchno}`), [matches])

  // Cumulative PnL — completed matches only, diamond points
  const pnlDatasets = useMemo(() => PLAYERS.map((p, i) => {
    let cum = 0
    const data = completedMatches.map(m => {
      const pd = m.players[p]; if (!pd || !pd.joined) return cum
      if (m.contest === 'yes') {
        if (pd.paid) cum -= m.fee
        if (pd.paid) {
          const prizes   = calculatePrizes(m)
          const paidRanks = prizes._paidRanks || {}
          const pRank    = paidRanks[p]
          const isDone   = (m.transferred && typeof m.transferred === 'object')
            ? m.transferred[p] === true : m.transferred === true
          if (isDone) {
            if (pRank === 1) cum += prizes[1]
            else if (pRank === 2 && prizes.winnerCountLimit === 2) cum += prizes[2]
          }
        }
      }
      return parseFloat(cum.toFixed(2))
    })
    return { label:p, data, borderColor:COLORS[i], backgroundColor:COLORS[i]+'22',
      fill:false, tension:0.3, pointRadius:4, pointHoverRadius:7, pointStyle:'rectRot', borderWidth:2 }
  }), [completedMatches])

  // Per-match points — completed only
  const pointsDatasets = useMemo(() => PLAYERS
    .map((p, i) => {
      const data = completedMatches.map(m => {
        const pd = m.players[p]
        if (!pd?.joined || !pd?.paid) return null
        return pd.points > 0 ? pd.points : null
      })
      if (!data.some(v => v !== null && v > 0)) return null
      return { label:p, data, borderColor:COLORS[i], backgroundColor:COLORS[i]+'33',
        spanGaps:false, tension:0.3, pointRadius:5, pointStyle:'rectRot', borderWidth:2 }
    })
    .filter(Boolean),
  [completedMatches])

  // Pool money — all matches
  const poolDatasets = useMemo(() => [{
    label:'Pool (₹)',
    data: matches.map(m => calculatePrizes(m).totalPool || m.pool || 0),
    backgroundColor: matches.map(m => (calculatePrizes(m).totalPool||m.pool||0)>0
      ? 'rgba(245,166,35,0.5)' : 'rgba(100,100,100,0.3)'),
    borderColor: matches.map(m => (calculatePrizes(m).totalPool||m.pool||0)>0 ? '#f5a623' : '#555'),
    borderWidth:1
  }], [matches])

  // Per-player inv vs win — player-indexed (no pagination needed, always 7 players)
  const invWinData = useMemo(() => ({ labels: PLAYERS, datasets: [
    { label:'Invested', data:PLAYERS.map(p=>stats[p].totalInvested), backgroundColor:COLORS.map(c=>c+'99'), borderColor:COLORS, borderWidth:1 },
    { label:'Won',      data:PLAYERS.map(p=>parseFloat(stats[p].totalWon.toFixed(2))), backgroundColor:COLORS.map(c=>c+'44'), borderColor:COLORS, borderWidth:2 }
  ]}), [stats])

  const winsData    = useMemo(() => ({ labels:PLAYERS, datasets:[{ data:PLAYERS.map(p=>stats[p].wins), backgroundColor:COLORS, borderColor:'#1b2540', borderWidth:2 }] }), [stats])
  const winPctData  = useMemo(() => ({ labels:PLAYERS, datasets:[{ data:PLAYERS.map(p=>stats[p].paidContests>0?parseFloat(((stats[p].wins/stats[p].paidContests)*100).toFixed(1)):0), backgroundColor:COLORS.map(c=>c+'99'), borderColor:COLORS, borderWidth:1 }] }), [stats])

  const doughnutOpts = { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ labels:{ color:'#8899bb', font:{ family:'Rajdhani', size:13 } } } } }
  const polarOpts    = { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ labels:{ color:'#8899bb', font:{ family:'Rajdhani', size:12 } } } }, scales:{ r:{ ticks:{ color:'#8899bb' }, grid:{ color:'#1e2d50' } } } }

  const pnlOpts = {
    ...chartOpts('₹'),
    interaction:{ mode:'index', intersect:false },
    plugins:{
      ...chartOpts('₹').plugins,
      legend:{ labels:{ color:'#8899bb', font:{ family:'Rajdhani', size:12 }, usePointStyle:true, pointStyle:'rectRot' } }
    }
  }

  const ptsOpts = {
    ...chartOpts('pts'),
    interaction:{ mode:'index', intersect:false },
    plugins:{
      ...chartOpts('pts').plugins,
      legend:{ labels:{ color:'#8899bb', font:{ family:'Rajdhani', size:12 }, usePointStyle:true, pointStyle:'rectRot' } }
    }
  }

  return (
    <div className="section">
      <div className="sec-title">Graphs &amp; Analytics</div>
      <div className="graph-grid">

        {/* Player Momentum Index — paginated */}
        <PaginatedMarketSentimentChart matches={matches} />

        {/* Cumulative PnL — paginated, show latest page first */}
        <div className="chart-card" style={{gridColumn:'1/-1'}}>
          <div className="chart-title">📈 Cumulative Profit/Loss per Player (Season)
            <span style={{fontSize:10,color:'#8899bb',fontWeight:400,display:'block',marginTop:3,letterSpacing:0.5}}>
              💡 Click a player's name in the legend to toggle · Use Prev/Next to navigate matches
            </span>
          </div>
          <PaginatedLineChart
            allLabels={completedLabels}
            allDatasets={pnlDatasets}
            chartOptions={pnlOpts}
            height={300}
            defaultPage="last"
          />
        </div>

        {/* Investment vs Winnings — player-indexed, no pagination */}
        <div className="chart-card">
          <div className="chart-title">💰 Investment vs Winnings (Total)</div>
          <div className="chart-wrap"><Bar data={invWinData} options={chartOpts('₹')} /></div>
        </div>

        {/* Wins count — doughnut, no pagination */}
        <div className="chart-card">
          <div className="chart-title">🏅 Wins Count by Player</div>
          <div className="chart-wrap"><Doughnut data={winsData} options={doughnutOpts} /></div>
        </div>

        {/* Per Match Points — paginated */}
        <div className="chart-card" style={{gridColumn:'1/-1'}}>
          <div className="chart-title">📊 Per Match Points Comparison
            <span style={{fontSize:11,color:'#8899bb',fontWeight:400}}> (Completed · paid players with points only)</span>
            <span style={{fontSize:10,color:'#8899bb',fontWeight:400,display:'block',marginTop:3,letterSpacing:0.5}}>
              💡 Click a player's name in the legend to toggle · Use Prev/Next to navigate matches
            </span>
          </div>
          {pointsDatasets.length > 0
            ? <PaginatedLineChart
                allLabels={completedLabels}
                allDatasets={pointsDatasets}
                chartOptions={ptsOpts}
                height={300}
                defaultPage="last"
              />
            : <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:200,color:'#8899bb',fontSize:13}}>No completed match data yet.</div>
          }
        </div>

        {/* Win % — polar, no pagination */}
        <div className="chart-card">
          <div className="chart-title">🎯 Win % (among paid contestants)</div>
          <div className="chart-wrap"><PolarArea data={winPctData} options={polarOpts} /></div>
        </div>

        {/* Pool Money — paginated */}
        <div className="chart-card">
          <div className="chart-title">📦 Pool Money per Match</div>
          <PaginatedBarChart
            allLabels={allLabels}
            allDatasets={poolDatasets}
            chartOptions={chartOpts('₹')}
            height={240}
            defaultPage="last"
          />
        </div>

      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════

// ─── MATCH DETAIL MODAL ───────────────────────────────────────
function MatchDetailModal({ match, onClose }) {
  if (!match) return null;
  const done = match.teamwon && match.teamwon.trim() !== '' && match.teamwon !== '—';
  const prizes = calculatePrizes(match);

  const eligiblePaid = PLAYERS
    .filter(p => match.players?.[p]?.paid && match.players?.[p]?.points > 0)
    .map(p => ({ name: p, points: match.players[p].points }))
    .sort((a, b) => b.points - a.points);

  let paidRanks = {};
  let currentRankMD = 1;
  eligiblePaid.forEach((p, i) => {
    if (i > 0 && p.points < eligiblePaid[i - 1].points) currentRankMD++;
    paidRanks[p.name] = currentRankMD;
  });

  const winners = eligiblePaid.filter(p => {
    const r = paidRanks[p.name];
    return r === 1 || (r === 2 && prizes.winnerCountLimit === 2);
  });

  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={onClose} style={{zIndex:9999, position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px', background:'rgba(0,0,0,0.88)', backdropFilter:'blur(6px)'}}>
      <div onClick={e => e.stopPropagation()} style={{
        background:'linear-gradient(135deg,#0a0f1e,#161f38)',
        border:'1px solid rgba(245,166,35,0.4)',
        borderRadius:20, padding:0, width:'min(96vw,560px)',
        maxHeight:'90vh', overflowY:'auto',
        boxShadow:'0 0 60px rgba(245,166,35,0.15), 0 20px 60px rgba(0,0,0,0.8)',
        position:'relative'
      }}>
        {/* Header */}
        <div style={{
          background:'linear-gradient(90deg,rgba(245,166,35,0.12),rgba(232,83,26,0.08))',
          borderBottom:'1px solid rgba(245,166,35,0.25)',
          padding:'16px 20px', borderRadius:'20px 20px 0 0',
          display:'flex', justifyContent:'space-between', alignItems:'center'
        }}>
          <div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:3,color:'#f5a623'}}>
              MATCH #{match.matchno} — FULL RESULT
            </div>
            <div style={{fontSize:11,color:'#8899bb',letterSpacing:1.5,marginTop:2}}>
              {match.teams} · {formatDate(match.date)} · {formatMatchTimeLabel(match.matchTime)}
            </div>
          </div>
          <button onClick={onClose} style={{
            background:'rgba(231,76,60,0.15)',border:'1px solid rgba(231,76,60,0.4)',
            color:'#e74c3c',borderRadius:8,padding:'5px 11px',cursor:'pointer',
            fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:12,flexShrink:0
          }}>✕</button>
        </div>

        <div style={{padding:'16px 20px'}}>
          {/* Winner Banner */}
          {done && (
            <div style={{
              background:'linear-gradient(135deg,rgba(245,166,35,0.08),rgba(46,204,113,0.04))',
              border:'1px solid rgba(245,166,35,0.25)',borderRadius:12,
              padding:'12px 16px',marginBottom:16,textAlign:'center'
            }}>
              <div style={{fontSize:10,letterSpacing:3,color:'#8899bb',marginBottom:4}}>IPL MATCH WON BY</div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,letterSpacing:3,color:'#f5a623'}}>
                🏏 {match.teamwon}
              </div>
              {match.contest === 'yes' && (
                <div style={{marginTop:8,fontSize:12,color:'#8899bb',display:'flex',justifyContent:'center',gap:16,flexWrap:'wrap'}}>
                  <span>Pool: <b style={{color:'#2ecc71'}}>₹{prizes.totalPool}</b></span>
                  <span>Entry: <b style={{color:'#f5a623'}}>₹{match.fee}</b></span>
                  <span>Players: <b>{match.joinedCount}/{PLAYERS.length}</b></span>
                </div>
              )}
            </div>
          )}

          {/* Fantasy Winners */}
          {done && winners.length > 0 && (
            <div style={{marginBottom:16}}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:13,letterSpacing:3,color:'#f5a623',marginBottom:8}}>
                🏆 FANTASY WINNERS
              </div>
              <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                {winners.map(w => {
                  const rank = paidRanks[w.name];
                  const prize = rank === 1 ? prizes[1] : prizes[2];
                  const isDone = (match.transferred && typeof match.transferred === 'object')
                    ? match.transferred[w.name] === true
                    : match.transferred === true;
                  const color = COLORS[PLAYERS.indexOf(w.name)];
                  return (
                    <div key={w.name} style={{
                      background:`linear-gradient(135deg,${color}12,${color}06)`,
                      border:`1px solid ${color}40`,borderRadius:12,
                      padding:'12px 14px',flex:1,minWidth:120,
                      display:'flex',flexDirection:'column',alignItems:'center',gap:5
                    }}>
                      <div style={{width:46,height:46,borderRadius:'50%',overflow:'hidden',border:`2px solid ${color}`}}>
                        <img src={PLAYER_IMAGES[w.name]} alt={w.name}
                          style={{width:'100%',height:'100%',objectFit:'cover'}}
                          onError={e=>{e.target.style.display='none'}}
                        />
                      </div>
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:15,letterSpacing:2,color}}>{w.name}</div>
                      <div style={{fontSize:10,color:'#8899bb'}}>{rank===1?'🥇 1st Place':'🥈 2nd Place'}</div>
                      <div style={{fontSize:14,fontWeight:700,color:'#2ecc71'}}>₹{prize?.toFixed(2)}</div>
                      <div style={{fontSize:10}}>{isDone
                        ? <span style={{color:'#2ecc71'}}>✅ Transferred</span>
                        : <span style={{color:'#f5a623'}}>⏳ Pending</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* All Players Score Grid */}
          <div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:13,letterSpacing:3,color:'#f5a623',marginBottom:8}}>
              📊 PLAYER SCORECARD
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {eligiblePaid.map(player => {
                const rank = paidRanks[player.name];
                const isWinner = rank === 1 || (rank === 2 && prizes.winnerCountLimit === 2);
                const color = COLORS[PLAYERS.indexOf(player.name)];
                const pd = match.players[player.name];
                return (
                  <div key={player.name} style={{
                    background: isWinner ? 'rgba(245,166,35,0.07)' : 'rgba(255,255,255,0.02)',
                    border: isWinner ? '1px solid rgba(245,166,35,0.3)' : '1px solid rgba(255,255,255,0.06)',
                    borderRadius:10,padding:'9px 12px',
                    display:'flex',alignItems:'center',gap:9
                  }}>
                    <div style={{width:34,height:34,borderRadius:'50%',overflow:'hidden',border:`2px solid ${color}`,flexShrink:0}}>
                      <img src={PLAYER_IMAGES[player.name]} alt={player.name}
                        style={{width:'100%',height:'100%',objectFit:'cover'}}
                        onError={e=>{e.target.style.display='none'}}
                      />
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:14,letterSpacing:1,color,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                        {player.name} {isWinner?(rank===1?'🥇':'🥈'):''}
                      </div>
                      <div style={{fontSize:10,color:'#8899bb'}}>
                        {pd?.paid?'💰 Paid':'—'} · Rank #{rank}
                      </div>
                    </div>
                    <div style={{
                      fontFamily:"'Orbitron',sans-serif",fontSize:17,fontWeight:700,
                      color: isWinner?'#f5a623':'#e8eaf6',flexShrink:0
                    }}>{player.points}</div>
                  </div>
                );
              })}
              {PLAYERS.filter(p => !match.players?.[p]?.joined).map(p => (
                <div key={p} style={{
                  background:'rgba(0,0,0,0.1)',border:'1px solid rgba(255,255,255,0.04)',
                  borderRadius:10,padding:'9px 12px',display:'flex',alignItems:'center',gap:9,opacity:0.35
                }}>
                  <div style={{width:34,height:34,borderRadius:'50%',background:'#1b2540',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontFamily:"'Bebas Neue',sans-serif",color:'#8899bb'}}>
                    {p[0]}
                  </div>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:14,color:'#8899bb'}}>{p}</div>
                  <div style={{marginLeft:'auto',fontSize:11,color:'#8899bb'}}>Not joined</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── TV NEWS BULLETIN ─────────────────────────────────────────

function stripEmojis(str) {
  return str
    .replace(/[\u2600-\u27BF]/g, '')
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
    .replace(/[\u200D\uFE0F]/g, '')
    .replace(/[\u2300-\u23FF]/g, '')
    .replace(/[\u2B00-\u2BFF]/g, '')
    .trim();
}

function buildSpeakText(raw) {
  let t = stripEmojis(raw);
  t = t.replace(/^[A-Z\s]+([\w\s]+)?\([^)]+\)\s*:\s*/i, '');
  t = t.replace(/\([^)]*\)/g, '');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function buildDisplayTitle(raw) {
  const cleaned = stripEmojis(raw).trim();
  const m = cleaned.match(/^([A-Z][A-Z\s]+?)\s*[(:]/);
  if (m) return m[1].trim();
  return '';
}

function getCategoryInfo(h) {
  if (h.includes('👑') || h.includes('LEADERBOARD')) return { tag: 'LEADERBOARD',   color: '#f5a623', bg: 'rgba(245,166,35,0.15)' };
  if (h.includes('🏆') || h.includes('SEASON'))      return { tag: 'SEASON RECORD', color: '#ffd700', bg: 'rgba(255,215,0,0.15)' };
  if (h.includes('🔥') || h.includes('HOT STREAK'))  return { tag: 'HOT STREAK',    color: '#ff6b35', bg: 'rgba(255,107,53,0.15)' };
  if (h.includes('📈') || h.includes('STAT'))        return { tag: 'STAT BURST',    color: '#2ecc71', bg: 'rgba(46,204,113,0.15)' };
  if (h.includes('🚀') || h.includes('BULL'))        return { tag: 'BULL RUN',      color: '#2ecc71', bg: 'rgba(46,204,113,0.15)' };
  if (h.includes('📉') || h.includes('BEAR'))        return { tag: 'MARKET ALERT',  color: '#e74c3c', bg: 'rgba(231,76,60,0.15)' };
  if (h.includes('🌅') || h.includes('RECOVERY'))    return { tag: 'COMEBACK',      color: '#3498db', bg: 'rgba(52,152,219,0.15)' };
  if (h.includes('💎') || h.includes('BLUE CHIP'))   return { tag: 'BLUE CHIP',     color: '#9b59b6', bg: 'rgba(155,89,182,0.15)' };
  if (h.includes('🛡️') || h.includes('IRON'))        return { tag: 'CONSISTENCY',   color: '#1abc9c', bg: 'rgba(26,188,156,0.15)' };
  if (h.includes('💸') || h.includes('DEBT'))        return { tag: 'DEBT FREE',     color: '#e67e22', bg: 'rgba(230,126,34,0.15)' };
  if (h.includes('🎯') || h.includes('PERSONAL'))    return { tag: 'PERSONAL BEST', color: '#9b59b6', bg: 'rgba(155,89,182,0.15)' };
  if (h.includes('VENTURE'))                         return { tag: 'VENTURE CAPITAL',color: '#f5a623', bg: 'rgba(245,166,35,0.15)' };
  return { tag: 'BREAKING NEWS', color: '#c0392b', bg: 'rgba(192,57,43,0.15)' };
}

function AnchorSVG({ isSpeaking }) {
  return (
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3a7bd5"/>
          <stop offset="100%" stopColor="#5ba3e0"/>
        </linearGradient>
        <linearGradient id="deskGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#d4a55a"/>
          <stop offset="100%" stopColor="#b8843a"/>
        </linearGradient>
        <radialGradient id="skinTone" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor="#f5c5a0"/>
          <stop offset="100%" stopColor="#e8a87c"/>
        </radialGradient>
        <clipPath id="svgClip"><rect width="320" height="180"/></clipPath>
      </defs>
      <g clipPath="url(#svgClip)">
        <rect width="320" height="180" fill="url(#bgGrad)"/>
        <ellipse cx="80" cy="75" rx="28" ry="18" fill="rgba(255,255,255,0.12)"/>
        <ellipse cx="155" cy="70" rx="35" ry="22" fill="rgba(255,255,255,0.12)"/>
        <ellipse cx="230" cy="72" rx="18" ry="14" fill="rgba(255,255,255,0.12)"/>
        <rect x="0" y="140" width="320" height="40" fill="url(#deskGrad)" rx="2"/>
        <rect x="0" y="138" width="320" height="4" fill="#c49040"/>
        <rect x="195" y="110" width="70" height="42" rx="4" fill="#e0e0e0" stroke="#aaa" strokeWidth="1"/>
        <rect x="198" y="113" width="64" height="36" rx="2" fill="#1a3a5c" opacity="0.8"/>
        <rect x="202" y="117" width="56" height="6" rx="1" fill="#f5a623" opacity="0.5"/>
        <rect x="270" y="8" width="42" height="20" rx="3" fill="#c0392b"/>
        <text x="291" y="22" textAnchor="middle" fontSize="10" fontWeight="bold" fill="white" fontFamily="Arial">LIVE</text>
        <ellipse cx="155" cy="170" rx="50" ry="30" fill="#c0392b"/>
        <rect x="120" y="115" width="70" height="55" rx="12" fill="#c0392b"/>
        <path d="M140 115 L155 128 L170 115" fill="#1a3a7c"/>
        <path d="M120 118 Q90 130 88 148 Q100 145 110 135 L120 125Z" fill="#c0392b"/>
        <path d="M190 118 Q220 128 218 148 Q208 145 198 135 L190 125Z" fill="#c0392b"/>
        <ellipse cx="100" cy="150" rx="12" ry="7" fill="url(#skinTone)"/>
        <ellipse cx="210" cy="150" rx="12" ry="7" fill="url(#skinTone)"/>
        <rect x="147" y="95" width="16" height="22" rx="8" fill="url(#skinTone)"/>
        <ellipse cx="155" cy="72" rx="28" ry="30" fill="url(#skinTone)"/>
        <path d="M127 62 Q118 40 128 28 Q140 15 155 18 Q172 15 182 28 Q192 40 183 62 Q178 80 178 95 Q168 100 162 98 Q165 82 168 65 Q162 50 155 48 Q148 50 142 65 Q145 82 148 98 Q142 100 132 95 Q132 80 127 62Z" fill="#6b3a1f"/>
        <path d="M127 62 Q115 70 118 90 Q122 105 130 110 Q126 98 128 80Z" fill="#6b3a1f"/>
        <path d="M183 62 Q195 70 192 90 Q188 105 180 110 Q184 98 182 80Z" fill="#6b3a1f"/>
        <ellipse cx="127" cy="72" rx="5" ry="7" fill="url(#skinTone)"/>
        <ellipse cx="183" cy="72" rx="5" ry="7" fill="url(#skinTone)"/>
        <ellipse cx="144" cy="66" rx="7" ry="5" fill="white"/>
        <ellipse cx="166" cy="66" rx="7" ry="5" fill="white"/>
        <ellipse cx="145" cy="67" rx="4" ry="4" fill="#3d2005"/>
        <ellipse cx="167" cy="67" rx="4" ry="4" fill="#3d2005"/>
        <ellipse cx="146" cy="66" rx="1.5" ry="1.5" fill="#1a0a00"/>
        <ellipse cx="168" cy="66" rx="1.5" ry="1.5" fill="#1a0a00"/>
        <circle cx="147" cy="65" r="1" fill="white" opacity="0.8"/>
        <circle cx="169" cy="65" r="1" fill="white" opacity="0.8"/>
        <path d="M138 59 Q144 56 150 58" stroke="#4a2800" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
        <path d="M160 58 Q166 56 172 59" stroke="#4a2800" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
        <path d="M153 70 Q155 78 157 70" stroke="#c49a70" strokeWidth="1.2" fill="none"/>
        <ellipse cx="152" cy="77" rx="3" ry="2" fill="#d4926e" opacity="0.5"/>
        <ellipse cx="158" cy="77" rx="3" ry="2" fill="#d4926e" opacity="0.5"/>
        {isSpeaking ? (
          <g>
            <path d="M146 85 Q155 82 164 85" stroke="#c0392b" strokeWidth="1.5" fill="none"/>
            <path className="tv-mouth-open" d="M146 85 Q155 95 164 85" fill="#c0392b"/>
            <path d="M148 86 Q155 90 162 86" fill="white"/>
          </g>
        ) : (
          <path d="M146 86 Q155 90 164 86 Q155 92 146 86Z" fill="#c0392b"/>
        )}
        <path d="M146 85 Q151 83 155 84 Q159 83 164 85" stroke="#a0392b" strokeWidth="1" fill="none"/>
        <ellipse cx="134" cy="78" rx="8" ry="5" fill="#e8a0a0" opacity="0.35"/>
        <ellipse cx="176" cy="78" rx="8" ry="5" fill="#e8a0a0" opacity="0.35"/>
        <circle cx="127" cy="80" r="2.5" fill="#ffd700"/>
        <circle cx="183" cy="80" r="2.5" fill="#ffd700"/>
        <rect x="143" y="148" width="24" height="10" rx="3" fill="#1a1a3a" stroke="#f5a623" strokeWidth="0.8"/>
        <text x="155" y="156" textAnchor="middle" fontSize="5" fill="#f5a623" fontFamily="Arial" fontWeight="bold">ANCHOR</text>
      </g>
    </svg>
  );
}

function TVNewsBulletin({ matches }) {
  const stats    = useMemo(() => computePlayerStats(matches), [matches]);
  const headlines = useMemo(() => generateBreakingNews(matches, stats), [matches, stats]);

  // Start with ticker-only; expand to full TV after 8s
  const [showTV, setShowTV]           = useState(false);
  const [currentIdx, setCurrentIdx]   = useState(0);
  const [visible, setVisible]         = useState(true);
  const [isMuted, setIsMuted]         = useState(true);
  const [isSpeaking, setIsSpeaking]   = useState(false);
  const [time, setTime]               = useState('');
  const isFirstRef = useRef(true);
  const synthRef   = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);
  const mutedRef   = useRef(true);

  useEffect(() => {
    const t = setTimeout(() => setShowTV(true), 8000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => { mutedRef.current = isMuted; }, [isMuted]);

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const getVoice = useCallback(() => {
    const voices = synthRef.current.getVoices();
    return voices.find(v => v.lang==='en-IN' && v.name.toLowerCase().includes('female'))
      || voices.find(v => v.lang==='en-IN')
      || voices.find(v => v.lang.startsWith('en') && (v.name.toLowerCase().includes('zira')||v.name.toLowerCase().includes('samantha')||v.name.toLowerCase().includes('karen')||v.name.toLowerCase().includes('moira')))
      || voices.find(v => v.lang.startsWith('en'));
  }, []);

  const speakOne = useCallback((text) => new Promise(resolve => {
    const synth = synthRef.current;
    if (!synth) { resolve(); return; }
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.92; utter.pitch = 1.1; utter.volume = 1;
    const v = getVoice(); if (v) utter.voice = v;
    utter.onstart = () => setIsSpeaking(true);
    utter.onend   = () => { setIsSpeaking(false); resolve(); };
    utter.onerror = () => { setIsSpeaking(false); resolve(); };
    synth.speak(utter);
  }), [getVoice]);

  const runReadAll = useCallback(async (startIdx) => {
    if (!synthRef.current || mutedRef.current) return;
    const total = headlines.length; if (!total) return;
    if (isFirstRef.current) {
      isFirstRef.current = false;
      const lastM = matches.filter(m => m.teamwon && m.teamwon.trim()!=='' && m.teamwon!=='—').slice(-1)[0];
      const info = lastM ? `after match number ${lastM.matchno||''}, ${lastM.teams||''}` : '';
      await speakOne(`Welcome to VOIS Panthers News! ${info}. Here are the breaking news.`);
      if (mutedRef.current) return;
    }
    let idx = startIdx;
    while (!mutedRef.current) {
      const spoken = buildSpeakText(headlines[idx % total]);
      setVisible(false);
      await new Promise(r => setTimeout(r, 400));
      setCurrentIdx(idx % total);
      setVisible(true);
      await speakOne(spoken);
      if (mutedRef.current) break;
      await new Promise(r => setTimeout(r, 600));
      idx++;
    }
  }, [headlines, matches, speakOne]);

  const timerRef = useRef(null);
  useEffect(() => {
    if (!isMuted) { clearInterval(timerRef.current); return; }
    if (!headlines.length) return;
    timerRef.current = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setCurrentIdx(i => (i+1)%headlines.length); setVisible(true); }, 400);
    }, 6000);
    return () => clearInterval(timerRef.current);
  }, [isMuted, headlines]);

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    setIsMuted(next); mutedRef.current = next;
    if (next) { synthRef.current?.cancel(); setIsSpeaking(false); }
    else { setTimeout(() => runReadAll(currentIdx), 300); }
  }, [isMuted, currentIdx, runReadAll]);

  useEffect(() => () => { synthRef.current?.cancel(); }, []);

  if (!headlines.length) return null;

  const headline       = headlines[currentIdx] || '';
  const cat            = getCategoryInfo(headline);
  const displayTitle   = buildDisplayTitle(headline);
  const cleanBody      = buildSpeakText(headline);
  const mentionedPlayer = PLAYERS.find(p => headline.toUpperCase().includes(p.toUpperCase()));
  const avatarUrl      = mentionedPlayer ? PLAYER_IMAGES[mentionedPlayer] : null;
  const playerColor    = mentionedPlayer ? COLORS[PLAYERS.indexOf(mentionedPlayer)] : '#f5a623';

  const completedMatches = matches.filter(m => m.teamwon && m.teamwon.trim()!=='' && m.teamwon!=='—');
  const lastMatch = completedMatches[completedMatches.length - 1];
  const newsDateLabel = lastMatch
    ? `Post M#${lastMatch.matchno} · ${formatDate(lastMatch.date)}`
    : 'Pre-Season';

  // Bottom ticker (shown always, even before TV expands)
  const BottomTicker = () => (
    <div className="tv-bottom-ticker">
      <div className="tv-ticker-label">BREAKING</div>
      <div className="tv-ticker-scroll">
        <div className="tv-ticker-track">
          {[...headlines,...headlines].map((h,i) => {
            const idx = i % headlines.length;
            return (
              <span key={i} className="tv-ticker-item">
                <span className="tv-ticker-bullet" style={{color: idx===currentIdx?'#f5a623':'#c0392b'}}>◆</span>{" "}
                {buildSpeakText(h)}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );

  if (!showTV) {
    return (
      <div className="tv-news-bulletin" style={{position:'relative',zIndex:160}}>
        <div className="tv-channel-bar" style={{padding:'4px 14px'}}>
          <div className="tv-channel-logo">
            <span className="tv-logo-icon">📺</span>
            <div>
              <div className="tv-channel-name" style={{fontSize:13}}>VOIS PANTHERS NEWS</div>
              <div className="tv-channel-sub">{newsDateLabel} · IPL 2026 · LIVE</div>
            </div>
          </div>
          <div className="tv-channel-right">
            <div className="tv-live-badge"><span className="tv-live-dot"/>LIVE</div>
            <div className="tv-clock">{time}</div>
          </div>
        </div>
        <BottomTicker />
      </div>
    );
  }

  return (
    <div style={{
      background:'linear-gradient(90deg,#04060f,#060810,#04060f)',
      borderTop:'2px solid #c0392b',
      borderBottom:'1px solid rgba(192,57,43,0.2)',
      display:'flex',
      alignItems:'center',
      gap:0,
      height:'56px',
      overflow:'hidden',
      position:'relative',
      zIndex:160
    }}>
      {/* MINI TV SET — anchor lipsyncs inside */}
      <div style={{
        flexShrink:0, width:'80px', height:'100%',
        background:'linear-gradient(135deg,#1a1a2e,#0d0d1a)',
        borderRight:'1px solid rgba(192,57,43,0.3)',
        display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        padding:'3px', gap:'2px'
      }}>
        {/* Mini TV bezel */}
        <div style={{
          width:'70px', background:'#111122',
          border:'2px solid #2a2a4a', borderRadius:'4px',
          padding:'2px', boxShadow:'inset 0 0 6px rgba(0,0,0,0.8), 0 0 8px rgba(100,150,255,0.15)'
        }}>
          <div style={{position:'relative',borderRadius:'2px',overflow:'hidden',lineHeight:0}}>
            <AnchorSVG isSpeaking={isSpeaking && !isMuted} />
            {/* Live badge overlay */}
            <div style={{
              position:'absolute',top:2,right:2,
              background:'#c0392b',color:'#fff',
              fontFamily:"'Bebas Neue',sans-serif",fontSize:'6px',letterSpacing:'1px',
              padding:'1px 3px',borderRadius:'2px',lineHeight:1
            }}>LIVE</div>
            {/* Scanline */}
            <div style={{
              position:'absolute',inset:0,
              background:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.06) 2px,rgba(0,0,0,0.06) 4px)',
              pointerEvents:'none'
            }}/>
          </div>
        </div>
        {/* Anchor name + speak bars */}
        <div style={{display:'flex',alignItems:'center',gap:2}}>
          {isSpeaking && !isMuted
            ? <div className="tv-speak-bars" style={{height:8,gap:1}}>
                <span style={{width:2}}/><span style={{width:2}}/><span style={{width:2}}/><span style={{width:2}}/>
              </div>
            : <div style={{fontSize:'6px',color:'#8899bb',letterSpacing:0.5,fontFamily:"'Bebas Neue',sans-serif"}}>PRIYA SHARMA</div>
          }
        </div>
      </div>

      {/* CHANNEL LABEL */}
      <div style={{
        flexShrink:0, padding:'0 8px',
        borderRight:'1px solid rgba(192,57,43,0.2)',
        display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center',
        height:'100%', gap:2,
        background:'linear-gradient(180deg,#0d0204,#160408)'
      }}>
        <div style={{
          fontFamily:"'Bebas Neue',sans-serif",fontSize:'9px',letterSpacing:'2px',
          color:'#fff',textShadow:'0 0 8px rgba(192,57,43,0.8)',lineHeight:1,whiteSpace:'nowrap'
        }}>📺 VOIS NEWS</div>
        <div style={{fontSize:'7px',color:'#c0392b',letterSpacing:'1px',whiteSpace:'nowrap'}}>{newsDateLabel}</div>
        <div style={{display:'flex',alignItems:'center',gap:3}}>
          <div className="tv-live-badge" style={{fontSize:'7px',padding:'1px 4px'}}>
            <span className="tv-live-dot" style={{width:4,height:4}}/>LIVE
          </div>
          <button className="tv-mute-btn" onClick={toggleMute}
            style={{fontSize:'9px',padding:'1px 4px',display:'flex',alignItems:'center',gap:2}}>
            {isMuted ? '🔇' : isSpeaking ? '🔊' : '🔈'}
          </button>
        </div>
      </div>

      {/* HEADLINES TICKER — fills rest of width */}
      <div style={{flex:1, overflow:'hidden', display:'flex', flexDirection:'column', justifyContent:'center', height:'100%', background:'#04060f'}}>
        {/* Category pill + current headline */}
        <div style={{
          display:'flex',alignItems:'center',gap:6,
          padding:'0 10px', height:'50%',
          borderBottom:'1px solid rgba(255,255,255,0.04)'
        }}>
          <div style={{
            flexShrink:0,
            background:cat.bg, border:`1px solid ${cat.color}`, color:cat.color,
            fontFamily:"'Bebas Neue',sans-serif",fontSize:'8px',letterSpacing:'1.5px',
            padding:'1px 5px',borderRadius:'2px',whiteSpace:'nowrap'
          }}>⚡ {cat.tag}</div>
          {mentionedPlayer && (
            <div style={{flexShrink:0,display:'flex',alignItems:'center',gap:3}}>
              <img src={PLAYER_IMAGES[mentionedPlayer]||''} alt={mentionedPlayer}
                style={{width:16,height:16,borderRadius:'50%',objectFit:'cover',border:`1px solid ${playerColor}`}}
                onError={e=>{e.target.style.display='none'}}
              />
              <span style={{fontSize:'9px',fontFamily:"'Bebas Neue',sans-serif",color:playerColor,letterSpacing:1}}>{mentionedPlayer}</span>
            </div>
          )}
        </div>
        {/* Scrolling headline text — marquee on mobile if text overflows */}
        <div style={{overflow:'hidden', flex:1, display:'flex', alignItems:'center', padding:'0 10px'}}>
          <div className={`mini-headline ${visible?'mini-in':'mini-out'}`} style={{
            fontFamily:"'Bebas Neue',sans-serif",
            fontSize:'clamp(10px,2vw,13px)',
            letterSpacing:'1px',
            color:'#fff',
            whiteSpace:'nowrap',
            overflow:'hidden',
            maxWidth:'100%',
            display:'block'
          }}>
            <span className="mini-headline-scroll">{cleanBody}</span>
          </div>
        </div>
      </div>

    </div>
  );
}

function MarketTicker({ matches }) {
  const stats = useMemo(() => computePlayerStats(matches), [matches]);
  
  const tickerItems = PLAYERS.map((p, i) => {
    const s = stats[p];
    const currentPnL = s.totalWon - s.totalInvested;
    const previousPnL = s.lastMatchPnL;
    
    // Daily Change calculation
    const dayChange = currentPnL - previousPnL;
    const isDayUp = dayChange >= 0;
    
    // % Change based on the "Previous Close" (Previous PnL)
    const denominator = Math.abs(previousPnL) || 100;
    const dayPercent = ((dayChange / denominator) * 100).toFixed(2);

    return (
      <div className="ticker-stock-item" key={p}>
        <span style={{ color: COLORS[i], marginRight: 8, fontSize: '14px' }}>{p.toUpperCase()}</span>
        
        {/* Total PnL (The base price) */}
        <span style={{ color: '#fff', fontWeight: 700, marginRight: 5 }}>
          ₹{currentPnL.toFixed(0)}
        </span>

        {/* Day Change and Percentage */}
        <span className={isDayUp ? 'stock-up' : 'stock-down'} style={{ fontWeight: 800 }}>
          {isDayUp ? '▲' : '▼'} ₹{Math.abs(dayChange).toFixed(0)} ({isDayUp ? '+' : ''}{dayPercent}%)
        </span>

        {/* ATH & ATL preservation */}
        <span style={{ color: '#8899bb', fontSize: '10px', marginLeft: 10 }}>
          <span style={{color:'#2ecc71'}}>ATH: ₹{s.ath.toFixed(0)}</span> | 
          <span style={{color:'#e74c3c'}}> ATL: ₹{s.atl.toFixed(0)}</span>
        </span>
      </div>
    );
  });

  return (
    <div className="market-ticker-wrap">
      <div className="market-ticker-inner">
        {tickerItems} {tickerItems}
      </div>
    </div>
  );
}

function MarketSentimentTicker({ matches }) {
  const stats = useMemo(() => computePlayerStats(matches), [matches]);
  const completedMatches = useMemo(() => 
    matches.filter(m => m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—'), 
  [matches]);

  const tickerItems = useMemo(() => {
    return PLAYERS.map((p, i) => {
      const s = stats[p] || { currentIndex: 100, indexATH: 100, indexATL: 100, prevIndexSnapshot: 100 };
      const displayATL = s.indexATL !== null ? s.indexATL.toFixed(0) : "100"; // Fallback to 100 only for display
      
      const lastM = completedMatches[completedMatches.length - 1];
      const playedLastMatch = lastM?.players?.[p]?.joined || false;

      const currentVal = s.currentIndex;
      const prevVal = s.prevIndexSnapshot; // This is the fixed "Previous Close"

      // Change logic: if they didn't play the last match, the market didn't move for them
      const change = playedLastMatch ? (currentVal - prevVal) : 0;
      const isUp = change > 0;
      const isDown = change < 0;
      const changePercent = (playedLastMatch && prevVal > 0) 
        ? ((change / prevVal) * 100).toFixed(1) 
        : '0.0';

      return (
        <div className="sentiment-item" key={p}>
          <span style={{ color: COLORS[i] }}>{p} INDEX:</span>
          <span className="index-price">₹{currentVal.toFixed(0)}</span>
          
          <span className={isUp ? 'stock-up' : isDown ? 'stock-down' : ''} 
                style={{ marginLeft: 6, color: !playedLastMatch ? '#8899bb' : undefined }}>
            {isUp ? '▲' : isDown ? '▼' : '—'}
            {Math.abs(change).toFixed(0)} ({isUp ? '+' : ''}{changePercent}%)
          </span>

          <span style={{ fontSize: '9px', color: '#8899bb', marginLeft: '8px', opacity: 0.8 }}>
            <span style={{ color: '#2ecc71' }}>ATH: {s.indexATH.toFixed(0)}</span> | 
            <span style={{ color: '#e74c3c' }}> ATL: {displayATL}</span>
          </span>
        </div>
      );
    });
  }, [completedMatches, stats]);

  return (
    <div className="sentiment-ticker-wrap">
      <div className="sentiment-ticker-inner">
        {tickerItems} {tickerItems}
      </div>
    </div>
  );
}


export default function App() {
  const [matches, setMatches]         = useState([])
  const [h2hPlayers, setH2hPlayers]   = useState({ p1: null, p2: null })
  const [loading, setLoading]         = useState(false)
  const [activeSection, setActiveSection] = useState('matchlog')
  const [liveState, setLiveState]     = useState({ dot:'', label:'CONNECTING...', info:'Connecting to cloud...' })
  const [clock, setClock]             = useState('')
  const [refreshLeft, setRefreshLeft] = useState(DAILY_LIMIT)
  const [isCooldown, setIsCooldown]   = useState(false)
  const [btnText, setBtnText]         = useState('⟳ Refresh')
  const lastVersionRef = useRef(null)

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
        const options = { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true }
        const updatedAt = data.updatedAt
          ? new Date(data.updatedAt).toLocaleString('en-IN', options).replace(/,/g, '')
          : new Date().toLocaleString('en-IN', options).replace(/,/g, '')
        setLiveState({ dot:'', label:'🟢 LIVE', info:`Last Updated: ${updatedAt} · Click Refresh for latest scores` })
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
      {adminView === 'login' && (
        <AdminLogin onLoginSuccess={() => setAdminView('admin')} onBack={() => setAdminView('public')} />
      )}
      {adminView === 'admin' && (
        <AdminPage onLogout={() => setAdminView('public')} />
      )}

      <div style={adminView !== 'public' ? { display:'none' } : {}}>
        <div className="watermark">#PbDawn</div>
        {loading && <div className="loading-overlay"><div className="spinner"/><div className="loading-text">Loading live data...</div></div>}

        {/* HEADER */}
        <header>
          <div className="header-inner">
            <div className="logo-area">
              <div className="logo-icon">🏏</div>
              <div>
                <div className="title-main">VOIS Panthers IPL 2026</div>
                <div className="title-sub"><span className="title-live-dot"/>&nbsp;Fantasy League · MyCircle11</div>
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <div className="season-badge">IPL 2026</div>
              <button
                onClick={() => setAdminView('login')}
                title="Admin Login"
                style={{
                  fontFamily:"'Rajdhani',sans-serif",fontWeight:800,fontSize:11,letterSpacing:1,
                  padding:'4px 10px',borderRadius:16,border:'1px solid rgba(231,76,60,0.5)',
                  background:'rgba(231,76,60,0.1)',color:'#e74c3c',cursor:'pointer',
                  textTransform:'uppercase',transition:'all 0.2s',whiteSpace:'nowrap'
                }}
              >🔐 Admin</button>
            </div>
          </div>
        </header>

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
          </div>
        </div>

        <MarketSentimentTicker matches={matches} />
        <TVNewsBulletin matches={matches} />

        {/* NAV */}
        <nav>
          <div className="nav-inner">
            {navItems.map(n => (
              <button key={n.id} className={`nav-btn${activeSection===n.id?' active':''}`} onClick={() => setActiveSection(n.id)}>{n.label}</button>
            ))}
          </div>
        </nav>

        {/* SECTIONS — use CSS display:none instead of unmounting for speed */}
        <div style={activeSection==='matchlog'    ? {} : {display:'none'}}><MatchLog    matches={matches} /></div>
        <div style={activeSection==='playerstats' ? {} : {display:'none'}}><PlayerStats matches={matches} h2hPlayers={h2hPlayers} setH2hPlayers={setH2hPlayers} /></div>
        <div style={activeSection==='leaderboard' ? {} : {display:'none'}}><Leaderboard matches={matches} /></div>
        <div style={activeSection==='graphs'      ? {} : {display:'none'}}><Graphs      matches={matches} /></div>

        <div className="pb-footer">&copy;&trade; Designed and Developed by <span>Prabhat Singh</span></div>
        {h2hPlayers.p1 && h2hPlayers.p2 && (
          <H2HModal p1={h2hPlayers.p1} p2={h2hPlayers.p2} matches={matches} onClose={() => setH2hPlayers({ p1: null, p2: null })} />
        )}
      </div>
    </>
  )
}
