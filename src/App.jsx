
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
  const currentProfits = PLAYERS.map(p => ({ name: p, profit: stats[p].totalWon - stats[p].totalInvested - (stats[p].sponsorGiven || 0) }));
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
      winsRank2: 0, // NEW: Track 2nd ranks
      sponsorGiven: 0,    // total ₹ this player sponsored to others
      sponseeReceived: 0,  // total ₹ this player received from sponsors
      // Streak tracking
      currentWinStreak: 0,
      currentLossStreak: 0,
      highestWinStreak: 0,
      highestLossStreak: 0,
      // Rank finish breakdown: rankFinishes[rank] = [{contestCount}]
      rankFinishes: { 1:[], 2:[], 3:[], 4:[], 5:[], 6:[], 7:[] }
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
        if (m.contest === 'yes' && pd.paid && !pd.sponsored) {
          s.activeDeposits += m.fee
        }
        return
      }

      const pts = pd.points || 0;
      const prevIndex = s.currentIndex;
      // Save this specifically to calculate the "Day Change" in the Ticker
      s.prevIndexSnapshot = prevIndex;

      //let newIndexBase = (pts * 0.4) + (prevIndex * 0.6);
      const isFirstMatch = s.matchesPlayed === 0;
      let newIndexBase = isFirstMatch
      ? pts // first match: listing price
      : (pts * 0.4) + (prevIndex * 0.6);
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
      s.currentIndex = isFirstMatch ? newIndexBase : newIndexBase * multiplier;

      
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
          // Sponsored players are counted as paid (for pool/prize purposes) but
          // their fee was covered by others — do NOT add to their own totalInvested
          if (!pd.sponsored) {
            if (cf[p] <= 0) s.totalInvested += m.fee; else cf[p] -= m.fee
          }

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
              // Streak tracking
              s.currentWinStreak++
              s.currentLossStreak = 0
              if (s.currentWinStreak > s.highestWinStreak) s.highestWinStreak = s.currentWinStreak
            } else {
              s.recentForm.push('loss')
              // Feature 4: any paid loss breaks streak reset tracking
              s.paidWinStreak.push(false)
              // Streak tracking
              s.currentLossStreak++
              s.currentWinStreak = 0
              if (s.currentLossStreak > s.highestLossStreak) s.highestLossStreak = s.currentLossStreak
            }

            // Rank finish breakdown: record which rank this player finished and how many paid players contested
            if (pRank >= 1 && pRank <= 7) {
              const contestCount = eligiblePaid.length
              if (!s.rankFinishes[pRank]) s.rankFinishes[pRank] = []
              s.rankFinishes[pRank].push(contestCount)
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

  // ── Sponsor / Sponsee aggregation ──────────────────────────
  matches.forEach(m => {
    if (m.contest !== 'yes') return
    PLAYERS.forEach(sponsee => {
      const pd = m.players?.[sponsee]
      if (!pd?.sponsored || !pd.sponsorDetails?.length) return
      // This player was sponsored — accumulate sponseeReceived
      const total = pd.sponsorDetails.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0)
      stats[sponsee].sponseeReceived = parseFloat((stats[sponsee].sponseeReceived + total).toFixed(2))
      // Each sponsor gets credit in sponsorGiven
      pd.sponsorDetails.forEach(d => {
        if (d.sponsor && stats[d.sponsor] !== undefined) {
          stats[d.sponsor].sponsorGiven = parseFloat(
            (stats[d.sponsor].sponsorGiven + (parseFloat(d.amount) || 0)).toFixed(2)
          )
        }
      })
    })
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
                          <div style={{fontSize:9}} className={pd.paid ? 'paid-yes' : 'paid-no'}>{pd.sponsored ? '🎁 Sponsored' : pd.paid ? '💰 Paid' : '❌ Unpaid'}</div>
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

                  {/* ── Active Deposit (shown below form) ── */}
                  {s.activeDeposits > 0 && (
                    <div style={{marginTop:6,background:'rgba(52,152,219,0.08)',border:'1px solid rgba(52,152,219,0.3)',borderRadius:8,padding:'5px 10px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{fontSize:11,color:'#3498db',fontWeight:'bold'}}>💰 Active Deposit</span>
                      <div style={{textAlign:'right'}}>
                        <span style={{fontSize:13,fontWeight:700,color:'#3498db'}}>₹{s.activeDeposits}</span>
                        <div style={{fontSize:'9px',color:'var(--text2)'}}>Match pending/ongoing</div>
                      </div>
                    </div>
                  )}
                  
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

                {/* ── Sponsor / Beneficiary info — above Streak Records ── */}
                {(s.sponsorGiven > 0 || s.sponseeReceived > 0) && (
                  <div style={{borderTop:'1px solid rgba(255,255,255,0.07)',paddingTop:8,marginTop:4,marginBottom:4}}>
                    {s.sponsorGiven > 0 && (
                      <div className="p-stat-row" style={{paddingBottom:4}}>
                        <span className="p-stat-label" style={{color:'#9b59b6'}}>🎁 Sponsor Amount</span>
                        <div style={{textAlign:'right'}}>
                          <span className="p-stat-val" style={{color:'#9b59b6'}}>₹{s.sponsorGiven.toFixed(2)}</span>
                          <div style={{fontSize:9,color:'var(--text2)'}}>Paid for others' fees</div>
                        </div>
                      </div>
                    )}
                    {s.sponseeReceived > 0 && (
                      <div className="p-stat-row">
                        <span className="p-stat-label" style={{color:'#3498db'}}>🤝 Beneficiary Amount</span>
                        <div style={{textAlign:'right'}}>
                          <span className="p-stat-val" style={{color:'#3498db'}}>₹{s.sponseeReceived.toFixed(2)}</span>
                          <div style={{fontSize:9,color:'var(--text2)'}}>Fee paid by sponsors</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Streak Stats ── */}
                {(s.highestWinStreak > 0 || s.highestLossStreak > 0) && (
                  <div style={{borderTop:'1px solid rgba(255,255,255,0.07)',paddingTop:8,marginTop:4,marginBottom:4}}>
                    <div style={{fontSize:9,letterSpacing:2,textTransform:'uppercase',color:'#8899bb',marginBottom:5}}>Streak Records</div>
                    <div style={{display:'flex',gap:8}}>
                      <div style={{flex:1,background:'rgba(46,204,113,0.08)',border:'1px solid rgba(46,204,113,0.2)',borderRadius:8,padding:'5px 8px',textAlign:'center'}}>
                        <div style={{fontSize:9,color:'#8899bb',letterSpacing:1}}>🔥 BEST WIN STREAK</div>
                        <div style={{fontSize:20,fontWeight:900,color:'#2ecc71',fontFamily:"'Orbitron',sans-serif",lineHeight:1.2}}>{s.highestWinStreak}</div>
                        <div style={{fontSize:9,color:'#8899bb'}}>in a row</div>
                      </div>
                      <div style={{flex:1,background:'rgba(231,76,60,0.08)',border:'1px solid rgba(231,76,60,0.2)',borderRadius:8,padding:'5px 8px',textAlign:'center'}}>
                        <div style={{fontSize:9,color:'#8899bb',letterSpacing:1}}>💀 WORST LOSS STREAK</div>
                        <div style={{fontSize:20,fontWeight:900,color:'#e74c3c',fontFamily:"'Orbitron',sans-serif",lineHeight:1.2}}>{s.highestLossStreak}</div>
                        <div style={{fontSize:9,color:'#8899bb'}}>in a row</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Rank Finish Breakdown ── */}
                {(() => {
                  const hasAnyRank = [1,2,3,4,5,6,7].some(r => s.rankFinishes[r]?.length > 0)
                  if (!hasAnyRank) return null
                  const rankEmoji = { 1:'🥇', 2:'🥈', 3:'🥉', 4:'4️⃣', 5:'5️⃣', 6:'6️⃣', 7:'7️⃣' }
                  const rankColor = { 1:'#FFD700', 2:'#C0C0C0', 3:'#CD7F32', 4:'#8899bb', 5:'#8899bb', 6:'#8899bb', 7:'#8899bb' }
                  return (
                    <div style={{borderTop:'1px solid rgba(255,255,255,0.07)',paddingTop:8,marginTop:4}}>
                      <div style={{fontSize:9,letterSpacing:2,textTransform:'uppercase',color:'#8899bb',marginBottom:6}}>Rank Finish History</div>
                      {[1,2,3,4,5,6,7].map(rank => {
                        const arr = s.rankFinishes[rank] || []
                        if (arr.length === 0) return null
                        // Group by contest count: { contestCount: occurrences }
                        const grouped = {}
                        arr.forEach(c => { grouped[c] = (grouped[c] || 0) + 1 })
                        const breakdown = Object.entries(grouped)
                          .sort((a,b) => b[0]-a[0])
                          .map(([cnt, times]) => `${times}× (${cnt} joined)`)
                          .join(',  ')
                        return (
                          <div key={rank} style={{
                            display:'flex', alignItems:'flex-start', gap:6,
                            padding:'4px 0', borderBottom:'1px solid rgba(255,255,255,0.04)',
                            fontSize:11
                          }}>
                            <span style={{minWidth:22, fontSize:13}}>{rankEmoji[rank]}</span>
                            <span style={{color:'#8899bb', minWidth:48}}>Rank {rank}:</span>
                            <span style={{color:rankColor[rank], fontWeight:700, minWidth:28}}>{arr.length}×</span>
                            <span style={{color:'var(--text2)', fontSize:10, lineHeight:1.4}}>[ {breakdown} ]</span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
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
      case 'wins':      return `${p.wins} Wins (🥇${p.winsRank1} 🥈${p.winsRank2})`;
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
      <div className="pd-title">🏆 {sortBy === 'profit' ? 'PnL' : sortBy === 'wins' ? 'WINS' : sortBy.toUpperCase()} LEADERS 🏆</div>
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
                {(() => {
                  switch(sortBy) {
                    case 'wins':      return <><AnimatedNumber value={p.wins} /> Wins</>
                    case 'winPct':    return <><AnimatedNumber value={p.winPct} decimals={1} />% Win</>
                    case 'totalWon':  return <>₹<AnimatedNumber value={p.totalWon} /></>
                    case 'avgPoints': return <><AnimatedNumber value={p.avgPoints} decimals={1} /> Pts</>
                    case 'roi':       return <><AnimatedNumber value={p.roi} />% ROI</>
                    default: {
                      const profit = p.totalWon - p.totalInvested
                      return <>{profit>=0?'+':'-'}₹<AnimatedNumber value={Math.abs(profit)} decimals={2} /></>
                    }
                  }
                })()}
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

// ─── COUNT-UP ANIMATION HOOK ──────────────────────────────────
function useCountUp(target, duration = 2000, active = true) {
  const [value, setValue] = useState(0)
  const frameRef = useRef(null)
  useEffect(() => {
    if (!active) { setValue(target); return }
    const start = performance.now()
    const from = 0
    const to = typeof target === 'number' ? target : parseFloat(target) || 0
    const tick = (now) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(from + (to - from) * eased)
      if (progress < 1) frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current) }
  }, [target, duration, active])
  return value
}

function AnimatedNumber({ value, prefix = '', suffix = '', decimals = 0, duration = 6000 }) {
  const animated = useCountUp(value, duration)
  return <>{prefix}{animated.toFixed(decimals)}{suffix}</>
}

// ─── LEADERBOARD ──────────────────────────────────────────
function Leaderboard({ matches }) {
  const [sortBy, setSortBy] = useState('profit')
  const stats = useMemo(() => computePlayerStats(matches), [matches])

  const sorted = useMemo(() => {
    return PLAYERS.map((p, i) => {
      const s = stats[p]
      // totalInvested (own cash) + sponsorGiven (cash given to others) = total money deployed
      const displayInvested = s.totalInvested + (s.sponsorGiven || 0)
      const profit    = s.totalWon - displayInvested
      const winPct    = s.paidContests > 0 ? (s.wins / s.paidContests) * 100 : 0
      const avgPoints = s.pointsMatchCount > 0 ? (s.totalPointsSum / s.pointsMatchCount) : 0
      const roi       = displayInvested > 0 ? (profit / displayInvested) * 100 : 0
      const streak    = computeCurrentStreak(s.paidWinStreak)
      return { ...s, name:p, color:COLORS[i], totalInvested: displayInvested, profit, winPct, avgPoints, roi, streak }
    }).sort((a, b) => {
      // Primary sort
      const diff = b[sortBy] - a[sortBy]
      if (diff !== 0) return diff
      // Tie-breaking: fewer matches played wins → better win% → higher avg points
      if (a.paidContests !== b.paidContests) return a.paidContests - b.paidContests
      if (b.winPct !== a.winPct) return b.winPct - a.winPct
      return b.avgPoints - a.avgPoints
    })
  }, [stats, sortBy])

  let _rank = 1, _lastVal = null
  const ranked = sorted.map((p, idx) => {
    const val = p[sortBy]
    if (idx === 0) { _lastVal = val; _rank = 1 }
    else if (val < _lastVal) { _rank++; _lastVal = val }
    return { ...p, rank: _rank }
  })

  const getDisplayData = (p) => {
    const getCC = (val) => val > 0 ? 'pos-bold' : val < 0 ? 'neg' : 'neu-grey'
    switch(sortBy) {
      case 'wins':      return { val:`${p.wins}`,                           label:'Wins',       cls:getCC(p.wins) }
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
    { id:'wins',      label:'Wins',    icon:'🏅' },
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
          {/* <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
            <span style={{fontSize:'9px',color:'var(--green)',fontWeight:800}}>LIVE</span>
            <div className="live-dot" style={{width:'6px',height:'6px'}}/>
          </div> */}
        </div>
        {/* Season Summary */}
        {/* <div className="season-summary" style={{marginTop:16}}>
          {[
            { icon:'🏏', label:'Matches Played', rawVal: totalMatches,  display: <AnimatedNumber value={totalMatches} />, sub:'completed' },
            { icon:'💰', label:'Total Pool',      rawVal: totalPool,     display: <><span>₹</span><AnimatedNumber value={totalPool} /></>, sub:'prize money' },
            { icon:'🏆', label:'Top Profit',      rawVal: topProfit,     display: topProfit > 0 ? <><span>+₹</span><AnimatedNumber value={topProfit} /></> : '₹0', sub:topProfitPlayer?.name||'—', accent:true },
            { icon:'🎯', label:'Season High',     rawVal: highScore,     display: highScore > 0 ? <><AnimatedNumber value={highScore} /><span> pts</span></> : '— pts', sub:highScorePlayer },
          ].map(s=>(
            <div key={s.label} className="ss-card" style={s.accent?{'--accent-tint':'rgba(46,204,113,0.08)'}:{}}>
              <span className="ss-icon">{s.icon}</span>
              <div className="ss-label">{s.label}</div>
              <div className="ss-val" style={s.accent?{color:'var(--green)'}:{}}>{s.display}</div>
              <div className="ss-sub">{s.sub}</div>
            </div>
          ))}
        </div> */}
        {/* Filter pills */}
        
      </div>

      <OlympicPodium sorted={ranked} sortBy={sortBy} />

      <div className="filter-grid-wrap">
          {filterOptions.map(f=>(
            <button key={f.id} onClick={()=>setSortBy(f.id)} className={`filter-pill ${sortBy===f.id?'active':''}`}>
              <span style={{fontSize:'16px'}}>{f.icon}</span>
              <span>{f.label}</span>
            </button>
          ))}
        </div>

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
                  {p.sponsorGiven > 0 && (
                    <div className="lb-stat">🎁 Sponsor Given: <span style={{color:'#9b59b6'}}>₹{p.sponsorGiven.toFixed(2)}</span></div>
                  )}
                  {p.sponseeReceived > 0 && (
                    <div className="lb-stat">🤝 Beneficiary: <span style={{color:'#3498db'}}>₹{p.sponseeReceived.toFixed(2)}</span></div>
                  )}
                </div>
                {/* Win Probability */}
                {(() => {
                  const totalPaid = p.paidContests || 0
                  const totalWins = p.wins || 0
                  if (totalPaid < 2 || totalWins === 0) return null
                  const everyN = Math.round(totalPaid / totalWins)
                  const winColor = everyN <= 2 ? '#2ecc71' : everyN <= 4 ? '#f5a623' : '#e74c3c'
                  return (
                    <div style={{marginTop:6,padding:'6px 10px',background:'rgba(255,255,255,0.03)',borderRadius:8,border:'1px solid rgba(255,255,255,0.06)',display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                      <span style={{fontSize:10,color:'var(--text2)',letterSpacing:1,textTransform:'uppercase',fontWeight:700}}>🎯 Win Probability:</span>
                      <span style={{fontSize:12,color:'#8899bb'}}>
                        Wins once every&nbsp;
                        <span style={{color:winColor,fontWeight:800,fontSize:14}}>{everyN}</span>
                        &nbsp;{everyN === 1 ? 'match' : 'matches'}
                        <span style={{fontSize:10,color:'var(--text2)',marginLeft:6}}>({totalWins}W / {totalPaid} played)</span>
                      </span>
                    </div>
                  )
                })()}
              </div>
              {/* Dynamic right side */}
              <div style={{textAlign:'right',minWidth:'90px',flexShrink:0}}>
                <div className={`lb-val-big ${display.cls}`}>
                  {(() => {
                    // Extract numeric part for animation
                    const raw = display.val
                    if (sortBy === 'wins') return <AnimatedNumber value={p.wins} />
                    if (sortBy === 'winPct') return <><AnimatedNumber value={p.winPct} decimals={1} />%</>
                    if (sortBy === 'totalWon') return <>₹<AnimatedNumber value={p.totalWon} /></>
                    if (sortBy === 'avgPoints') return <AnimatedNumber value={p.avgPoints} decimals={1} />
                    if (sortBy === 'roi') return <><AnimatedNumber value={p.roi} />%</>
                    // profit (default)
                    const profit = p.totalWon - p.totalInvested
                    return <>{profit>=0?'+':'-'}₹<AnimatedNumber value={Math.abs(profit)} /></>
                  })()}
                </div>
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
          //runningPrice = ((pts * 0.4) + (runningPrice * 0.6)) * multiplier
          const isFirstMatch = idx === 0
          runningPrice = isFirstMatch ? pts : ((pts * 0.4) + (runningPrice * 0.6)) * multiplier
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

// ─── PLAYER STOCK PRICE INDEX (CANDLESTICK) ───────────────────

// Pure SVG candlestick chart — no external lib needed
function CandlestickChart({ candles, color, width = 600, height = 260, mini = false }) {
  if (!candles || candles.length === 0) return <div style={{color:'#8899bb',textAlign:'center',padding:40}}>No match data yet.</div>

  const PAD = mini
    ? { top:10, right:10, bottom:28, left:36 }
    : { top:20, right:20, bottom:48, left:68 }
  const chartW = width - PAD.left - PAD.right
  const chartH = height - PAD.top - PAD.bottom

  const allPrices = candles.flatMap(c => [c.open, c.close, c.high, c.low]).filter(v => v != null)
  const minP = Math.min(...allPrices)
  const maxP = Math.max(...allPrices)
  // Add 5% padding top/bottom so candles don't touch edges
  const rawRange = maxP - minP || 10
  const padded = rawRange * 0.1
  const minPP = minP - padded
  const maxPP = maxP + padded
  const range = maxPP - minPP

  const toY = v => PAD.top + chartH - ((v - minPP) / range) * chartH

  // TIGHTER spacing: fixed slot width per candle, candle fills 60% of slot
  const slotW    = chartW / candles.length
  const candleW  = Math.max(mini ? 4 : 8, Math.min(mini ? 14 : 28, slotW * 0.62))
  const toX      = i => PAD.left + slotW * i + slotW / 2

  // Y grid lines
  const yTickCount = mini ? 4 : 6
  const yTicks = Array.from({length: yTickCount}, (_, i) => minPP + (range / (yTickCount - 1)) * i)
  const axisFontSize = mini ? 9 : 13

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{display:'block',maxWidth:width,margin:'0 auto'}}>
      {/* Y axis grid + labels */}
      {yTicks.map((val, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={toY(val)} x2={PAD.left+chartW} y2={toY(val)}
            stroke="#1e2d50" strokeWidth="1" strokeDasharray="3,5"/>
          <text x={PAD.left - 8} y={toY(val) + axisFontSize * 0.38}
            textAnchor="end" fontSize={axisFontSize} fill="#8899bb" fontFamily="Rajdhani,sans-serif" fontWeight="600">
            {Math.round(val)}
          </text>
        </g>
      ))}

      {/* Zero base line */}
      {minPP <= 0 && maxPP >= 0 && (
        <line x1={PAD.left} y1={toY(0)} x2={PAD.left+chartW} y2={toY(0)}
          stroke="#f5a62350" strokeWidth="1" strokeDasharray="6,3"/>
      )}

      {/* Candles */}
      {candles.map((c, i) => {
        const cx     = toX(i)
        const isSame = Math.abs(c.close - c.open) < 0.01
        const isUp   = c.close >= c.open
        const fill   = isSame ? '#888888' : isUp ? '#2ecc71' : '#e74c3c'
        const bodyTop    = toY(Math.max(c.open, c.close))
        const bodyBottom = toY(Math.min(c.open, c.close))
        const bodyH      = Math.max(2, bodyBottom - bodyTop)

        return (
          <g key={i}>
            {/* Wick */}
            <line x1={cx} y1={toY(c.high)} x2={cx} y2={toY(c.low)} stroke={fill} strokeWidth={mini?1:1.5}/>
            {/* Body */}
            <rect x={cx - candleW/2} y={bodyTop} width={candleW} height={bodyH}
              fill={fill} rx="2" opacity="0.9"/>
            {/* X axis label */}
            <text x={cx} y={height - (mini ? 6 : 10)} textAnchor="middle"
              fontSize={axisFontSize} fill="#8899bb" fontFamily="Rajdhani,sans-serif" fontWeight="600">
              {c.label}
            </text>
            <title>{c.label}: O={c.open?.toFixed(1)} H={c.high?.toFixed(1)} L={c.low?.toFixed(1)} C={c.close?.toFixed(1)}</title>
          </g>
        )
      })}

      {/* Dashed close-price trail */}
      {candles.length > 1 && (
        <polyline
          points={candles.map((c,i) => `${toX(i)},${toY(c.close)}`).join(' ')}
          fill="none" stroke={color+'66'} strokeWidth="1" strokeDasharray="3,4"
        />
      )}

      {/* Current price tag on last candle */}
      {!mini && candles.length > 0 && (
        <text x={toX(candles.length-1)} y={toY(candles[candles.length-1].close) - 10}
          textAnchor="middle" fontSize="12" fontWeight="700" fill={color} fontFamily="Orbitron,sans-serif">
          ₹{candles[candles.length-1].close?.toFixed(0)}
        </text>
      )}
    </svg>
  )
}

function PlayerStockIndex({ matches }) {
  const completedMatches = useMemo(() =>
    matches.filter(m => m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—'),
  [matches])

  const [selectedPlayer, setSelectedPlayer] = useState(PLAYERS[0])

  // Build OHLC candle data per player, one candle per match
  const allPlayerCandles = useMemo(() => {
    const result = {}
    PLAYERS.forEach((p, pi) => {
      let runningPrice = 100
      const candles = []

      completedMatches.forEach((m, idx) => {
        const pd = m.players[p]
        const open = runningPrice

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
          const pts = pd.points || 0
          let multiplier = 1.0
          if      (matchRank === 1) multiplier = 1.20
          else if (matchRank === 2) multiplier = 1.10
          else if (matchRank === 3) multiplier = 1.05
          else if (matchRank === 6) multiplier = 0.95
          else if (matchRank === 7) multiplier = 0.90
          //runningPrice = parseFloat((((pts * 0.4) + (open * 0.6)) * multiplier).toFixed(2))
          const isFirstMatch = idx === 0
          runningPrice = parseFloat((isFirstMatch ? pts : ((pts * 0.4) + (open * 0.6)) * multiplier).toFixed(2))
        }
        // For the candle: open = price before match, close = price after
        // High = max(open, close) * slight intra-match volatility factor
        // Low  = min(open, close) * slight intra-match volatility factor
        const close = runningPrice
        const change = Math.abs(close - open)
        const high = parseFloat(Math.max(open, close, open + change * 0.15).toFixed(2))
        const low  = parseFloat(Math.min(open, close, open - change * 0.15).toFixed(2))

        candles.push({ label:`M${m.matchno}`, open, high, low, close, matchno: m.matchno })
      })
      result[p] = candles
    })
    return result
  }, [completedMatches])

  const playerCandles = allPlayerCandles[selectedPlayer] || []
  const lastCandle    = playerCandles[playerCandles.length - 1]
  const prevCandle    = playerCandles[playerCandles.length - 2]
  const change        = lastCandle && prevCandle ? lastCandle.close - prevCandle.close : 0
  const changePct     = prevCandle && prevCandle.close > 0 ? ((change / prevCandle.close) * 100).toFixed(2) : '0.00'
  const isUp          = change > 0
  const isSame        = change === 0
  const playerColor   = COLORS[PLAYERS.indexOf(selectedPlayer)]

  // ATH / ATL
  const allCloses = playerCandles.map(c => c.close)
  const ath = allCloses.length ? Math.max(...allCloses) : 100
  const atl = allCloses.length ? Math.min(...allCloses) : 100

  return (
    <div className="section">
      <div className="sec-title" style={{paddingBottom:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',width:'100%',flexWrap:'wrap',gap:8}}>
          <span style={{fontSize:'22px',letterSpacing:'2px',fontFamily:'Bebas Neue'}}>📈 PLAYER STOCK PRICE INDEX</span>
          <span style={{fontSize:'10px',color:'var(--green)',fontWeight:800,letterSpacing:2}}>LIVE</span>
        </div>
        <div style={{fontSize:11,color:'#8899bb',marginTop:4,letterSpacing:0.5}}>
          One candlestick per match · Green = Index rose · Red = Index fell · Grey = No change
        </div>
      </div>

      {/* Player Selector Tabs */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:20}}>
        {PLAYERS.map((p, i) => {
          const candles = allPlayerCandles[p] || []
          const last = candles[candles.length-1]
          const prev = candles[candles.length-2]
          const chg = last && prev ? last.close - prev.close : 0
          const isActive = p === selectedPlayer
          return (
            <button
              key={p}
              onClick={() => setSelectedPlayer(p)}
              style={{
                fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:12, padding:'7px 14px',
                borderRadius:20, cursor:'pointer', transition:'all 0.2s',
                border: isActive ? `2px solid ${COLORS[i]}` : '1px solid rgba(255,255,255,0.1)',
                background: isActive ? `${COLORS[i]}22` : 'rgba(255,255,255,0.04)',
                color: isActive ? COLORS[i] : '#8899bb',
                display:'flex', alignItems:'center', gap:6
              }}
            >
              <span>{p}</span>
              {last && <span style={{fontSize:10,color: chg>0?'#2ecc71':chg<0?'#e74c3c':'#888'}}>
                {chg>0?'▲':chg<0?'▼':'─'} ₹{last.close.toFixed(0)}
              </span>}
            </button>
          )
        })}
      </div>

      {/* Selected Player Header */}
      <div style={{
        background:`linear-gradient(135deg,${playerColor}15,transparent)`,
        border:`1px solid ${playerColor}44`, borderRadius:16,
        padding:'16px 20px', marginBottom:20,
        display:'flex', alignItems:'center', gap:20, flexWrap:'wrap'
      }}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <img
            src={PLAYER_IMAGES[selectedPlayer]}
            alt={selectedPlayer}
            onError={e=>{e.target.style.display='none'}}
            style={{width:52,height:52,borderRadius:'50%',objectFit:'cover',objectPosition:'center top',border:`3px solid ${playerColor}`}}
          />
          <div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,letterSpacing:3,color:playerColor}}>{selectedPlayer}</div>
            <div style={{fontSize:10,color:'#8899bb',letterSpacing:1}}>PLAYER STOCK INDEX</div>
          </div>
        </div>
        <div style={{display:'flex',gap:16,flexWrap:'wrap',flex:1}}>
          {lastCandle && [
            { label:'CURRENT', val:`₹${lastCandle.close.toFixed(2)}`, color: playerColor },
            { label:'CHANGE', val:`${isUp?'▲':isSame?'─':'▼'} ${change>=0?'+':''}₹${change.toFixed(2)} (${changePct}%)`, color: isUp?'#2ecc71':isSame?'#888':'#e74c3c' },
            { label:'ATH 🚀', val:`₹${ath.toFixed(2)}`, color:'#2ecc71' },
            { label:'ATL 📉', val:`₹${atl.toFixed(2)}`, color:'#e74c3c' },
            { label:'MATCHES', val:playerCandles.length, color:'#8899bb' },
          ].map(({label,val,color}) => (
            <div key={label} style={{textAlign:'center',minWidth:64}}>
              <div style={{fontSize:9,color:'#8899bb',letterSpacing:2,textTransform:'uppercase'}}>{label}</div>
              <div style={{fontSize:13,fontWeight:800,color,fontFamily:"'Orbitron',sans-serif",marginTop:2}}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Candlestick Chart */}
      <div style={{
        background:'#05080f', borderRadius:16, padding:'16px 8px',
        border:`1px solid ${playerColor}33`, marginBottom:20, overflowX:'auto'
      }}>
        <CandlestickChart
          candles={playerCandles}
          color={playerColor}
          width={Math.max(520, playerCandles.length * 48 + 100)}
          height={300}
          mini={false}
        />
      </div>

      {/* Legend */}
      <div style={{display:'flex',gap:16,flexWrap:'wrap',marginBottom:20,fontSize:11,color:'#8899bb'}}>
        {[
          {color:'#2ecc71', label:'Green Candle — Index rose from previous match'},
          {color:'#e74c3c', label:'Red Candle — Index fell from previous match'},
          {color:'#888888', label:'Grey Candle — Index unchanged'},
        ].map(({color,label})=>(
          <span key={label} style={{display:'flex',alignItems:'center',gap:6}}>
            <span style={{display:'inline-block',width:12,height:12,background:color,borderRadius:2}}/>
            {label}
          </span>
        ))}
      </div>

      {/* All Players Summary Grid */}
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:14,letterSpacing:4,color:'var(--text2)',marginBottom:12}}>ALL PLAYERS — MINI CHARTS</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:16}}>
        {PLAYERS.map((p, pi) => {
          const candles = allPlayerCandles[p] || []
          const last = candles[candles.length-1]
          const prev = candles[candles.length-2]
          const chg = last && prev ? last.close - prev.close : 0
          const chgPct = prev && prev.close > 0 ? ((chg/prev.close)*100).toFixed(1) : '0.0'
          const pColor = COLORS[pi]
          const pAth = candles.length ? Math.max(...candles.map(c=>c.close)) : 100
          const pAtl = candles.length ? Math.min(...candles.map(c=>c.close)) : 100
          return (
            <div
              key={p}
              onClick={() => setSelectedPlayer(p)}
              style={{
                background: p===selectedPlayer?`${pColor}15`:'#0d1525',
                border: `1px solid ${p===selectedPlayer?pColor:'#1e2d50'}`,
                borderRadius:14, padding:'14px 14px 10px', cursor:'pointer',
                transition:'all 0.2s'
              }}
            >
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:2,color:pColor}}>{p}</div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:14,fontWeight:800,color:pColor,fontFamily:"'Orbitron',sans-serif"}}>
                    {last ? `₹${last.close.toFixed(0)}` : '₹100'}
                  </div>
                  <div style={{fontSize:10,color:chg>0?'#2ecc71':chg<0?'#e74c3c':'#888'}}>
                    {chg>0?'▲':chg<0?'▼':'─'} {chg>=0?'+':''}{chg.toFixed(1)} ({chgPct}%)
                  </div>
                </div>
              </div>
              <CandlestickChart candles={candles} color={pColor} width={320} height={110} mini={true} />
              <div style={{display:'flex',justifyContent:'space-between',marginTop:6,fontSize:9,color:'#8899bb'}}>
                <span>ATH: <span style={{color:'#2ecc71'}}>₹{pAth.toFixed(0)}</span></span>
                <span>ATL: <span style={{color:'#e74c3c'}}>₹{pAtl.toFixed(0)}</span></span>
                <span>{candles.length} matches</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Formula note */}
      <div style={{padding:'12px 16px',fontSize:'11px',color:'#8899bb',background:'rgba(0,0,0,0.2)',borderRadius:12,marginTop:16,border:'1px solid #1e2d50'}}>
        <b style={{color:'#f5a623'}}>Candle formula:</b> Open = previous match closing price · Close = new index price after match ·
        High/Low = intra-match price range estimation &nbsp;·&nbsp;
        <b style={{color:'#f5a623'}}>Index formula:</b> (40% Match Pts + 60% Prev Index) × Rank Multiplier &nbsp;·&nbsp;
        <b style={{color:'#f5a623'}}>Multipliers:</b> 1st +20% · 2nd +10% · 3rd +5% · 6th -5% · 7th -10%
        <div style={{marginTop:4,fontStyle:'italic',opacity:0.7}}>*Skipped matches = price frozen (flat open=close candle)</div>
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


// ─── FANTASY HELPERS ─────────────────────────────────────────
function getYouTubeEmbedId(url) {
  if (!url) return null
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
  if (shortMatch) return shortMatch[1]
  const longMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
  if (longMatch) return longMatch[1]
  return null
}

// Returns only upcoming (not yet started, not completed) matches that have fantasy data
function getUpcomingFantasyMatches(matches, fantasyData) {
  const now = new Date()
  return matches.filter(m => {
    const matchNo = parseInt(m.matchno)
    if (!fantasyData[matchNo]?.youtubeUrl) return false
    // Exclude completed matches
    const done = m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—'
    if (done) return false
    // Exclude matches that have already started
    const dt = getMatchDateTime(m)
    if (dt && dt <= now) return false
    return true
  })
}

// ─── PUBLIC FANTASY SUGGESTIONS (View Only) ──────────────────
function FantasySuggestions({ matches, fantasyData }) {
  const upcomingMatches = useMemo(
    () => getUpcomingFantasyMatches(matches, fantasyData),
    [matches, fantasyData]
  )

  const [selectedMatchNo, setSelectedMatchNo] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Auto-select the soonest upcoming match with fantasy data
  useEffect(() => {
    if (upcomingMatches.length > 0) {
      const sorted = [...upcomingMatches].sort((a, b) => {
        const da = getMatchDateTime(a), db = getMatchDateTime(b)
        return (da || 0) - (db || 0)
      })
      setSelectedMatchNo(parseInt(sorted[0].matchno))
    } else {
      setSelectedMatchNo(null)
    }
  }, [upcomingMatches])

  const matchRecord = selectedMatchNo ? matches.find(m => parseInt(m.matchno) === selectedMatchNo) : null
  const fd = selectedMatchNo ? fantasyData[selectedMatchNo] : null
  const embedId = fd ? getYouTubeEmbedId(fd.youtubeUrl) : null
  const teamsLabel = matchRecord?.teams || fd?.teams || `Match ${selectedMatchNo}`

  const iframeStyle = isFullscreen ? {
    position: 'fixed', inset: 0, zIndex: 9999,
    width: '100vw', height: '100vh',
    background: '#000'
  } : {}

  if (upcomingMatches.length === 0) {
    return (
      <div className="section">
        <div className="sec-title">🎯 Fantasy Tips & Match Preview</div>
        <div style={{
          background:'rgba(255,255,255,0.02)', border:'1px dashed rgba(255,255,255,0.1)',
          borderRadius:12, padding:48, textAlign:'center', color:'var(--text2)', fontSize:13, lineHeight:1.8
        }}>
          <div style={{fontSize:40, marginBottom:12}}>🏏</div>
          <div style={{fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:15, color:'var(--text)', marginBottom:6}}>
            No Upcoming Match Tips Available
          </div>
          <div style={{fontSize:12}}>
            Fantasy tips are shown only for upcoming matches.<br/>
            Once a match starts or is completed, tips are hidden automatically.<br/>
            <span style={{color:'var(--accent)'}}>Check back before the next match!</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="section">
      <div className="sec-title" style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8}}>
        <span>🎯 Fantasy Tips & Match Preview</span>
        <span style={{fontSize:11, color:'var(--text2)', fontFamily:"'Rajdhani',sans-serif", letterSpacing:1, fontWeight:400}}>
          Upcoming match preview · Build your winning team
        </span>
      </div>

      {/* Match selector — only upcoming matches */}
      {upcomingMatches.length > 1 && (
        <div style={{display:'flex', gap:8, flexWrap:'wrap', marginBottom:16}}>
          {[...upcomingMatches]
            .sort((a,b) => (getMatchDateTime(a)||0) - (getMatchDateTime(b)||0))
            .map(m => {
              const mn = parseInt(m.matchno)
              const isActive = selectedMatchNo === mn
              return (
                <button key={mn} onClick={() => setSelectedMatchNo(mn)} style={{
                  fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:12,
                  padding:'7px 14px', borderRadius:20, cursor:'pointer',
                  border: isActive ? '1.5px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)',
                  background: isActive ? 'rgba(245,166,35,0.18)' : 'rgba(255,255,255,0.04)',
                  color: isActive ? 'var(--accent)' : 'var(--text2)',
                  transition:'all 0.2s', whiteSpace:'nowrap',
                  boxShadow: isActive ? '0 0 12px rgba(245,166,35,0.2)' : 'none'
                }}>
                  #{mn} · {m.teams || fantasyData[mn]?.teams || `Match ${mn}`}
                </button>
              )
            })}
        </div>
      )}

      {selectedMatchNo && fd ? (
        <div style={{display:'flex', flexDirection:'column', gap:16}}>
          {/* Match Title Bar */}
          <div style={{
            background:'rgba(245,166,35,0.06)', border:'1px solid rgba(245,166,35,0.2)',
            borderRadius:10, padding:'10px 16px',
            display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8
          }}>
            <div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:3, color:'var(--accent)'}}>
                MATCH #{selectedMatchNo} — {teamsLabel.toUpperCase()}
              </div>
              {matchRecord?.date && (
                <div style={{fontSize:11, color:'var(--text2)'}}>
                  📅 {new Date(matchRecord.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
                  {matchRecord.matchTime ? ` · ${formatMatchTimeLabel(matchRecord.matchTime)}` : ''}
                </div>
              )}
            </div>
            <span style={{fontSize:11, background:'rgba(46,204,113,0.15)', color:'#2ecc71', border:'1px solid rgba(46,204,113,0.3)', borderRadius:6, padding:'4px 10px'}}>
              📺 Video Available
            </span>
          </div>

          {/* 2-col: video left, notes right */}
          <div style={{display:'grid', gridTemplateColumns:'minmax(0,1.2fr) minmax(0,1fr)', gap:16}} className="fantasy-grid">

            {/* LEFT: YouTube embed */}
            <div style={{display:'flex', flexDirection:'column', gap:8}}>
              <div style={{fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:13, color:'var(--text2)', letterSpacing:1, textTransform:'uppercase', display:'flex', alignItems:'center', gap:6}}>
                <span style={{background:'#e74c3c', color:'#fff', fontSize:9, padding:'2px 6px', borderRadius:4, fontWeight:900, letterSpacing:2}}>YOUTUBE</span>
                Pre-Match Analysis Video
              </div>

              {embedId ? (
                <div style={{
                  ...iframeStyle,
                  position:'relative', width:'100%',
                  paddingBottom: isFullscreen ? '0' : '56.25%',
                  height: isFullscreen ? '100%' : '0',
                  borderRadius: isFullscreen ? 0 : 12,
                  overflow:'hidden', background:'#000',
                  border:'1px solid rgba(231,76,60,0.3)',
                  boxShadow:'0 4px 24px rgba(0,0,0,0.5)'
                }}>
                  {isFullscreen && (
                    <button onClick={() => setIsFullscreen(false)} style={{
                      position:'absolute', top:12, right:12, zIndex:10000,
                      background:'rgba(0,0,0,0.7)', color:'#fff', border:'none',
                      borderRadius:8, padding:'8px 14px', cursor:'pointer',
                      fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:13
                    }}>✕ Exit Fullscreen</button>
                  )}
                  <iframe
                    style={{position: isFullscreen ? 'static' : 'absolute', top:0, left:0, width:'100%', height:'100%', border:'none'}}
                    src={`https://www.youtube.com/embed/${embedId}?rel=0&modestbranding=1`}
                    title={`Match ${selectedMatchNo} Preview`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div style={{background:'rgba(255,255,255,0.03)', border:'1px dashed rgba(255,255,255,0.12)', borderRadius:12, padding:30, textAlign:'center', color:'var(--text2)', fontSize:13}}>
                  ⚠️ Invalid YouTube URL.
                </div>
              )}

              {embedId && !isFullscreen && (
                <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                  <button onClick={() => setIsFullscreen(true)} style={{
                    fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:12,
                    padding:'7px 14px', borderRadius:8, cursor:'pointer',
                    border:'1px solid rgba(231,76,60,0.4)',
                    background:'rgba(231,76,60,0.12)', color:'#e74c3c',
                    display:'flex', alignItems:'center', gap:6
                  }}>⛶ Fullscreen</button>
                  <a href={fd.youtubeUrl} target="_blank" rel="noreferrer" style={{
                    fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:12,
                    padding:'7px 14px', borderRadius:8,
                    border:'1px solid rgba(255,255,255,0.1)',
                    background:'rgba(255,255,255,0.04)', color:'var(--text2)',
                    display:'flex', alignItems:'center', gap:6, textDecoration:'none'
                  }}>↗ Open on YouTube</a>
                </div>
              )}

              <div style={{background:'rgba(46,204,113,0.06)', border:'1px solid rgba(46,204,113,0.2)', borderRadius:8, padding:'10px 12px', fontSize:11, color:'#8899bb', lineHeight:1.7}}>
                <div style={{color:'#2ecc71', fontWeight:700, marginBottom:4}}>💡 Pro Tips for Team Building</div>
                <div>• Watch the full video for pitch report and expert picks</div>
                <div>• Read the Fantasy Notes on the right for key player recommendations</div>
                <div>• Focus on players in good form and against this specific opposition</div>
                <div>• Tap ⛶ Fullscreen for immersive mobile viewing</div>
              </div>
            </div>

            {/* RIGHT: Fantasy Notes (read only) */}
            <div style={{display:'flex', flexDirection:'column', gap:8}}>
              <div style={{fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:13, color:'var(--text2)', letterSpacing:1, textTransform:'uppercase', display:'flex', alignItems:'center', gap:6}}>
                <span style={{background:'linear-gradient(90deg,#f5a623,#e8531a)', color:'#000', fontSize:9, padding:'2px 6px', borderRadius:4, fontWeight:900, letterSpacing:2}}>TIPS</span>
                Fantasy Notes & Player Tips
              </div>

              <div style={{background:'rgba(16,24,48,0.85)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:14, minHeight:300, display:'flex', flexDirection:'column', gap:10, boxShadow:'inset 0 0 40px rgba(0,0,0,0.3)'}}>
                {fd.notes ? (
                  <div style={{flex:1, display:'flex', flexDirection:'column', gap:8}}>
                    <div style={{fontSize:10, color:'#2ecc71', background:'rgba(46,204,113,0.08)', borderRadius:6, padding:'4px 8px'}}>
                      ✅ Notes added by admin from video analysis
                    </div>
                    <div style={{fontSize:12, color:'var(--text)', lineHeight:1.85, whiteSpace:'pre-wrap', overflowY:'auto', maxHeight:500, paddingRight:4, fontFamily:"'Rajdhani',sans-serif"}}>
                      {fd.notes}
                    </div>
                    <div style={{borderTop:'1px solid rgba(255,255,255,0.07)', paddingTop:8, fontSize:10, color:'var(--text2)'}}>
                      ⚠️ Use as a guide — not guaranteed picks. Always check toss & playing XI.
                    </div>
                  </div>
                ) : (
                  <div style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, padding:20, textAlign:'center'}}>
                    <div style={{fontSize:36}}>📋</div>
                    <div style={{fontSize:13, color:'var(--text2)', lineHeight:1.6}}>
                      Fantasy notes not added yet for this match.<br/>
                      <span style={{fontSize:11, opacity:0.7}}>Check back closer to match time.</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <style>{`
        @media (max-width: 700px) {
          .fantasy-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
// ─── MATCH HIGHLIGHTS (Public View) ─────────────────────────
function getIgShortcode(url) {
  if (!url) return null
  const clean = url.split('?')[0].replace(/\/$/, '')
  const m = clean.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)
  return m ? m[1] : null
}

function getYtEmbedId(url) {
  if (!url) return null
  const s = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/)
  if (s) return s[1]
  const b = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
  if (b) return b[1]
  const v = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
  if (v) return v[1]
  return null
}

function detectMediaType(url) {
  if (!url) return 'unknown'
  if (url.includes('instagram.com')) return 'instagram'
  if (url.includes('youtube.com/shorts')) return 'youtube_shorts'
  if (url.includes('youtu.be') || url.includes('youtube.com')) return 'youtube'
  return 'unknown'
}

// Instagram cannot autoplay in cross-origin iframes — show a rich tap-to-open card instead
function InstagramReelCard({ item, index }) {
  const shortcode = getIgShortcode(item.url)
  const thumbUrl = shortcode ? `https://www.instagram.com/p/${shortcode}/media/?size=m` : null

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        background: 'linear-gradient(135deg, rgba(240,148,51,0.08), rgba(188,24,136,0.08))',
        border: '1px solid rgba(240,148,51,0.25)',
        borderRadius: 14, padding: '14px 16px',
        textDecoration: 'none', cursor: 'pointer',
        transition: 'all 0.2s',
      }}
    >
      {/* IG gradient icon */}
      <div style={{
        width: 52, height: 52, borderRadius: 14, flexShrink: 0,
        background: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 26, boxShadow: '0 4px 16px rgba(240,148,51,0.3)',
      }}>🎬</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "'Rajdhani',sans-serif", fontWeight: 800, fontSize: 14,
          color: '#f0f0f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.label || `Reel #${index + 1}`}
        </div>
        <div style={{ fontSize: 11, color: '#f09433', marginTop: 3, fontFamily: "'Rajdhani',sans-serif" }}>
          📸 Instagram Reel · Tap to watch
        </div>
        <div style={{ fontSize: 10, color: '#8899bb', marginTop: 2 }}>
          Opens in Instagram app or browser
        </div>
      </div>

      <div style={{
        flexShrink: 0, width: 36, height: 36, borderRadius: 10,
        background: 'linear-gradient(45deg,rgba(240,148,51,0.2),rgba(188,24,136,0.2))',
        border: '1px solid rgba(240,148,51,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16,
      }}>↗</div>
    </a>
  )
}

function YouTubeCard({ item, index }) {
  const [playing, setPlaying] = useState(false)
  const ytId = getYtEmbedId(item.url)
  const isShorts = (item.type || detectMediaType(item.url)) === 'youtube_shorts'

  if (!ytId) {
    return (
      <div style={{ background: 'rgba(231,76,60,0.07)', border: '1px solid rgba(231,76,60,0.2)', borderRadius: 14, padding: '14px 16px', color: 'var(--text2)', fontSize: 12 }}>
        ⚠️ Could not parse YouTube URL. <a href={item.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Open ↗</a>
      </div>
    )
  }

  if (!playing) {
    return (
      <div
        onClick={() => setPlaying(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 14,
          background: 'rgba(231,76,60,0.07)', border: '1px solid rgba(231,76,60,0.25)',
          borderRadius: 14, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.2s',
        }}
      >
        <div style={{
          width: 52, height: 52, borderRadius: 14, flexShrink: 0, background: '#e74c3c',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, boxShadow: '0 4px 16px rgba(231,76,60,0.35)',
        }}>▶</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "'Rajdhani',sans-serif", fontWeight: 800, fontSize: 14,
            color: '#f0f0f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{item.label || `Video #${index + 1}`}</div>
          <div style={{ fontSize: 11, color: '#e74c3c', marginTop: 3, fontFamily: "'Rajdhani',sans-serif" }}>
            {isShorts ? '▶ YouTube Short' : '▶ YouTube Video'} · Tap to play
          </div>
        </div>
        <div style={{
          flexShrink: 0, width: 36, height: 36, borderRadius: 10, background: 'rgba(231,76,60,0.15)',
          border: '1px solid rgba(231,76,60,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
        }}>▶</div>
      </div>
    )
  }

  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(231,76,60,0.3)', background: '#000' }}>
      <div style={{ padding: '8px 12px', background: 'rgba(231,76,60,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 13, color: '#f0f0f0' }}>
          {item.label || `Video #${index + 1}`}
        </span>
        <button onClick={() => setPlaying(false)} style={{ background: 'none', border: 'none', color: '#8899bb', cursor: 'pointer', fontSize: 12, fontFamily: "'Rajdhani',sans-serif" }}>✕ Close</button>
      </div>
      <div style={{
        position: 'relative', width: '100%',
        paddingBottom: isShorts ? '177.78%' : '56.25%',
        height: 0,
      }}>
        <iframe
          src={`https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1`}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={item.label || 'YouTube'}
        />
      </div>
    </div>
  )
}

function MatchHighlights({ matches, highlightsData }) {
  const matchesWithHighlights = useMemo(() => {
    return matches
      .filter(m => {
        const mn = parseInt(m.matchno)
        const clips = highlightsData[mn]
        return Array.isArray(clips) && clips.length > 0
      })
      .sort((a, b) => parseInt(b.matchno) - parseInt(a.matchno))
  }, [matches, highlightsData])

  const [selectedMatchNo, setSelectedMatchNo] = useState(null)

  useEffect(() => {
    if (matchesWithHighlights.length > 0) {
      setSelectedMatchNo(parseInt(matchesWithHighlights[0].matchno))
    } else {
      setSelectedMatchNo(null)
    }
  }, [matchesWithHighlights])

  // ── If no clips at all, render nothing (nav tab still shows but section is blank)
  if (matchesWithHighlights.length === 0) return null

  const selectedMatch = selectedMatchNo ? matches.find(m => parseInt(m.matchno) === selectedMatchNo) : null
  const clips = selectedMatchNo ? (highlightsData[selectedMatchNo] || []) : []
  const igClips = clips.filter(c => (c.type || detectMediaType(c.url)) === 'instagram')
  const ytClips = clips.filter(c => { const t = c.type || detectMediaType(c.url); return t === 'youtube' || t === 'youtube_shorts' })

  return (
    <div className="section">
      <div className="sec-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span>🎬 Match Highlights</span>
        <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: "'Rajdhani',sans-serif", letterSpacing: 1, fontWeight: 400 }}>
          Reels · Shorts · Key Moments
        </span>
      </div>

      {/* Match selector pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {matchesWithHighlights.map(m => {
          const mn = parseInt(m.matchno)
          const isActive = selectedMatchNo === mn
          const count = (highlightsData[mn] || []).length
          return (
            <button key={mn} onClick={() => setSelectedMatchNo(mn)} style={{
              fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12,
              padding: '7px 14px', borderRadius: 20, cursor: 'pointer',
              border: isActive ? '1.5px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)',
              background: isActive ? 'rgba(245,166,35,0.18)' : 'rgba(255,255,255,0.04)',
              color: isActive ? 'var(--accent)' : 'var(--text2)',
              transition: 'all 0.2s', whiteSpace: 'nowrap',
              boxShadow: isActive ? '0 0 12px rgba(245,166,35,0.2)' : 'none',
            }}>
              #{mn} · {m.teams || `Match ${mn}`}
              <span style={{ marginLeft: 6, fontSize: 10, background: isActive ? 'rgba(245,166,35,0.3)' : 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '1px 6px' }}>{count}</span>
            </button>
          )
        })}
      </div>

      {selectedMatch && clips.length > 0 && (
        <div>
          {/* Match title bar */}
          <div style={{
            background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.2)',
            borderRadius: 10, padding: '10px 16px', marginBottom: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
          }}>
            <div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 3, color: 'var(--accent)' }}>
                MATCH #{selectedMatchNo} — {(selectedMatch.teams || '').toUpperCase()}
              </div>
              {selectedMatch.date && (
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                  📅 {new Date(selectedMatch.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {selectedMatch.teamwon && selectedMatch.teamwon !== '—' ? ` · 🏆 ${selectedMatch.teamwon} won` : ''}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {igClips.length > 0 && <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'rgba(240,148,51,0.15)', color: '#f09433', border: '1px solid rgba(240,148,51,0.3)' }}>📸 {igClips.length} Reel{igClips.length !== 1 ? 's' : ''}</span>}
              {ytClips.length > 0 && <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'rgba(231,76,60,0.15)', color: '#e74c3c', border: '1px solid rgba(231,76,60,0.3)' }}>▶ {ytClips.length} Video{ytClips.length !== 1 ? 's' : ''}</span>}
            </div>
          </div>

          {/* Instagram Reels */}
          {igClips.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 800, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10, color: '#f09433' }}>
                📸 Instagram Reels
                <span style={{ fontSize: 10, fontWeight: 400, color: '#8899bb', textTransform: 'none', letterSpacing: 0, marginLeft: 8 }}>tap card to open in Instagram</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {igClips.map((item, i) => <InstagramReelCard key={i} item={item} index={i} />)}
              </div>
            </div>
          )}

          {/* YouTube */}
          {ytClips.length > 0 && (
            <div>
              <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 800, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10, color: '#e74c3c' }}>
                ▶ YouTube Shorts &amp; Videos
                <span style={{ fontSize: 10, fontWeight: 400, color: '#8899bb', textTransform: 'none', letterSpacing: 0, marginLeft: 8 }}>tap to play embedded</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ytClips.map((item, i) => <YouTubeCard key={i} item={item} index={i} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// HISTORIC SEASON DATA
// ─────────────────────────────────────────────────────────────
const HISTORIC_DATA = {
  ipl2024: [{"matchno":"8","date":"","teams":"SRHvsMI","teamwon":"SRH","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"9","date":"","teams":"RRvsDC","teamwon":"RR","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Swapnil","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":4,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":1,"points":0}}},{"matchno":"10","date":"","teams":"RCBvsKKR","teamwon":"KKR","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Swapnil","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":4,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":1,"points":0}}},{"matchno":"11","date":"","teams":"LSGvsPBKS","teamwon":"LSG","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"12","date":"","teams":"GTvsSRH","teamwon":"GT","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":3,"points":0}}},{"matchno":"13","date":"","teams":"DCvsCSK","teamwon":"DC","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":4,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":0}}},{"matchno":"14","date":"","teams":"MIvsRR","teamwon":"RR","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":4,"points":0}}},{"matchno":"15","date":"","teams":"RCBvsLSG","teamwon":"LSG","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":4,"points":0}}},{"matchno":"16","date":"","teams":"DCvsKKR","teamwon":"KKR","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":0}}},{"matchno":"17","date":"","teams":"GTvsPBKS","teamwon":"PBKS","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"18","date":"","teams":"SRHvsCSK","teamwon":"SRH","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":0}}},{"matchno":"19","date":"","teams":"RRvsRCB","teamwon":"RR","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":4,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":3,"points":0}}},{"matchno":"20","date":"","teams":"MIvsDC","teamwon":"MI","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":0}}},{"matchno":"21","date":"","teams":"LSGvsGT","teamwon":"LSG","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":0}}},{"matchno":"22","date":"","teams":"CSKvsKKR","teamwon":"CSK","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":4,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":0}}},{"matchno":"23","date":"","teams":"PBKSvsSRH","teamwon":"SRH","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":3,"points":0}}},{"matchno":"24","date":"","teams":"RRvsGT","teamwon":"GT","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":3,"points":0}}},{"matchno":"25","date":"","teams":"MIvsRCB","teamwon":"MI","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"26","date":"","teams":"LSGvsDC","teamwon":"DC","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"27","date":"","teams":"PBKSvsRR","teamwon":"RR","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"28","date":"","teams":"KKRvsLSG","teamwon":"KKR","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"29","date":"","teams":"MIvsCSK","teamwon":"CSK","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"30","date":"","teams":"RCBvsSRH","teamwon":"SRH","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":3,"points":0}}},{"matchno":"31","date":"","teams":"KKRvsRR","teamwon":"RR","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"32","date":"","teams":"GTvsDC","teamwon":"DC","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":4,"points":0}}},{"matchno":"33","date":"","teams":"PBKSvsMI","teamwon":"MI","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"34","date":"","teams":"LSGvsCSK","teamwon":"LSG","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":0}}},{"matchno":"35","date":"","teams":"DCvsSRH","teamwon":"SRH","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"36","date":"","teams":"KKRvsRCB","teamwon":"KKR","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"\u2014","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"37","date":"","teams":"PBKSvsGT","teamwon":"GT","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":4,"points":0}}},{"matchno":"38","date":"","teams":"MIvsRR","teamwon":"RR","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":null,"points":0}}},{"matchno":"39","date":"","teams":"CSKvsLSG","teamwon":"LSG","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":4,"points":0}}},{"matchno":"40","date":"","teams":"DCvsGT","teamwon":"DC","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":4,"points":0}}},{"matchno":"41","date":"","teams":"SRHvsRCB","teamwon":"RCB","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Swapnil","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":1,"points":0}}},{"matchno":"42","date":"","teams":"KKRvsPBKS","teamwon":"PBKS","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":3,"points":0}}},{"matchno":"43","date":"","teams":"DCvsMI","teamwon":"DC","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":0}}},{"matchno":"44","date":"","teams":"LSGvsRR","teamwon":"RR","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"45","date":"","teams":"GTvsRCB","teamwon":"RCB","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":3,"points":0}}},{"matchno":"46","date":"","teams":"CSKvsSRH","teamwon":"CSK","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"47","date":"","teams":"DCvsKKR","teamwon":"KKR","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Swapnil","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":1,"points":0}}},{"matchno":"48","date":"","teams":"MIvsLSG","teamwon":"LSG","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":4,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":0}}},{"matchno":"49","date":"","teams":"CSKvsPBKS","teamwon":"PBKS","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":0}}},{"matchno":"50","date":"","teams":"SRHvsRR","teamwon":"SRH","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Swapnil","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":1,"points":0}}},{"matchno":"51","date":"","teams":"MIvsKKR","teamwon":"KKR","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Swapnil","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":4,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":1,"points":0}}},{"matchno":"52","date":"","teams":"RCBvsGT","teamwon":"RCB","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":4,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":3,"points":0}}},{"matchno":"53","date":"","teams":"PBKSvsCSK","teamwon":"CSK","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":0}}},{"matchno":"54","date":"","teams":"LSGvsKKR","teamwon":"KKR","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"55","date":"","teams":"MIvsSRH","teamwon":"MI","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"56","date":"","teams":"DCvsRR","teamwon":"DC","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"57","date":"","teams":"SRHvsLSG","teamwon":"SRH","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":4,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":0}}},{"matchno":"58","date":"","teams":"PBKSvsRCB","teamwon":"RCB","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"59","date":"","teams":"GTvsCSK","teamwon":"GT","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":0}}},{"matchno":"60","date":"","teams":"KKRvsMI","teamwon":"KKR","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":3,"points":0}}},{"matchno":"61","date":"","teams":"CSKvsRR","teamwon":"CSK","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"62","date":"","teams":"RCBvsDC","teamwon":"RCB","matchTime":"Completed","contest":"yes","joined":"2/4","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"63","date":"","teams":"GTvsKKR","teamwon":"\u2014","matchTime":"Completed","contest":"no","joined":"0/4","fee":30,"fantasyWinner":"\u2014","payout":"Done","transferred":true,"players":{"Ashish":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":false,"paid":false,"rank":null,"points":0},"Sudhir":{"joined":false,"paid":false,"rank":null,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"64","date":"","teams":"DCvsLSG","teamwon":"DC","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"65","date":"","teams":"RRvsPBKS","teamwon":"PBKS","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Swapnil","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":4,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":1,"points":0}}},{"matchno":"66","date":"","teams":"SRHvsGT","teamwon":"\u2014","matchTime":"Completed","contest":"no","joined":"0/4","fee":30,"fantasyWinner":"\u2014","payout":"Done","transferred":true,"players":{"Ashish":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":false,"paid":false,"rank":null,"points":0},"Sudhir":{"joined":false,"paid":false,"rank":null,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"67","date":"","teams":"MIvsLSG","teamwon":"MI","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"68","date":"","teams":"RCBvsCSK","teamwon":"RCB","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"69","date":"","teams":"SRHvsPBKS","teamwon":"SRH","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":0}}},{"matchno":"70","date":"","teams":"RRvsKKR","teamwon":"\u2014","matchTime":"Completed","contest":"no","joined":"0/4","fee":30,"fantasyWinner":"\u2014","payout":"Done","transferred":true,"players":{"Ashish":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":false,"paid":false,"rank":null,"points":0},"Sudhir":{"joined":false,"paid":false,"rank":null,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"71","date":"","teams":"KKRvsSRH","teamwon":"KKR","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":4,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":0}}},{"matchno":"72","date":"","teams":"RRvsRCB","teamwon":"RR","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"73","date":"","teams":"SRHvsRR","teamwon":"SRH","matchTime":"Completed","contest":"yes","joined":"3/4","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"74","date":"","teams":"KKRvsSRH","teamwon":"KKR","matchTime":"Completed","contest":"yes","joined":"4/4","fee":50,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":4,"points":0}}}],
  ct2025: [{"matchno":"1","date":"","teams":"PAKvsNZ","teamwon":"NZ","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":4,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":3,"points":0}}},{"matchno":"2","date":"","teams":"BANvsIND","teamwon":"IND","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":null,"points":0}}},{"matchno":"3","date":"","teams":"RSAvsAFG","teamwon":"RSA","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":3,"points":0}}},{"matchno":"4","date":"","teams":"AUSvsENG","teamwon":"AUS","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":null,"points":0}}},{"matchno":"5","date":"","teams":"PAKvsIND","teamwon":"IND","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":4,"points":0}}},{"matchno":"6","date":"","teams":"BANvsNZ","teamwon":"NZ","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":null,"points":0}}},{"matchno":"7","date":"","teams":"AUSvsRSA","teamwon":"\u2014","matchTime":"Completed","contest":"no","joined":"0/4","fee":30,"fantasyWinner":"\u2014","payout":"Done","transferred":true,"players":{"Ashish":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":false,"paid":false,"rank":null,"points":0},"Sudhir":{"joined":false,"paid":false,"rank":null,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"8","date":"","teams":"AFGvsENG","teamwon":"AFG","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Swapnil","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":1,"points":0}}},{"matchno":"9","date":"","teams":"PAKvsBAN","teamwon":"\u2014","matchTime":"Completed","contest":"no","joined":"0/4","fee":30,"fantasyWinner":"\u2014","payout":"Done","transferred":true,"players":{"Ashish":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":false,"paid":false,"rank":null,"points":0},"Sudhir":{"joined":false,"paid":false,"rank":null,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"10","date":"","teams":"AFGvsAUS","teamwon":"\u2014","matchTime":"Completed","contest":"no","joined":"0/4","fee":30,"fantasyWinner":"\u2014","payout":"Done","transferred":true,"players":{"Ashish":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":false,"paid":false,"rank":null,"points":0},"Sudhir":{"joined":false,"paid":false,"rank":null,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"11","date":"","teams":"RSAvsENG","teamwon":"RSA","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":0}}},{"matchno":"12","date":"","teams":"NZvsIND","teamwon":"IND","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":3,"points":0}}},{"matchno":"13 (SF1)","date":"","teams":"INDvsAUS","teamwon":"IND","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":0}}},{"matchno":"14 (SF2)","date":"","teams":"RSAvsNZ","teamwon":"NZ","matchTime":"Completed","contest":"yes","joined":"4/4","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":null,"points":0}}},{"matchno":"15 (Final)","date":"","teams":"INDvsNZ","teamwon":"IND","matchTime":"Completed","contest":"yes","joined":"4/4","fee":50,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":0},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":0},"Swapnil":{"joined":true,"paid":true,"rank":null,"points":0}}}],
  ipl2025: [{"matchno":"1","date":"","teams":"KKRvsRCB","teamwon":"RCB","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Swapnil","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":638.5},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":821},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":715},"Swapnil":{"joined":true,"paid":true,"rank":1,"points":893}}},{"matchno":"2","date":"","teams":"SRHvsRR","teamwon":"SRH","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":682},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":995},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":753},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":886.5}}},{"matchno":"3","date":"","teams":"CSKvsMI","teamwon":"CSK","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":689.5},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":784.5},"Sudhir":{"joined":true,"paid":true,"rank":4,"points":671.5},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":752.5}}},{"matchno":"4","date":"","teams":"DCvsLSG","teamwon":"DC","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Swapnil","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":917.5},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":758},"Sudhir":{"joined":true,"paid":true,"rank":4,"points":714.5},"Swapnil":{"joined":true,"paid":true,"rank":1,"points":1036.5}}},{"matchno":"5","date":"","teams":"GTvsPBKS","teamwon":"PBKS","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":788.5},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":1010.5},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":819.5},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":930}}},{"matchno":"6","date":"","teams":"RRvsKKR","teamwon":"KKR","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":388.5},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":746},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":712},"Swapnil":{"joined":true,"paid":true,"rank":3,"points":708}}},{"matchno":"7","date":"","teams":"SRHvsLSG","teamwon":"LSG","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":889},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":750},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":916},"Swapnil":{"joined":true,"paid":true,"rank":3,"points":884}}},{"matchno":"8","date":"","teams":"CSKvsRCB","teamwon":"RCB","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":752},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":836.5},"Sudhir":{"joined":true,"paid":true,"rank":4,"points":648.5},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":820.5}}},{"matchno":"9","date":"","teams":"GTvsMI","teamwon":"GT","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":741},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":786},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":788.5},"Swapnil":{"joined":true,"paid":true,"rank":3,"points":759.5}}},{"matchno":"10","date":"","teams":"DCvsSRH","teamwon":"DC","matchTime":"Completed","contest":"yes","joined":"3/5","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":607.5},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":746},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":435.5},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"11","date":"","teams":"RRvsCSK","teamwon":"RR","matchTime":"Completed","contest":"yes","joined":"3/5","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":679},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":704.5},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":582.5},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"12","date":"","teams":"MIvsKKR","teamwon":"MI","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":430.5},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":368},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":480.5},"Swapnil":{"joined":true,"paid":true,"rank":4,"points":324.5}}},{"matchno":"13","date":"","teams":"LSGvsPBKS","teamwon":"PBKS","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Swapnil","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":531},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":576.5},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":561},"Swapnil":{"joined":true,"paid":true,"rank":1,"points":531}}},{"matchno":"14","date":"","teams":"RCBvsGT","teamwon":"GT","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":786.5},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":582},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":730},"Swapnil":{"joined":true,"paid":true,"rank":3,"points":667}}},{"matchno":"15","date":"","teams":"KKRvsSRH","teamwon":"KKR","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Swapnil","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":506.5},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":723},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":685},"Swapnil":{"joined":true,"paid":true,"rank":1,"points":748.5}}},{"matchno":"16","date":"","teams":"LSGvsMI","teamwon":"LSG","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":979.5},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":544},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":807.5},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":890.5}}},{"matchno":"17","date":"","teams":"CSKvsDC","teamwon":"DC","matchTime":"Completed","contest":"yes","joined":"3/5","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":676.5},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":485},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":457},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"18","date":"","teams":"PBKSvsRR","teamwon":"RR","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Swapnil","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":703},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":669.5},"Sudhir":{"joined":true,"paid":true,"rank":4,"points":532},"Swapnil":{"joined":true,"paid":true,"rank":1,"points":785.5}}},{"matchno":"19","date":"","teams":"CSKvsDC","teamwon":"DC","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":761.5},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":577.5},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":741},"Swapnil":{"joined":true,"paid":true,"rank":4,"points":534.5}}},{"matchno":"20","date":"","teams":"MIvsRCB","teamwon":"RCB","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":941.5},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":828},"Sudhir":{"joined":true,"paid":true,"rank":4,"points":790.5},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":896}}},{"matchno":"21","date":"","teams":"KKRvsLSG","teamwon":"LSG","matchTime":"Completed","contest":"yes","joined":"3/5","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":801},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":936},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":878.5},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"22","date":"","teams":"PBKSvsCSK","teamwon":"PBKS","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":377.5},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":848.5},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":398},"Swapnil":{"joined":true,"paid":true,"rank":4,"points":327.5}}},{"matchno":"23","date":"","teams":"GTvsRR","teamwon":"GT","matchTime":"Completed","contest":"yes","joined":"3/5","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":764.5},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":784.5},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":737},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"24","date":"","teams":"RCBvsDC","teamwon":"DC","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Swapnil","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":577},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":518.5},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":742.5},"Swapnil":{"joined":true,"paid":true,"rank":1,"points":776}}},{"matchno":"25","date":"","teams":"CSKvsKKR","teamwon":"KKR","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":814.5},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":892.5},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":599.5},"Swapnil":{"joined":true,"paid":true,"rank":4,"points":595}}},{"matchno":"26","date":"","teams":"LSGvsGT","teamwon":"LSG","matchTime":"Completed","contest":"yes","joined":"3/5","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":false,"paid":false,"rank":null,"points":0},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":878},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":1005.5},"Swapnil":{"joined":true,"paid":true,"rank":3,"points":877}}},{"matchno":"27","date":"","teams":"SRHvsPBKS","teamwon":"SRH","matchTime":"Completed","contest":"yes","joined":"3/5","fee":30,"fantasyWinner":"Swapnil","payout":"Done","transferred":true,"players":{"Ashish":{"joined":false,"paid":false,"rank":null,"points":0},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":1013},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":966.5},"Swapnil":{"joined":true,"paid":true,"rank":1,"points":1100}}},{"matchno":"28","date":"","teams":"RRvsRCB","teamwon":"RCB","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Swapnil","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":638.5},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":708.5},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":665},"Swapnil":{"joined":true,"paid":true,"rank":1,"points":741.5}}},{"matchno":"29","date":"","teams":"DCvsMI","teamwon":"DC","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":510},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":394.5},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":642.5},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":639.5}}},{"matchno":"30","date":"","teams":"LSGvsCSK","teamwon":"RCB","matchTime":"Completed","contest":"yes","joined":"3/5","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":611},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":652.5},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":662.5},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"31","date":"","teams":"PBKSvsKKR","teamwon":"PBKS","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Swapnil","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":663},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":618},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":684},"Swapnil":{"joined":true,"paid":true,"rank":1,"points":686}}},{"matchno":"32","date":"","teams":"DCvsRR","teamwon":"DC","matchTime":"Completed","contest":"yes","joined":"5/5","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":861.5},"Nilesh":{"joined":true,"paid":true,"rank":3,"points":781.5},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":576.5},"Sudhir":{"joined":true,"paid":true,"rank":5,"points":563},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":790.5}}},{"matchno":"33","date":"","teams":"MIvsSRH","teamwon":"MI","matchTime":"Completed","contest":"yes","joined":"5/5","fee":30,"fantasyWinner":"Swapnil","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":749},"Nilesh":{"joined":true,"paid":true,"rank":2,"points":769},"Prabhat":{"joined":true,"paid":true,"rank":5,"points":637},"Sudhir":{"joined":true,"paid":true,"rank":4,"points":738},"Swapnil":{"joined":true,"paid":true,"rank":1,"points":801}}},{"matchno":"34","date":"","teams":"RCBvsPBKS","teamwon":"PBKS","matchTime":"Completed","contest":"yes","joined":"5/5","fee":30,"fantasyWinner":"Swapnil","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":518},"Nilesh":{"joined":true,"paid":true,"rank":2,"points":521.5},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":516.5},"Sudhir":{"joined":true,"paid":true,"rank":5,"points":423.5},"Swapnil":{"joined":true,"paid":true,"rank":1,"points":580.5}}},{"matchno":"35","date":"","teams":"GTvsDC","teamwon":"GT","matchTime":"Completed","contest":"yes","joined":"5/5","fee":30,"fantasyWinner":"Nilesh","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":813.5},"Nilesh":{"joined":true,"paid":true,"rank":1,"points":905},"Prabhat":{"joined":true,"paid":true,"rank":5,"points":747},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":790.5},"Swapnil":{"joined":true,"paid":true,"rank":4,"points":742}}},{"matchno":"36","date":"","teams":"RRvsLSG","teamwon":"LSG","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Nilesh","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":535.5},"Nilesh":{"joined":true,"paid":true,"rank":1,"points":703},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":623.5},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":609.5},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"37","date":"","teams":"PBKSvsRCB","teamwon":"RCB","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Nilesh","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":600},"Nilesh":{"joined":true,"paid":true,"rank":1,"points":611},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":414},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":442},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"38","date":"","teams":"MIvsCSK","teamwon":"MI","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":936},"Nilesh":{"joined":true,"paid":true,"rank":2,"points":791},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":663.5},"Sudhir":{"joined":true,"paid":true,"rank":4,"points":553.5},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"39","date":"","teams":"KKRvsGT","teamwon":"GT","matchTime":"Completed","contest":"yes","joined":"5/5","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":773},"Nilesh":{"joined":true,"paid":true,"rank":4,"points":764.5},"Prabhat":{"joined":true,"paid":true,"rank":5,"points":752.5},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":925.5},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":876}}},{"matchno":"40","date":"","teams":"LSGvsDC","teamwon":"DC","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":684},"Nilesh":{"joined":true,"paid":true,"rank":2,"points":750.5},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":788.5},"Sudhir":{"joined":true,"paid":true,"rank":4,"points":626},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"41","date":"","teams":"SRHvsMI","teamwon":"MI","matchTime":"Completed","contest":"yes","joined":"5/5","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":650},"Nilesh":{"joined":true,"paid":true,"rank":4,"points":497},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":714.5},"Sudhir":{"joined":true,"paid":true,"rank":5,"points":480},"Swapnil":{"joined":true,"paid":true,"rank":3,"points":608}}},{"matchno":"42","date":"","teams":"RCBvsRR","teamwon":"RCB","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Swapnil","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":935.5},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":874},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":949},"Swapnil":{"joined":true,"paid":true,"rank":1,"points":987.5}}},{"matchno":"43","date":"","teams":"CSKvsSRH","teamwon":"SRH","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":661.5},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":806.5},"Sudhir":{"joined":true,"paid":true,"rank":4,"points":622},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":765}}},{"matchno":"44","date":"","teams":"KKRvsPBKS","teamwon":"\u2014","matchTime":"Completed","contest":"no","joined":"0/5","fee":30,"fantasyWinner":"\u2014","payout":"Done","transferred":true,"players":{"Ashish":{"joined":false,"paid":false,"rank":null,"points":0},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":false,"paid":false,"rank":null,"points":0},"Sudhir":{"joined":false,"paid":false,"rank":null,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"45","date":"","teams":"MIvsLSG","teamwon":"MI","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Nilesh","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":905},"Nilesh":{"joined":true,"paid":true,"rank":1,"points":938.5},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":788.5},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":926.5},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"46","date":"","teams":"DCvsRCB","teamwon":"RCB","matchTime":"Completed","contest":"yes","joined":"5/5","fee":30,"fantasyWinner":"Swapnil","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":713.5},"Nilesh":{"joined":true,"paid":true,"rank":2,"points":793},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":777},"Sudhir":{"joined":true,"paid":true,"rank":5,"points":539},"Swapnil":{"joined":true,"paid":true,"rank":1,"points":831.5}}},{"matchno":"47","date":"","teams":"RRvsGT","teamwon":"RR","matchTime":"Completed","contest":"yes","joined":"5/5","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":828},"Nilesh":{"joined":true,"paid":true,"rank":2,"points":842},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":829},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":867},"Swapnil":{"joined":true,"paid":true,"rank":5,"points":796}}},{"matchno":"48","date":"","teams":"DCvsKKR","teamwon":"KKR","matchTime":"Completed","contest":"yes","joined":"5/5","fee":30,"fantasyWinner":"Nilesh","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":1110.5},"Nilesh":{"joined":true,"paid":true,"rank":1,"points":1228.5},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":955},"Sudhir":{"joined":true,"paid":true,"rank":5,"points":916.5},"Swapnil":{"joined":true,"paid":true,"rank":4,"points":953.5}}},{"matchno":"49","date":"","teams":"CSKvsPBKS","teamwon":"PBKS","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":1079},"Nilesh":{"joined":true,"paid":true,"rank":2,"points":1059.5},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":782},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":858},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"50","date":"","teams":"RRvsMI","teamwon":"MI","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":1047.5},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":609},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":799.5},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":953.5}}},{"matchno":"51","date":"","teams":"GTvsSRH","teamwon":"GT","matchTime":"Completed","contest":"yes","joined":"5/5","fee":30,"fantasyWinner":"Swapnil","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":5,"points":990},"Nilesh":{"joined":true,"paid":true,"rank":2,"points":1055},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":992.5},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":1000},"Swapnil":{"joined":true,"paid":true,"rank":1,"points":1056}}},{"matchno":"52","date":"","teams":"RCBvsCSK","teamwon":"RCB","matchTime":"Completed","contest":"yes","joined":"5/5","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":750},"Nilesh":{"joined":true,"paid":true,"rank":2,"points":919},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":946},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":823},"Swapnil":{"joined":true,"paid":true,"rank":5,"points":736}}},{"matchno":"53","date":"","teams":"KKRvsRR","teamwon":"KKR","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":802},"Nilesh":{"joined":true,"paid":true,"rank":2,"points":923},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":776.5},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":931},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"54","date":"","teams":"PBKSvsLSG","teamwon":"PBKS","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":673.5},"Nilesh":{"joined":true,"paid":true,"rank":2,"points":791.5},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":524.5},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":803.5},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"55","date":"","teams":"SRHvsDC","teamwon":"\u2014","matchTime":"Completed","contest":"no","joined":"0/5","fee":30,"fantasyWinner":"\u2014","payout":"Done","transferred":true,"players":{"Ashish":{"joined":false,"paid":false,"rank":null,"points":0},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":false,"paid":false,"rank":null,"points":0},"Sudhir":{"joined":false,"paid":false,"rank":null,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"56","date":"","teams":"MIvsGT","teamwon":"MI","matchTime":"Completed","contest":"yes","joined":"5/5","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":714.5},"Nilesh":{"joined":true,"paid":true,"rank":4,"points":638.5},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":661},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":688.5},"Swapnil":{"joined":true,"paid":true,"rank":5,"points":597.5}}},{"matchno":"57","date":"","teams":"KKRvsCSK","teamwon":"KKR","matchTime":"Completed","contest":"yes","joined":"5/5","fee":30,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":1036.5},"Nilesh":{"joined":true,"paid":true,"rank":3,"points":754.5},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":828.5},"Sudhir":{"joined":true,"paid":true,"rank":5,"points":715.5},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":904.5}}},{"matchno":"58","date":"","teams":"RCBvsKKR","teamwon":"\u2014","matchTime":"Completed","contest":"no","joined":"0/5","fee":30,"fantasyWinner":"\u2014","payout":"Done","transferred":true,"players":{"Ashish":{"joined":false,"paid":false,"rank":null,"points":0},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":false,"paid":false,"rank":null,"points":0},"Sudhir":{"joined":false,"paid":false,"rank":null,"points":0},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"59","date":"","teams":"RRvsPBKS","teamwon":"PBKS","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":577.5},"Nilesh":{"joined":true,"paid":true,"rank":3,"points":665},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":1011},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":804.5},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"60","date":"","teams":"DCvsGT","teamwon":"GT","matchTime":"Completed","contest":"yes","joined":"3/5","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":false,"paid":false,"rank":null,"points":0},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":954},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":1100},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":1033}}},{"matchno":"61","date":"","teams":"LSGvsSRH","teamwon":"SRH","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":false,"paid":false,"rank":null,"points":0},"Nilesh":{"joined":true,"paid":true,"rank":3,"points":879.5},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":909.5},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":958},"Swapnil":{"joined":true,"paid":true,"rank":4,"points":789.5}}},{"matchno":"62","date":"","teams":"CSKvsRR","teamwon":"RR","matchTime":"Completed","contest":"yes","joined":"5/5","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":711.5},"Nilesh":{"joined":true,"paid":true,"rank":5,"points":613},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":619},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":785.5},"Swapnil":{"joined":true,"paid":true,"rank":3,"points":671}}},{"matchno":"63","date":"","teams":"MIvsDC","teamwon":"MI","matchTime":"Completed","contest":"yes","joined":"5/5","fee":30,"fantasyWinner":"Nilesh","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":765.5},"Nilesh":{"joined":true,"paid":true,"rank":1,"points":775.5},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":657.5},"Sudhir":{"joined":true,"paid":true,"rank":5,"points":607.5},"Swapnil":{"joined":true,"paid":true,"rank":4,"points":628.5}}},{"matchno":"64","date":"","teams":"GTvsLSG","teamwon":"LSG","matchTime":"Completed","contest":"yes","joined":"5/5","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":881.5},"Nilesh":{"joined":true,"paid":true,"rank":4,"points":876},"Prabhat":{"joined":true,"paid":true,"rank":5,"points":834},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":923.5},"Swapnil":{"joined":true,"paid":true,"rank":2,"points":888}}},{"matchno":"65","date":"","teams":"RCBvsSRH","teamwon":"SRH","matchTime":"Completed","contest":"yes","joined":"5/5","fee":30,"fantasyWinner":"Swapnil","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":920},"Nilesh":{"joined":true,"paid":true,"rank":2,"points":954},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":948},"Sudhir":{"joined":true,"paid":true,"rank":5,"points":781.5},"Swapnil":{"joined":true,"paid":true,"rank":1,"points":1043}}},{"matchno":"66","date":"","teams":"PBKSvsSC","teamwon":"DC","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Nilesh","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":791},"Nilesh":{"joined":true,"paid":true,"rank":1,"points":828.5},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":803},"Sudhir":{"joined":true,"paid":true,"rank":4,"points":657},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"67","date":"","teams":"GTvsCSK","teamwon":"CSK","matchTime":"Completed","contest":"yes","joined":"2/5","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":false,"paid":false,"rank":null,"points":0},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":883.5},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":907},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"68","date":"","teams":"SRHvsKKR","teamwon":"SRH","matchTime":"Completed","contest":"yes","joined":"3/5","fee":30,"fantasyWinner":"Sudhir","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":3,"points":862.5},"Nilesh":{"joined":false,"paid":false,"rank":null,"points":0},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":930},"Sudhir":{"joined":true,"paid":true,"rank":1,"points":944},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"69","date":"","teams":"PBKSvsMI","teamwon":"PBKS","matchTime":"Completed","contest":"yes","joined":"4/5","fee":30,"fantasyWinner":"Nilesh","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":849},"Nilesh":{"joined":true,"paid":true,"rank":1,"points":892.5},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":678},"Sudhir":{"joined":true,"paid":true,"rank":4,"points":584},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"70","date":"","teams":"LSGvsRCB","teamwon":"RCB","matchTime":"Completed","contest":"yes","joined":"5/5","fee":30,"fantasyWinner":"Prabhat","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":4,"points":607.5},"Nilesh":{"joined":true,"paid":true,"rank":2,"points":968.5},"Prabhat":{"joined":true,"paid":true,"rank":1,"points":969},"Sudhir":{"joined":true,"paid":true,"rank":5,"points":568.5},"Swapnil":{"joined":true,"paid":true,"rank":3,"points":633.5}}},{"matchno":"71","date":"","teams":"PBKSvsRCB","teamwon":"RCB","matchTime":"Completed","contest":"yes","joined":"4/5","fee":50,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":605},"Nilesh":{"joined":true,"paid":true,"rank":2,"points":599},"Prabhat":{"joined":true,"paid":true,"rank":4,"points":430},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":443},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"72","date":"","teams":"GTvsMI","teamwon":"MI","matchTime":"Completed","contest":"yes","joined":"4/5","fee":50,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":906.5},"Nilesh":{"joined":true,"paid":true,"rank":4,"points":707},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":761.5},"Sudhir":{"joined":true,"paid":true,"rank":2,"points":899.5},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"73","date":"","teams":"PBKSvsMI","teamwon":"PBKS","matchTime":"Completed","contest":"yes","joined":"4/5","fee":50,"fantasyWinner":"Ashish","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":1,"points":867},"Nilesh":{"joined":true,"paid":true,"rank":4,"points":740},"Prabhat":{"joined":true,"paid":true,"rank":2,"points":835},"Sudhir":{"joined":true,"paid":true,"rank":3,"points":802},"Swapnil":{"joined":false,"paid":false,"rank":null,"points":0}}},{"matchno":"74","date":"","teams":"RCBvsPBKS","teamwon":"RCB","matchTime":"Completed","contest":"yes","joined":"5/5","fee":50,"fantasyWinner":"Nilesh","payout":"Done","transferred":true,"players":{"Ashish":{"joined":true,"paid":true,"rank":2,"points":724},"Nilesh":{"joined":true,"paid":true,"rank":1,"points":740.5},"Prabhat":{"joined":true,"paid":true,"rank":3,"points":679.5},"Sudhir":{"joined":true,"paid":true,"rank":5,"points":657},"Swapnil":{"joined":true,"paid":true,"rank":4,"points":671}}}]
}

const SEASON_CONFIG = {
  ipl2026: {
    id: 'ipl2026',
    label: '🏏 IPL 2026',
    sublabel: 'Current Season · Live',
    players: ['Ashish','Kalpesh','Nilesh','Prabhat','Pritam','Sudhir','Swapnil'],
    colors: ['#f5a623','#3498db','#2ecc71','#e74c3c','#e056fd','#00cec9','#fd9644'],
    themeAccent: '#f5a623',
    themeBg: '#05080f',
    themeCard: '#0d1525',
    badge: 'IPL 2026',
    isLive: true,
  },
  ipl2025: {
    id: 'ipl2025',
    label: '🏏 IPL 2025',
    sublabel: 'Season Complete',
    players: ['Ashish','Nilesh','Prabhat','Sudhir','Swapnil'],
    colors: ['#f5a623','#3498db','#2ecc71','#e74c3c','#fd9644'],
    themeAccent: '#fd9644',
    themeBg: '#080a05',
    themeCard: '#121805',
    badge: 'IPL 2025',
    isLive: false,
  },
  ct2025: {
    id: 'ct2025',
    label: '🏆 Champions Trophy 2025',
    sublabel: 'Season Complete',
    players: ['Ashish','Prabhat','Sudhir','Swapnil'],
    colors: ['#f5a623','#e74c3c','#00cec9','#fd9644'],
    themeAccent: '#00cec9',
    themeBg: '#050a0d',
    themeCard: '#0a1520',
    badge: 'CT 2025',
    isLive: false,
  },
  ipl2024: {
    id: 'ipl2024',
    label: '🏏 IPL 2024',
    sublabel: 'Season Complete',
    players: ['Ashish','Prabhat','Sudhir','Swapnil'],
    colors: ['#f5a623','#e74c3c','#2ecc71','#9b59b6'],
    themeAccent: '#9b59b6',
    themeBg: '#08050d',
    themeCard: '#120a1a',
    badge: 'IPL 2024',
    isLive: false,
  },
}

// ─────────────────────────────────────────────────────────────
// HISTORIC PRIZE CALCULATOR (rank-based, no points needed)
// ─────────────────────────────────────────────────────────────
function calculateHistoricPrizes(m, seasonId) {
  const paidPlayers = Object.keys(m.players).filter(p => m.players[p]?.joined && m.players[p]?.paid)
  const paidCount = paidPlayers.length
  const fee = parseFloat(m.fee) || 0
  const matchno = parseInt(m.matchno) || 0
  
  // Build rank map from stored rank data
  let paidRanks = {}
  paidPlayers.forEach(p => {
    const r = m.players[p]?.rank
    if (r) paidRanks[p] = r
  })
  
  // Prize pool logic
  let pot1 = 0, pot2 = 0, winnerCountLimit = 1
  
  if (seasonId === 'ipl2024' || seasonId === 'ct2025') {
    // All matches: single winner. Pool = winner's winnings stored in data
    // Fee * paid = pool (54=2paid, 81=3paid, 108=4paid, 180=m74)
    pot1 = fee === 50 ? 180 : (paidCount === 2 ? 54 : paidCount === 3 ? 81 : 108)
    winnerCountLimit = 1
  } else if (seasonId === 'ipl2025') {
    if (matchno >= 71) {
      pot1 = paidCount >= 5 ? 225 : 180
    } else {
      pot1 = paidCount === 2 ? 54 : paidCount === 3 ? 81 : paidCount === 4 ? 108 : paidCount === 5 ? 135 : fee * paidCount
    }
    winnerCountLimit = 1
  }
  
  return {
    1: pot1,
    2: pot2,
    winnerCount: winnerCountLimit,
    winnerCountLimit,
    totalPool: pot1 + pot2,
    _paidRanks: paidRanks,
    _r1Count: 1,
    _r2Count: 0,
  }
}

// ─────────────────────────────────────────────────────────────
// HISTORIC PLAYER STATS COMPUTER
// ─────────────────────────────────────────────────────────────
function computeHistoricPlayerStats(matches, players, seasonId) {
  let stats = {}
  players.forEach(p => {
    stats[p] = {
      matchesPlayed:0, contested:0, paidContests:0, wins:0,
      totalInvested:0, totalWon:0, bestPoints:0, carryFwd:0,
      totalPointsSum:0, pointsMatchCount:0, recentForm:[],
      activeDeposits:0, paidWinStreak:[], hasHatTrick:false,
      ath:0, atl:0, pnlHistory:[], prevIndexSnapshot:100, currentIndex:100,
      indexATH:100, indexATL:null,
      winsRank1:0, winsRank2:0,
      sponsorGiven:0, sponseeReceived:0,
      currentWinStreak:0, currentLossStreak:0,
      highestWinStreak:0, highestLossStreak:0,
      rankFinishes:{1:[],2:[],3:[],4:[],5:[]}
    }
  })

  matches.forEach(m => {
    const isComplete = m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—'
    if (!isComplete || m.contest !== 'yes') return

    const prizes = calculateHistoricPrizes(m, seasonId)
    const paidRanks = prizes._paidRanks || {}

    players.forEach(p => {
      const pd = m.players[p]
      if (!pd || !pd.joined) return
      const s = stats[p]
      s.matchesPlayed++
      s.contested++
      if (!pd.paid) return
      s.paidContests++
      s.totalInvested += m.fee

      if (pd.points > 0) {
        s.totalPointsSum += pd.points
        s.pointsMatchCount++
        if (pd.points > s.bestPoints) s.bestPoints = pd.points
      }

      const pRank = paidRanks[p] || 0
      const isR1 = pRank === 1
      const isR2 = pRank === 2 && prizes.winnerCountLimit === 2

      // Index calc: if points available use it, else use rank-based pseudo
      const pts = pd.points || (pRank === 1 ? 800 : pRank === 2 ? 650 : pRank === 3 ? 550 : pRank === 4 ? 450 : 400)
      const prevIndex = s.currentIndex
      s.prevIndexSnapshot = prevIndex
      const isFirst = s.matchesPlayed === 1
      let mult = 1.0
      if (pRank===1) mult=1.20; else if(pRank===2) mult=1.10; else if(pRank===3) mult=1.05; else if(pRank===4||pRank===5) mult=1.00
      s.currentIndex = isFirst ? pts : ((pts*0.4)+(prevIndex*0.6))*mult
      if (s.currentIndex > s.indexATH) s.indexATH = s.currentIndex
      if (s.indexATL === null || s.currentIndex < s.indexATL) s.indexATL = s.currentIndex

      if (isR1 || isR2) {
        s.wins++
        if (isR1) { s.winsRank1++; s.totalWon += prizes[1] }
        if (isR2) { s.winsRank2++; s.totalWon += prizes[2] }
        s.recentForm.push(isR1 ? 'win1' : 'win2')
        s.paidWinStreak.push(true)
        s.currentWinStreak++; s.currentLossStreak=0
        if (s.currentWinStreak > s.highestWinStreak) s.highestWinStreak = s.currentWinStreak
      } else {
        s.recentForm.push('loss')
        s.paidWinStreak.push(false)
        s.currentLossStreak++; s.currentWinStreak=0
        if (s.currentLossStreak > s.highestLossStreak) s.highestLossStreak = s.currentLossStreak
      }
      const currentPnL = s.totalWon - s.totalInvested
      s.pnlHistory.push(currentPnL)
      if (currentPnL > s.ath) s.ath = currentPnL
      if (currentPnL < s.atl) s.atl = currentPnL
      if (pRank >= 1 && pRank <= 5) {
        const cc = Object.keys(paidRanks).length
        if (!s.rankFinishes[pRank]) s.rankFinishes[pRank] = []
        s.rankFinishes[pRank].push(cc)
      }
    })
  })

  players.forEach(p => {
    stats[p].recentForm = stats[p].recentForm.slice(-5)
    stats[p].totalWon = parseFloat(stats[p].totalWon.toFixed(2))
    const streak = stats[p].paidWinStreak
    for (let i = 0; i <= streak.length-3; i++) {
      if (streak[i]&&streak[i+1]&&streak[i+2]) { stats[p].hasHatTrick=true; break }
    }
  })
  return stats
}

// ─────────────────────────────────────────────────────────────
// SEASON SELECTOR BAR
// ─────────────────────────────────────────────────────────────
function SeasonSelectorBar({ activeSeason, onSeasonChange }) {
  const seasons = Object.values(SEASON_CONFIG)
  return (
    <div style={{
      background:'linear-gradient(90deg,#030508,#080d18,#030508)',
      borderBottom:'1px solid rgba(255,255,255,0.07)',
      padding:'6px 12px',
      display:'flex', alignItems:'center', gap:8, overflowX:'auto',
      flexWrap:'wrap',
    }}>
      <span style={{fontSize:9,letterSpacing:3,textTransform:'uppercase',color:'#8899bb',whiteSpace:'nowrap',marginRight:4}}>SEASON:</span>
      {seasons.map(s => {
        const isActive = s.id === activeSeason
        return (
          <button
            key={s.id}
            onClick={() => onSeasonChange(s.id)}
            style={{
              fontFamily:"'Rajdhani',sans-serif", fontWeight:800, fontSize:11,
              padding:'5px 12px', borderRadius:20, cursor:'pointer',
              border: isActive ? `1.5px solid ${s.themeAccent}` : '1px solid rgba(255,255,255,0.1)',
              background: isActive ? `${s.themeAccent}22` : 'rgba(255,255,255,0.04)',
              color: isActive ? s.themeAccent : '#8899bb',
              letterSpacing: 0.5, whiteSpace:'nowrap', transition:'all 0.2s',
              display:'flex', alignItems:'center', gap:5,
            }}
          >
            {s.label}
            {s.isLive && <span style={{
              fontSize:7, padding:'1px 5px', borderRadius:8,
              background:'rgba(46,204,113,0.2)', color:'#2ecc71',
              border:'1px solid rgba(46,204,113,0.4)', letterSpacing:1
            }}>LIVE</span>}
            {!s.isLive && <span style={{
              fontSize:7, padding:'1px 5px', borderRadius:8,
              background:'rgba(136,153,187,0.1)', color:'#8899bb',
              border:'1px solid rgba(136,153,187,0.2)', letterSpacing:1
            }}>DONE</span>}
          </button>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// HISTORIC MATCH LOG
// ─────────────────────────────────────────────────────────────
function HistoricMatchLog({ matches, seasonPlayers, seasonConfig }) {
  const { themeAccent, themeCard } = seasonConfig
  const [currentPage, setCurrentPage] = useState(1)
  const ROWS = 8
  const totalPages = Math.ceil(matches.length / ROWS)

  const finished = matches.filter(m => m.teamwon && m.teamwon !== '—')
  const totalPool = finished.filter(m=>m.contest==='yes').reduce((acc, m) => {
    const paidCount = Object.values(m.players).filter(p=>p.joined&&p.paid).length
    const fee = m.fee
    if (m.matchno==='74'&&seasonConfig.id==='ipl2024') return acc+180
    if (seasonConfig.id==='ipl2025'&&parseInt(m.matchno)>=71) {
      return acc + (paidCount>=5?225:180)
    }
    return acc + (paidCount===2?54:paidCount===3?81:paidCount===4?108:paidCount===5?135:fee*paidCount)
  }, 0)
  const totalContests = finished.filter(m=>m.contest==='yes').length
  const paginatedMatches = matches.slice((currentPage-1)*ROWS, currentPage*ROWS)

  return (
    <div className="section">
      <div className="sec-title">Match Log</div>
      <div className="totals-bar">
        <div className="total-chip"><div className="total-chip-label">Total Matches</div><div className="total-chip-val">{matches.length}</div></div>
        <div className="total-chip"><div className="total-chip-label">Contests Played</div><div className="total-chip-val">{totalContests}</div></div>
        <div className="total-chip"><div className="total-chip-label">Total Pool</div><div className="total-chip-val">₹{totalPool.toFixed(0)}</div></div>
        <div className="total-chip" style={{borderColor:'rgba(46,204,113,0.3)'}}>
          <div className="total-chip-label">All Payouts</div>
          <div className="total-chip-val" style={{color:'#2ecc71'}}>✓ Done</div>
        </div>
      </div>
      {totalPages > 1 && (
        <div style={paginationStyle.wrap}>
          <span style={paginationStyle.info}>Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong></span>
          <div style={paginationStyle.btnGroup}>
            <button style={paginationStyle.btn} disabled={currentPage===1} onClick={()=>setCurrentPage(1)}>«</button>
            <button style={paginationStyle.btn} disabled={currentPage===1} onClick={()=>setCurrentPage(p=>p-1)}>‹</button>
            {Array.from({length:totalPages},(_,i)=>i+1).map(pg=>(
              <button key={pg} style={{...paginationStyle.btn,...(pg===currentPage?paginationStyle.btnActive:{})}} onClick={()=>setCurrentPage(pg)}>{pg}</button>
            ))}
            <button style={paginationStyle.btn} disabled={currentPage===totalPages} onClick={()=>setCurrentPage(p=>p+1)}>›</button>
            <button style={paginationStyle.btn} disabled={currentPage===totalPages} onClick={()=>setCurrentPage(totalPages)}>»</button>
          </div>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {['Match','Teams','Team Won','Match Time','Contest','Joined','Fee(₹)','Pool(₹)','Fantasy Winner','Payout'].map(h=><th key={h}>{h}</th>)}
              {seasonPlayers.map(p=><th key={p}><div style={{fontSize:11,whiteSpace:'nowrap'}}>{p}<br/><span style={{color:'var(--text2)',fontSize:9}}>J/P/Rk/Pts</span></div></th>)}
            </tr>
          </thead>
          <tbody>
            {paginatedMatches.map(m => {
              const done = m.teamwon && m.teamwon !== '—'
              const prizes = calculateHistoricPrizes(m, seasonConfig.id)
              const paidCount = Object.values(m.players).filter(p=>p.joined&&p.paid).length
              const pool = done && m.contest==='yes' ? prizes.totalPool : 0
              return (
                <tr key={m.matchno} style={{opacity: done?1:0.6}}>
                  <td><span className="match-num">#{m.matchno}</span></td>
                  <td><span style={{fontWeight:700,color:'var(--text)'}}>{m.teams}</span></td>
                  <td>{done ? <span style={{color:themeAccent,fontWeight:700}}>{m.teamwon}</span> : <span className="upcoming-label">Abandoned</span>}</td>
                  <td><span style={{fontSize:11,color:'#8899bb'}}>✅ Completed</span></td>
                  <td>{m.contest==='yes'?<span className="badge-yes">YES</span>:<span className="badge-no">NO</span>}</td>
                  <td><span style={{color:'var(--text2)'}}>{m.joined}</span></td>
                  <td>₹{m.fee}</td>
                  <td>{pool>0?`₹${pool}`:'—'}</td>
                  <td>{m.fantasyWinner!=='—'?<span style={{color:themeAccent,fontWeight:700}}>{m.fantasyWinner}</span>:<span style={{color:'#666'}}>—</span>}</td>
                  <td><span style={{color:'#2ecc71',fontSize:11,fontWeight:700}}>✓ Done</span></td>
                  {seasonPlayers.map(p => {
                    const pd = m.players[p]
                    if (!pd || !pd.joined) return <td key={p}><span style={{color:'#333',fontSize:11}}>—</span></td>
                    const rankEmoji = {1:'🥇',2:'🥈',3:'🥉',4:'4️⃣',5:'5️⃣'}
                    return (
                      <td key={p}>
                        <div style={{fontSize:11,lineHeight:1.6}}>
                          <span style={{color:'#2ecc71'}}>✓</span>
                          {pd.paid&&<span style={{color:'var(--text2)',marginLeft:3}}>Paid</span>}
                          {pd.rank&&<div>{rankEmoji[pd.rank]||`R${pd.rank}`}</div>}
                          {pd.points>0&&<div style={{color:themeAccent,fontSize:10}}>{pd.points}pts</div>}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// HISTORIC LEADERBOARD
// ─────────────────────────────────────────────────────────────
function HistoricLeaderboard({ matches, seasonPlayers, seasonConfig, seasonColors }) {
  const { themeAccent, id: seasonId } = seasonConfig
  const stats = useMemo(() => computeHistoricPlayerStats(matches, seasonPlayers, seasonId), [matches, seasonPlayers, seasonId])
  
  const ranked = seasonPlayers
    .map(p => ({ name:p, profit: stats[p].totalWon - stats[p].totalInvested, ...stats[p] }))
    .sort((a,b) => b.profit - a.profit)

  return (
    <div className="section">
      <div className="sec-title">🏆 Leaderboard</div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr style={{background:'rgba(255,255,255,0.04)'}}>
              {['Rank','Player','Matches','Paid','Wins','Win%','Invested','Winnings','Profit/Loss','Best Pts','Avg Pts'].map(h=>(
                <th key={h} style={{padding:'10px 12px',textAlign:'left',fontSize:11,color:'#8899bb',fontFamily:"'Rajdhani',sans-serif",letterSpacing:1,borderBottom:'1px solid #1e2d50',whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ranked.map((s, idx) => {
              const profit = s.totalWon - s.totalInvested
              const winpct = s.paidContests>0 ? ((s.wins/s.paidContests)*100).toFixed(0) : 0
              const avgPts = s.pointsMatchCount>0 ? (s.totalPointsSum/s.pointsMatchCount).toFixed(1) : '—'
              const pColor = seasonColors[seasonPlayers.indexOf(s.name)] || themeAccent
              const rank = idx+1
              const medal = rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':rank
              return (
                <tr key={s.name} style={{borderBottom:'1px solid rgba(255,255,255,0.05)',transition:'background 0.2s'}}>
                  <td style={{padding:'10px 12px',fontFamily:"'Orbitron',sans-serif",fontSize:16}}>{medal}</td>
                  <td style={{padding:'10px 12px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <div style={{width:32,height:32,borderRadius:'50%',background:`${pColor}22`,border:`2px solid ${pColor}`,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Bebas Neue',sans-serif",fontSize:16,color:pColor}}>{s.name[0]}</div>
                      <span style={{fontWeight:700,color:'var(--text)'}}>{s.name}</span>
                    </div>
                  </td>
                  <td style={{padding:'10px 12px',color:'var(--text2)'}}>{s.matchesPlayed}</td>
                  <td style={{padding:'10px 12px',color:'var(--text2)'}}>{s.paidContests}</td>
                  <td style={{padding:'10px 12px',color:pColor,fontWeight:700}}>{s.wins}</td>
                  <td style={{padding:'10px 12px',color:'var(--text2)'}}>{winpct}%</td>
                  <td style={{padding:'10px 12px',color:'#e74c3c'}}>₹{s.totalInvested}</td>
                  <td style={{padding:'10px 12px',color:'#2ecc71'}}>₹{s.totalWon.toFixed(0)}</td>
                  <td style={{padding:'10px 12px',fontWeight:700,color:profit>=0?'#2ecc71':'#e74c3c'}}>{profit>=0?'+':''}₹{profit.toFixed(0)}</td>
                  <td style={{padding:'10px 12px',color:themeAccent}}>{s.bestPoints>0?s.bestPoints:'—'}</td>
                  <td style={{padding:'10px 12px',color:'var(--text2)'}}>{avgPts}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// HISTORIC PLAYER STATS
// ─────────────────────────────────────────────────────────────
function HistoricPlayerStats({ matches, seasonPlayers, seasonConfig, seasonColors }) {
  const { themeAccent, id: seasonId } = seasonConfig
  const stats = useMemo(() => computeHistoricPlayerStats(matches, seasonPlayers, seasonId), [matches, seasonPlayers, seasonId])
  
  return (
    <div className="section">
      <div className="sec-title">👤 Player Stats</div>
      <div className="players-grid">
        {seasonPlayers.map((p, i) => {
          const s = stats[p]
          const pColor = seasonColors[i] || themeAccent
          const profit = s.totalWon - s.totalInvested
          const winpct = s.paidContests>0 ? ((s.wins/s.paidContests)*100).toFixed(1) : '0.0'
          const avgPts = s.pointsMatchCount>0 ? (s.totalPointsSum/s.pointsMatchCount).toFixed(1) : '—'
          return (
            <div key={p} className="p-card" style={{borderColor:`${pColor}44`,background:`linear-gradient(135deg,${pColor}08,transparent)`}}>
              <div className="p-card-header">
                <div style={{
                  width:44,height:44,borderRadius:'50%',background:`${pColor}22`,
                  border:`3px solid ${pColor}`,display:'flex',alignItems:'center',
                  justifyContent:'center',fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:pColor
                }}>{p[0]}</div>
                <div style={{flex:1}}>
                  <div className="p-name">{p}</div>
                  <div className="p-winpct">Win Rate: <span>{winpct}%</span> ({s.wins}/{s.paidContests} paid)</div>
                  <div className="form-strip">
                    <span className="form-label">Form:</span>
                    {s.recentForm.length===0
                      ? <span style={{fontSize:11,color:'var(--text2)'}}>No data</span>
                      : s.recentForm.map((r,ri)=>{
                          if(r==='win1') return <div key={ri} className="form-icon form-win1" title="1st">🥇</div>
                          if(r==='win2') return <div key={ri} className="form-icon form-win2" title="2nd">🥈</div>
                          if(r==='loss') return <div key={ri} className="form-icon form-loss" title="Loss">❌</div>
                          return <div key={ri} className="form-icon form-skip">-</div>
                        })
                    }
                  </div>
                </div>
              </div>
              <div className="p-card-body">
                {[
                  ['Matches Played', s.matchesPlayed,''],
                  ['Paid Contests', s.paidContests,''],
                  ['Matches Won', s.wins,'', pColor],
                  ...(s.bestPoints>0 ? [['Best Points', s.bestPoints,'accent']] : []),
                  ...(s.pointsMatchCount>0 ? [['Avg Points', avgPts,'']] : []),
                ].map(([label,val,cls,color])=>(
                  <div className="p-stat-row" key={label}>
                    <span className="p-stat-label">{label}</span>
                    <span className={`p-stat-val${cls?' '+cls:''}`} style={color?{color}:{}}>{val}</span>
                  </div>
                ))}
                <div className="p-stat-row"><span className="p-stat-label">Total Invested</span><span className="p-stat-val red">₹{s.totalInvested}</span></div>
                <div className="p-stat-row"><span className="p-stat-label">Total Winnings</span><span className="p-stat-val green">₹{s.totalWon.toFixed(0)}</span></div>
                <div className="p-stat-row"><span className="p-stat-label">Profit / Loss</span><span className={`p-stat-val ${profit>=0?'green':'red'}`}>{profit>=0?'+':''}₹{profit.toFixed(0)}</span></div>
                {(s.highestWinStreak>0||s.highestLossStreak>0) && (
                  <div style={{borderTop:'1px solid rgba(255,255,255,0.07)',paddingTop:8,marginTop:4,display:'flex',gap:8}}>
                    <div style={{flex:1,background:'rgba(46,204,113,0.08)',border:'1px solid rgba(46,204,113,0.2)',borderRadius:8,padding:'5px 8px',textAlign:'center'}}>
                      <div style={{fontSize:9,color:'#8899bb',letterSpacing:1}}>🔥 BEST WIN STREAK</div>
                      <div style={{fontSize:20,fontWeight:900,color:'#2ecc71',fontFamily:"'Orbitron',sans-serif"}}>{s.highestWinStreak}</div>
                    </div>
                    <div style={{flex:1,background:'rgba(231,76,60,0.08)',border:'1px solid rgba(231,76,60,0.2)',borderRadius:8,padding:'5px 8px',textAlign:'center'}}>
                      <div style={{fontSize:9,color:'#8899bb',letterSpacing:1}}>💀 WORST LOSS STREAK</div>
                      <div style={{fontSize:20,fontWeight:900,color:'#e74c3c',fontFamily:"'Orbitron',sans-serif"}}>{s.highestLossStreak}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// HISTORIC GRAPHS
// ─────────────────────────────────────────────────────────────
function HistoricGraphs({ matches, seasonPlayers, seasonConfig, seasonColors }) {
  const { themeAccent, id: seasonId } = seasonConfig
  const completedMatches = useMemo(()=>matches.filter(m=>m.teamwon&&m.teamwon!=='—'&&m.contest==='yes'),[matches])
  const labels = useMemo(()=>completedMatches.map(m=>`M${m.matchno}`),[completedMatches])

  // PnL cumulative
  const pnlDatasets = useMemo(()=>seasonPlayers.map((p,i)=>{
    let cum = 0
    const prizes_cache = {}
    const data = completedMatches.map(m=>{
      const pd = m.players[p]
      if (!pd?.joined||!pd?.paid) return cum
      const prizes = prizes_cache[m.matchno] || (prizes_cache[m.matchno] = calculateHistoricPrizes(m, seasonId))
      const pR = prizes._paidRanks?.[p] || 0
      cum -= m.fee
      if (pR===1) cum += prizes[1]
      return parseFloat(cum.toFixed(2))
    })
    return {label:p, data, borderColor:seasonColors[i], backgroundColor:seasonColors[i]+'22',
      fill:false, tension:0.3, pointRadius:4, pointHoverRadius:7, pointStyle:'rectRot', borderWidth:2}
  }),[completedMatches, seasonPlayers, seasonColors, seasonId])

  // Win distribution doughnut
  const winsData = useMemo(()=>{
    const wins = seasonPlayers.map(p=>{
      let w=0
      completedMatches.forEach(m=>{
        const prizes = calculateHistoricPrizes(m, seasonId)
        if ((prizes._paidRanks?.[p]||0)===1) w++
      })
      return w
    })
    return {
      labels: seasonPlayers,
      datasets:[{data:wins, backgroundColor:seasonColors, borderColor:seasonColors.map(c=>c+'88'),borderWidth:2}]
    }
  },[completedMatches, seasonPlayers, seasonColors, seasonId])

  const doughnutOpts = {
    responsive:true,maintainAspectRatio:false,
    plugins:{
      legend:{labels:{color:'#8899bb',font:{family:'Rajdhani',size:12}}},
      tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${ctx.raw} wins`}}
    }
  }
  const lineOpts = {...chartOpts('₹'), interaction:{mode:'index',intersect:false},
    plugins:{...chartOpts('₹').plugins,
      legend:{labels:{color:'#8899bb',font:{family:'Rajdhani',size:11,weight:'700'},padding:12,usePointStyle:true}}
    }
  }

  const { slicedLabels, slicedDatasets, page, setPage, totalPages, start, end, total } = usePaginatedData(labels, pnlDatasets, 'last')

  return (
    <div className="section">
      <div className="sec-title">📊 Graphs</div>
      <div className="charts-grid">
        <div className="chart-card" style={{gridColumn:'1/-1',border:`1px solid ${themeAccent}44`}}>
          <div className="chart-title">💰 CUMULATIVE P&L CHART</div>
          <ChartPageControls page={page} totalPages={totalPages} setPage={setPage} start={start} end={end} total={total}/>
          <div style={{position:'relative',height:280}}>
            <Line data={{labels:slicedLabels,datasets:slicedDatasets}} options={lineOpts}/>
          </div>
          <ChartPageControls page={page} totalPages={totalPages} setPage={setPage} start={start} end={end} total={total}/>
        </div>
        <div className="chart-card">
          <div className="chart-title">🏆 WIN DISTRIBUTION</div>
          <div style={{position:'relative',height:240}}>
            <Doughnut data={winsData} options={doughnutOpts}/>
          </div>
        </div>
        <div className="chart-card">
          <div className="chart-title">📊 TOTAL INVESTED vs WINNINGS</div>
          <div style={{position:'relative',height:240}}>
            <Bar
              data={{
                labels:seasonPlayers,
                datasets:[
                  {label:'Invested',data:seasonPlayers.map(p=>{
                    let inv=0; completedMatches.forEach(m=>{if(m.players[p]?.paid)inv+=m.fee}); return inv
                  }),backgroundColor:'#e74c3c88',borderColor:'#e74c3c',borderWidth:1},
                  {label:'Winnings',data:seasonPlayers.map(p=>{
                    let won=0; completedMatches.forEach(m=>{
                      const pr=calculateHistoricPrizes(m,seasonId)
                      if((pr._paidRanks?.[p]||0)===1)won+=pr[1]
                    }); return won
                  }),backgroundColor:`${themeAccent}88`,borderColor:themeAccent,borderWidth:1}
                ]
              }}
              options={chartOpts('₹')}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// HISTORIC STOCK INDEX (simplified - rank-based)
// ─────────────────────────────────────────────────────────────
function HistoricStockIndex({ matches, seasonPlayers, seasonConfig, seasonColors }) {
  const { themeAccent, id: seasonId } = seasonConfig
  const [selectedPlayer, setSelectedPlayer] = useState(seasonPlayers[0])
  const completedMatches = useMemo(()=>matches.filter(m=>m.teamwon&&m.teamwon!=='—'&&m.contest==='yes'),[matches])

  const allPlayerCandles = useMemo(()=>{
    const result = {}
    seasonPlayers.forEach(p => {
      let runningPrice = 100
      const candles = []
      completedMatches.forEach((m, idx) => {
        const pd = m.players[p]
        if (!pd?.joined) return
        const prizes = calculateHistoricPrizes(m, seasonId)
        const pR = prizes._paidRanks?.[p] || 0
        const pts = pd.points > 0 ? pd.points : (pR===1?800:pR===2?650:pR===3?550:450)
        const open = runningPrice
        let mult = 1.0
        if(pR===1)mult=1.20; else if(pR===2)mult=1.10; else if(pR===3)mult=1.05; else if(pR>=4)mult=1.00
        runningPrice = idx===0 ? pts : ((pts*0.4)+(open*0.6))*mult
        const close = parseFloat(runningPrice.toFixed(2))
        const change = Math.abs(close-open)
        candles.push({
          label:`M${m.matchno}`,
          open, high:parseFloat(Math.max(open,close,open+change*0.15).toFixed(2)),
          low:parseFloat(Math.min(open,close,open-change*0.15).toFixed(2)),
          close, matchno:m.matchno
        })
      })
      result[p] = candles
    })
    return result
  },[completedMatches, seasonPlayers, seasonId])

  const playerCandles = allPlayerCandles[selectedPlayer]||[]
  const lastCandle = playerCandles[playerCandles.length-1]
  const prevCandle = playerCandles[playerCandles.length-2]
  const change = lastCandle&&prevCandle ? lastCandle.close-prevCandle.close : 0
  const changePct = prevCandle&&prevCandle.close>0 ? ((change/prevCandle.close)*100).toFixed(2) : '0.00'
  const isUp = change>0, isSame = change===0
  const playerColor = seasonColors[seasonPlayers.indexOf(selectedPlayer)] || themeAccent
  const allCloses = playerCandles.map(c=>c.close)
  const ath = allCloses.length ? Math.max(...allCloses) : 100
  const atl = allCloses.length ? Math.min(...allCloses) : 100

  return (
    <div className="section">
      <div className="sec-title">📈 Player Stock Index</div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:20}}>
        {seasonPlayers.map((p,i)=>{
          const candles = allPlayerCandles[p]||[]
          const last = candles[candles.length-1]
          const prev = candles[candles.length-2]
          const chg = last&&prev ? last.close-prev.close : 0
          const isAct = p===selectedPlayer
          return (
            <button key={p} onClick={()=>setSelectedPlayer(p)} style={{
              fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:12,padding:'7px 14px',
              borderRadius:20,cursor:'pointer',transition:'all 0.2s',
              border:isAct?`2px solid ${seasonColors[i]}`:'1px solid rgba(255,255,255,0.1)',
              background:isAct?`${seasonColors[i]}22`:'rgba(255,255,255,0.04)',
              color:isAct?seasonColors[i]:'#8899bb',display:'flex',alignItems:'center',gap:6
            }}>
              <span>{p}</span>
              {last&&<span style={{fontSize:10,color:chg>0?'#2ecc71':chg<0?'#e74c3c':'#888'}}>
                {chg>0?'▲':chg<0?'▼':'─'} ₹{last.close.toFixed(0)}
              </span>}
            </button>
          )
        })}
      </div>
      <div style={{background:`linear-gradient(135deg,${playerColor}15,transparent)`,border:`1px solid ${playerColor}44`,borderRadius:16,padding:'16px 20px',marginBottom:20,display:'flex',alignItems:'center',gap:20,flexWrap:'wrap'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:52,height:52,borderRadius:'50%',background:`${playerColor}22`,border:`3px solid ${playerColor}`,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Bebas Neue',sans-serif",fontSize:26,color:playerColor}}>{selectedPlayer[0]}</div>
          <div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,letterSpacing:3,color:playerColor}}>{selectedPlayer}</div>
            <div style={{fontSize:10,color:'#8899bb',letterSpacing:1}}>PLAYER STOCK INDEX</div>
          </div>
        </div>
        <div style={{display:'flex',gap:16,flexWrap:'wrap',flex:1}}>
          {lastCandle && [
            {label:'CURRENT',val:`₹${lastCandle.close.toFixed(2)}`,color:playerColor},
            {label:'CHANGE',val:`${isUp?'▲':isSame?'─':'▼'} ${change>=0?'+':''}₹${change.toFixed(2)} (${changePct}%)`,color:isUp?'#2ecc71':isSame?'#888':'#e74c3c'},
            {label:'ATH 🚀',val:`₹${ath.toFixed(2)}`,color:'#2ecc71'},
            {label:'ATL 📉',val:`₹${atl.toFixed(2)}`,color:'#e74c3c'},
            {label:'MATCHES',val:playerCandles.length,color:'#8899bb'},
          ].map(({label,val,color})=>(
            <div key={label} style={{textAlign:'center',minWidth:64}}>
              <div style={{fontSize:9,color:'#8899bb',letterSpacing:2,textTransform:'uppercase'}}>{label}</div>
              <div style={{fontSize:13,fontWeight:800,color,fontFamily:"'Orbitron',sans-serif",marginTop:2}}>{val}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{background:'#05080f',borderRadius:16,padding:'16px 8px',border:`1px solid ${playerColor}33`,marginBottom:20,overflowX:'auto'}}>
        <CandlestickChart candles={playerCandles} color={playerColor} width={Math.max(520,playerCandles.length*48+100)} height={280} mini={false}/>
      </div>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:14,letterSpacing:4,color:'var(--text2)',marginBottom:12}}>ALL PLAYERS — MINI CHARTS</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:16}}>
        {seasonPlayers.map((p,pi)=>{
          const candles = allPlayerCandles[p]||[]
          const last = candles[candles.length-1]
          const prev = candles[candles.length-2]
          const chg = last&&prev ? last.close-prev.close : 0
          const chgPct = prev&&prev.close>0 ? ((chg/prev.close)*100).toFixed(1) : '0.0'
          const pColor = seasonColors[pi]
          const pAth = candles.length ? Math.max(...candles.map(c=>c.close)) : 100
          const pAtl = candles.length ? Math.min(...candles.map(c=>c.close)) : 100
          return (
            <div key={p} onClick={()=>setSelectedPlayer(p)} style={{
              background:p===selectedPlayer?`${pColor}15`:'#0d1525',
              border:`1px solid ${p===selectedPlayer?pColor:'#1e2d50'}`,
              borderRadius:14,padding:'14px 14px 10px',cursor:'pointer',transition:'all 0.2s'
            }}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:2,color:pColor}}>{p}</div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:14,fontWeight:800,color:pColor,fontFamily:"'Orbitron',sans-serif"}}>{last?`₹${last.close.toFixed(0)}`:'₹100'}</div>
                  <div style={{fontSize:10,color:chg>0?'#2ecc71':chg<0?'#e74c3c':'#888'}}>{chg>0?'▲':chg<0?'▼':'─'} {chg>=0?'+':''}₹{chg.toFixed(0)} ({chg>0?'+':''}{chgPct}%)</div>
                </div>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'#8899bb',marginBottom:8}}>
                <span>ATH: <span style={{color:'#2ecc71'}}>₹{pAth.toFixed(0)}</span></span>
                <span>ATL: <span style={{color:'#e74c3c'}}>₹{pAtl.toFixed(0)}</span></span>
                <span>{candles.length} matches</span>
              </div>
              <CandlestickChart candles={candles} color={pColor} width={260} height={80} mini={true}/>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// HISTORIC SEASON WRAPPER — combines all tabs
// ─────────────────────────────────────────────────────────────
function HistoricSeasonView({ seasonId, activeSection }) {
  const config = SEASON_CONFIG[seasonId]
  const matches = HISTORIC_DATA[seasonId] || []
  const players = config.players
  const colors = config.colors
  const navSections = ['matchlog','playerstats','leaderboard','graphs','stockindex']
  
  return (
    <>
      <div style={activeSection==='matchlog'?{}:{display:'none'}}><HistoricMatchLog matches={matches} seasonPlayers={players} seasonConfig={config} seasonColors={colors}/></div>
      <div style={activeSection==='playerstats'?{}:{display:'none'}}><HistoricPlayerStats matches={matches} seasonPlayers={players} seasonConfig={config} seasonColors={colors}/></div>
      <div style={activeSection==='leaderboard'?{}:{display:'none'}}><HistoricLeaderboard matches={matches} seasonPlayers={players} seasonConfig={config} seasonColors={colors}/></div>
      <div style={activeSection==='graphs'?{}:{display:'none'}}><HistoricGraphs matches={matches} seasonPlayers={players} seasonConfig={config} seasonColors={colors}/></div>
      <div style={activeSection==='stockindex'?{}:{display:'none'}}><HistoricStockIndex matches={matches} seasonPlayers={players} seasonConfig={config} seasonColors={colors}/></div>
    </>
  )
}



// ═══════════════════════════════════════════════════════════════
// ALL-TIME PLAYER HISTORY — Cross-season aggregated stats
// ═══════════════════════════════════════════════════════════════

const ALL_SEASONS_META = [
  { id: 'ipl2024', label: 'IPL 2024',            short: '2024', accent: '#9b59b6', icon: '🏏' },
  { id: 'ct2025',  label: 'Champions Trophy 2025',short: 'CT25', accent: '#00cec9', icon: '🏆' },
  { id: 'ipl2025', label: 'IPL 2025',            short: '2025', accent: '#fd9644', icon: '🏏' },
  { id: 'ipl2026', label: 'IPL 2026',            short: '2026', accent: '#f5a623', icon: '🏏', isLive: true },
]

// Player colour roster — consistent across seasons
const ALL_PLAYER_COLORS = {
  Ashish:  '#f5a623',
  Kalpesh: '#3498db',
  Nilesh:  '#3498db',
  Prabhat: '#e74c3c',
  Pritam:  '#e056fd',
  Sudhir:  '#2ecc71',
  Swapnil: '#fd9644',
}

const SORT_OPTIONS = [
  { value: 'profit',       label: '💰 Net Profit' },
  { value: 'wins',         label: '🏆 Total Wins' },
  { value: 'winPct',       label: '📈 Win Rate %' },
  { value: 'paidContests', label: '🎯 Paid Contests' },
  { value: 'invested',     label: '💸 Total Invested' },
  { value: 'roi',          label: '📊 ROI %' },
  { value: 'bestPts',      label: '⚡ Best Points (Single Match)' },
  { value: 'avgPts',       label: '🎖️ Avg Points / Match' },
  { value: 'winStreak',    label: '🔥 Best Win Streak' },
  { value: 'totalMatches', label: '🗓️ Matches Played' },
]

function computeAllTimeStats(liveMatches) {
  // All players across all time
  const allPlayers = ['Ashish', 'Kalpesh', 'Nilesh', 'Prabhat', 'Pritam', 'Sudhir', 'Swapnil']

  // per-player, per-season breakdown
  const seasonBreakdown = {} // player → { seasonId → stats }
  const totals = {}          // player → aggregated

  allPlayers.forEach(p => {
    totals[p] = {
      player: p,
      totalMatches: 0, paidContests: 0, wins: 0, winsRank1: 0, winsRank2: 0,
      invested: 0, winnings: 0,
      bestPts: 0, totalPtsSum: 0, ptsMatchCount: 0,
      highestWinStreak: 0, highestLossStreak: 0,
      seasonsPlayed: [],
      currentWinStreak: 0, currentLossStreak: 0,
    }
    seasonBreakdown[p] = {}
  })

  // Helper — process a season's matches into per-player stats
  const processSeason = (seasonId, matches, players, calcPrizeFn) => {
    const seasonStats = {}
    players.forEach(p => {
      seasonStats[p] = {
        matches: 0, paidContests: 0, wins: 0, winsRank1: 0, winsRank2: 0,
        invested: 0, winnings: 0,
        bestPts: 0, totalPtsSum: 0, ptsMatchCount: 0,
        highestWinStreak: 0, currentWinStreak: 0,
        highestLossStreak: 0, currentLossStreak: 0,
      }
    })

    matches.forEach(m => {
      const isComplete = m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—'
      if (!isComplete || m.contest !== 'yes') return
      const prizes = calcPrizeFn(m, seasonId)
      const paidRanks = prizes._paidRanks || {}

      players.forEach(p => {
        const pd = m.players?.[p]
        if (!pd?.joined || !pd?.paid) return
        const s = seasonStats[p]
        s.matches++
        s.paidContests++
        s.invested += m.fee
        if (pd.points > 0) {
          s.totalPtsSum += pd.points
          s.ptsMatchCount++
          if (pd.points > s.bestPts) s.bestPts = pd.points
        }
        const pR = paidRanks[p] || 0
        if (pR === 1) {
          s.wins++; s.winsRank1++
          s.winnings += prizes[1] || 0
          s.currentWinStreak++; s.currentLossStreak = 0
          if (s.currentWinStreak > s.highestWinStreak) s.highestWinStreak = s.currentWinStreak
        } else if (pR === 2 && prizes.winnerCountLimit === 2) {
          s.wins++; s.winsRank2++
          s.winnings += prizes[2] || 0
          s.currentWinStreak++; s.currentLossStreak = 0
          if (s.currentWinStreak > s.highestWinStreak) s.highestWinStreak = s.currentWinStreak
        } else {
          s.currentLossStreak++; s.currentWinStreak = 0
          if (s.currentLossStreak > s.highestLossStreak) s.highestLossStreak = s.currentLossStreak
        }
      })
    })
    return seasonStats
  }

  // ── IPL 2024 ──
  const s2024Players = ['Ashish','Prabhat','Sudhir','Swapnil']
  const s2024 = processSeason('ipl2024', HISTORIC_DATA.ipl2024, s2024Players, calculateHistoricPrizes)
  s2024Players.forEach(p => {
    const s = s2024[p]
    if (s.paidContests > 0) totals[p].seasonsPlayed.push('ipl2024')
    seasonBreakdown[p]['ipl2024'] = s
    totals[p].totalMatches  += s.matches
    totals[p].paidContests  += s.paidContests
    totals[p].wins          += s.wins
    totals[p].winsRank1     += s.winsRank1
    totals[p].winsRank2     += s.winsRank2
    totals[p].invested      += s.invested
    totals[p].winnings      += s.winnings
    totals[p].totalPtsSum   += s.totalPtsSum
    totals[p].ptsMatchCount += s.ptsMatchCount
    if (s.bestPts > totals[p].bestPts) totals[p].bestPts = s.bestPts
    if (s.highestWinStreak > totals[p].highestWinStreak) totals[p].highestWinStreak = s.highestWinStreak
    if (s.highestLossStreak > totals[p].highestLossStreak) totals[p].highestLossStreak = s.highestLossStreak
  })

  // ── CT 2025 ──
  const sCTPlayers = ['Ashish','Prabhat','Sudhir','Swapnil']
  const sCT = processSeason('ct2025', HISTORIC_DATA.ct2025, sCTPlayers, calculateHistoricPrizes)
  sCTPlayers.forEach(p => {
    const s = sCT[p]
    if (s.paidContests > 0) { if (!totals[p].seasonsPlayed.includes('ct2025')) totals[p].seasonsPlayed.push('ct2025') }
    seasonBreakdown[p]['ct2025'] = s
    totals[p].totalMatches  += s.matches
    totals[p].paidContests  += s.paidContests
    totals[p].wins          += s.wins
    totals[p].winsRank1     += s.winsRank1
    totals[p].winsRank2     += s.winsRank2
    totals[p].invested      += s.invested
    totals[p].winnings      += s.winnings
    totals[p].totalPtsSum   += s.totalPtsSum
    totals[p].ptsMatchCount += s.ptsMatchCount
    if (s.bestPts > totals[p].bestPts) totals[p].bestPts = s.bestPts
    if (s.highestWinStreak > totals[p].highestWinStreak) totals[p].highestWinStreak = s.highestWinStreak
    if (s.highestLossStreak > totals[p].highestLossStreak) totals[p].highestLossStreak = s.highestLossStreak
  })

  // ── IPL 2025 ──
  const s2025Players = ['Ashish','Nilesh','Prabhat','Sudhir','Swapnil']
  const s2025 = processSeason('ipl2025', HISTORIC_DATA.ipl2025, s2025Players, calculateHistoricPrizes)
  s2025Players.forEach(p => {
    const s = s2025[p]
    if (s.paidContests > 0) { if (!totals[p].seasonsPlayed.includes('ipl2025')) totals[p].seasonsPlayed.push('ipl2025') }
    seasonBreakdown[p]['ipl2025'] = s
    totals[p].totalMatches  += s.matches
    totals[p].paidContests  += s.paidContests
    totals[p].wins          += s.wins
    totals[p].winsRank1     += s.winsRank1
    totals[p].winsRank2     += s.winsRank2
    totals[p].invested      += s.invested
    totals[p].winnings      += s.winnings
    totals[p].totalPtsSum   += s.totalPtsSum
    totals[p].ptsMatchCount += s.ptsMatchCount
    if (s.bestPts > totals[p].bestPts) totals[p].bestPts = s.bestPts
    if (s.highestWinStreak > totals[p].highestWinStreak) totals[p].highestWinStreak = s.highestWinStreak
    if (s.highestLossStreak > totals[p].highestLossStreak) totals[p].highestLossStreak = s.highestLossStreak
  })

  // ── IPL 2026 (live) — use computePlayerStats which handles real data ──
  if (liveMatches && liveMatches.length > 0) {
    const liveStats = computePlayerStats(liveMatches)
    PLAYERS.forEach(p => {
      const s = liveStats[p]
      if (!s) return
      const sData = {
        matches: s.matchesPlayed, paidContests: s.paidContests, wins: s.wins,
        winsRank1: s.winsRank1 || 0, winsRank2: s.winsRank2 || 0,
        invested: s.totalInvested, winnings: s.totalWon,
        bestPts: s.bestPoints, totalPtsSum: s.totalPointsSum, ptsMatchCount: s.pointsMatchCount,
        highestWinStreak: s.highestWinStreak, currentWinStreak: s.currentWinStreak,
        highestLossStreak: s.highestLossStreak, currentLossStreak: s.currentLossStreak,
      }
      seasonBreakdown[p]['ipl2026'] = sData
      if (s.paidContests > 0) { if (!totals[p].seasonsPlayed.includes('ipl2026')) totals[p].seasonsPlayed.push('ipl2026') }
      totals[p].totalMatches  += sData.matches
      totals[p].paidContests  += sData.paidContests
      totals[p].wins          += sData.wins
      totals[p].winsRank1     += sData.winsRank1
      totals[p].winsRank2     += sData.winsRank2
      totals[p].invested      += sData.invested
      totals[p].winnings      += parseFloat(sData.winnings || 0)
      totals[p].totalPtsSum   += sData.totalPtsSum
      totals[p].ptsMatchCount += sData.ptsMatchCount
      if (sData.bestPts > totals[p].bestPts) totals[p].bestPts = sData.bestPts
      if (sData.highestWinStreak > totals[p].highestWinStreak) totals[p].highestWinStreak = sData.highestWinStreak
      if (sData.highestLossStreak > totals[p].highestLossStreak) totals[p].highestLossStreak = sData.highestLossStreak
    })
  }

  return { totals, seasonBreakdown }
}

// ── Mini sparkline-style season bar ──
function SeasonBar({ seasonId, sData, accent }) {
  if (!sData || sData.paidContests === 0) return (
    <div style={{fontSize:10,color:'#444',fontStyle:'italic',padding:'3px 0'}}>Did not play</div>
  )
  const profit = sData.winnings - sData.invested
  const winPct = sData.paidContests > 0 ? ((sData.wins / sData.paidContests) * 100).toFixed(0) : 0
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10, padding:'5px 10px',
      background:'rgba(255,255,255,0.03)', borderRadius:8,
      borderLeft:`3px solid ${accent}`, marginBottom:4, flexWrap:'wrap'
    }}>
      <span style={{fontSize:11,color:accent,fontWeight:700,minWidth:36}}>{ALL_SEASONS_META.find(s=>s.id===seasonId)?.short || seasonId}</span>
      <span style={{fontSize:10,color:'#8899bb'}}>{sData.paidContests} paid</span>
      <span style={{fontSize:10,color:'#f5a623',fontWeight:700}}>{sData.wins}W</span>
      <span style={{fontSize:10,color:'#8899bb'}}>{winPct}%</span>
      <span style={{fontSize:10,color:profit>=0?'#2ecc71':'#e74c3c',fontWeight:700,marginLeft:'auto'}}>
        {profit>=0?'+':''}₹{profit.toFixed(0)}
      </span>
    </div>
  )
}

// ── Rank medal badge ──
function RankBadge({ rank }) {
  if (rank === 1) return <span style={{fontSize:22}}>🥇</span>
  if (rank === 2) return <span style={{fontSize:22}}>🥈</span>
  if (rank === 3) return <span style={{fontSize:22}}>🥉</span>
  return (
    <span style={{
      fontFamily:"'Orbitron',sans-serif", fontSize:16, fontWeight:900,
      color:'#8899bb', minWidth:28, textAlign:'center'
    }}>#{rank}</span>
  )
}

// ─── ALL TIME STATS MAIN COMPONENT ───────────────────────────
function AllTimeStats({ liveMatches }) {
  const [sortBy, setSortBy] = useState('profit')
  const [sortDir, setSortDir] = useState('desc')
  const [expandedPlayer, setExpandedPlayer] = useState(null)
  const [filterSeason, setFilterSeason] = useState('all') // 'all' or a season id
  const [viewMode, setViewMode] = useState('cards') // 'cards' | 'table'

  const { totals, seasonBreakdown } = useMemo(
    () => computeAllTimeStats(liveMatches),
    [liveMatches]
  )

  // Filter: if season selected, only show players from that season
  const activePlayers = useMemo(() => {
    const allP = ['Ashish','Kalpesh','Nilesh','Prabhat','Pritam','Sudhir','Swapnil']
    if (filterSeason === 'all') {
      return allP.filter(p => totals[p].paidContests > 0)
    }
    const meta = ALL_SEASONS_META.find(s => s.id === filterSeason)
    return allP.filter(p => {
      const sd = seasonBreakdown[p]?.[filterSeason]
      return sd && sd.paidContests > 0
    })
  }, [filterSeason, totals, seasonBreakdown])

  // Build sort key for each player
  const getVal = (p, key) => {
    const t = filterSeason === 'all' ? totals[p] : (seasonBreakdown[p]?.[filterSeason] || {})
    const invested = t.invested || 0
    const winnings = t.winnings || 0
    const paidContests = t.paidContests || 0
    switch (key) {
      case 'profit':       return winnings - invested
      case 'wins':         return t.wins || 0
      case 'winPct':       return paidContests > 0 ? (t.wins || 0) / paidContests : 0
      case 'paidContests': return paidContests
      case 'invested':     return invested
      case 'roi':          return invested > 0 ? ((winnings - invested) / invested) * 100 : 0
      case 'bestPts':      return t.bestPts || 0
      case 'avgPts':       return t.ptsMatchCount > 0 ? t.totalPtsSum / t.ptsMatchCount : 0
      case 'winStreak':    return t.highestWinStreak || 0
      case 'totalMatches': return t.matches || t.totalMatches || 0
      default:             return 0
    }
  }

  const ranked = useMemo(() => {
    return [...activePlayers]
      .sort((a, b) => sortDir === 'desc' ? getVal(b, sortBy) - getVal(a, sortBy) : getVal(a, sortBy) - getVal(b, sortBy))
  }, [activePlayers, sortBy, sortDir, filterSeason, totals, seasonBreakdown])

  // Aggregate totals banner
  const grandTotals = useMemo(() => {
    const allP = ['Ashish','Kalpesh','Nilesh','Prabhat','Pritam','Sudhir','Swapnil']
    let totalMatches = 0, totalContests = 0, totalInvested = 0, totalWon = 0, totalWins = 0
    allP.forEach(p => {
      const t = totals[p]
      totalMatches  += t.totalMatches
      totalContests += t.paidContests
      totalInvested += t.invested
      totalWon      += t.winnings
      totalWins     += t.wins
    })
    return { totalMatches, totalContests, totalInvested, totalWon, totalWins }
  }, [totals])

  const toggleSort = (key) => {
    if (sortBy === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(key); setSortDir('desc') }
  }

  const accentForSeason = (sid) => ALL_SEASONS_META.find(s=>s.id===sid)?.accent || '#f5a623'

  return (
    <div className="section">
      {/* ── Page Title ── */}
      <div className="sec-title" style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
        <span>🌐 All-Time Player History</span>
        <div style={{display:'flex',gap:8}}>
          <button
            onClick={()=>setViewMode(v=>v==='cards'?'table':'cards')}
            style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:800,fontSize:11,padding:'5px 12px',
              borderRadius:16,border:'1px solid rgba(255,255,255,0.15)',background:'rgba(255,255,255,0.06)',
              color:'#8899bb',cursor:'pointer',letterSpacing:0.5}}
          >{viewMode==='cards'?'📋 Table View':'🃏 Card View'}</button>
        </div>
      </div>

      {/* ── Grand totals band ── */}
      <div className="totals-bar" style={{marginBottom:16}}>
        {[
          ['Seasons',  '4'],
          ['Combined Matches', grandTotals.totalMatches],
          ['Paid Contests',    grandTotals.totalContests],
          ['Total Invested',   `₹${grandTotals.totalInvested.toLocaleString()}`],
          ['Total Paid Out',   `₹${grandTotals.totalWon.toFixed(0)}`],
          ['Total Wins',       grandTotals.totalWins],
        ].map(([label, val]) => (
          <div key={label} className="total-chip">
            <div className="total-chip-label">{label}</div>
            <div className="total-chip-val">{val}</div>
          </div>
        ))}
      </div>

      {/* ── Controls row ── */}
      <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',marginBottom:18}}>
        {/* Season filter */}
        <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
          <span style={{fontSize:10,color:'#8899bb',letterSpacing:2,textTransform:'uppercase'}}>Season:</span>
          {[{id:'all',label:'🌐 All Time',accent:'#f5a623'}, ...ALL_SEASONS_META].map(s => (
            <button
              key={s.id}
              onClick={() => { setFilterSeason(s.id); setExpandedPlayer(null) }}
              style={{
                fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:11,
                padding:'4px 11px',borderRadius:16,cursor:'pointer',
                border: filterSeason===s.id ? `1.5px solid ${s.accent||'#f5a623'}` : '1px solid rgba(255,255,255,0.1)',
                background: filterSeason===s.id ? `${s.accent||'#f5a623'}22` : 'rgba(255,255,255,0.03)',
                color: filterSeason===s.id ? (s.accent||'#f5a623') : '#8899bb',
                transition:'all 0.15s', whiteSpace:'nowrap',
              }}
            >{s.label || s.short}</button>
          ))}
        </div>
      </div>

      {/* ── Sort controls ── */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:16}}>
        <span style={{fontSize:10,color:'#8899bb',letterSpacing:2,textTransform:'uppercase',whiteSpace:'nowrap'}}>Sort by:</span>
        <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
          {SORT_OPTIONS.map(opt => {
            const isActive = sortBy === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => toggleSort(opt.value)}
                style={{
                  fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:11,
                  padding:'4px 10px',borderRadius:14,cursor:'pointer',
                  border: isActive ? '1.5px solid #f5a623' : '1px solid rgba(255,255,255,0.1)',
                  background: isActive ? 'rgba(245,166,35,0.15)' : 'rgba(255,255,255,0.03)',
                  color: isActive ? '#f5a623' : '#8899bb',
                  transition:'all 0.15s', whiteSpace:'nowrap',
                  display:'flex', alignItems:'center', gap:4,
                }}
              >
                {opt.label}
                {isActive && <span style={{fontSize:10}}>{sortDir==='desc'?'↓':'↑'}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* ═══ CARD VIEW ═══ */}
      {viewMode === 'cards' && (
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          {ranked.map((p, rankIdx) => {
            const t = filterSeason === 'all' ? totals[p] : (seasonBreakdown[p]?.[filterSeason] || {})
            const invested = t.invested || 0
            const winnings = parseFloat(t.winnings || 0)
            const paidContests = t.paidContests || 0
            const wins = t.wins || 0
            const winsRank1 = t.winsRank1 || 0
            const winsRank2 = t.winsRank2 || 0
            const profit = winnings - invested
            const winPct = paidContests > 0 ? ((wins / paidContests) * 100).toFixed(1) : '0.0'
            const roi = invested > 0 ? ((profit / invested) * 100).toFixed(1) : '0.0'
            const avgPts = (t.ptsMatchCount || 0) > 0 ? (t.totalPtsSum / t.ptsMatchCount).toFixed(1) : '—'
            const totalMatchesVal = t.matches || t.totalMatches || 0
            const pColor = ALL_PLAYER_COLORS[p] || '#f5a623'
            const isExpanded = expandedPlayer === p
            const seasonsPlayedAll = totals[p].seasonsPlayed || []
            const sortVal = getVal(p, sortBy)

            return (
              <div
                key={p}
                style={{
                  background: `linear-gradient(135deg, ${pColor}0d, #0d1525 60%)`,
                  border: `1px solid ${isExpanded ? pColor : pColor+'33'}`,
                  borderRadius: 16, overflow:'hidden',
                  boxShadow: isExpanded ? `0 0 20px ${pColor}22` : 'none',
                  transition:'all 0.2s',
                }}
              >
                {/* Card Header — always visible */}
                <div
                  onClick={() => setExpandedPlayer(isExpanded ? null : p)}
                  style={{
                    display:'flex', alignItems:'center', gap:14, padding:'14px 18px',
                    cursor:'pointer', flexWrap:'wrap',
                  }}
                >
                  {/* Rank */}
                  <div style={{minWidth:36,textAlign:'center'}}>
                    <RankBadge rank={rankIdx+1} />
                  </div>

                  {/* Avatar */}
                  <div style={{
                    width:52, height:52, borderRadius:'50%',
                    background:`${pColor}22`, border:`3px solid ${pColor}`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontFamily:"'Bebas Neue',sans-serif", fontSize:24, color:pColor,
                    flexShrink:0,
                  }}>{p[0]}</div>

                  {/* Name + seasons */}
                  <div style={{flex:1,minWidth:120}}>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:2,color:pColor}}>{p}</div>
                    <div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:3}}>
                      {seasonsPlayedAll.map(sid => (
                        <span key={sid} style={{
                          fontSize:9,padding:'1px 6px',borderRadius:8,
                          background:`${accentForSeason(sid)}20`,
                          color:accentForSeason(sid),
                          border:`1px solid ${accentForSeason(sid)}44`,
                          letterSpacing:0.5,
                        }}>
                          {ALL_SEASONS_META.find(s=>s.id===sid)?.short || sid}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Key stats strip */}
                  <div style={{display:'flex',gap:20,flexWrap:'wrap',alignItems:'center'}}>
                    {[
                      { label:'Paid', val: paidContests },
                      { label:'Wins', val: wins, color: pColor },
                      { label:'Win%', val: `${winPct}%` },
                      { label:'Profit', val: `${profit>=0?'+':''}₹${profit.toFixed(0)}`, color: profit>=0?'#2ecc71':'#e74c3c' },
                      { label:'ROI', val: `${roi>=0?'+':''}${roi}%`, color: parseFloat(roi)>=0?'#2ecc71':'#e74c3c' },
                    ].map(({label,val,color})=>(
                      <div key={label} style={{textAlign:'center',minWidth:44}}>
                        <div style={{fontSize:9,color:'#8899bb',letterSpacing:1,textTransform:'uppercase'}}>{label}</div>
                        <div style={{fontSize:14,fontWeight:800,color:color||'var(--text)',fontFamily:"'Orbitron',sans-serif",marginTop:1}}>{val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Sort value highlight */}
                  <div style={{
                    textAlign:'center', minWidth:64,
                    background:`${pColor}15`, border:`1px solid ${pColor}33`,
                    borderRadius:10, padding:'6px 12px',
                  }}>
                    <div style={{fontSize:8,color:'#8899bb',letterSpacing:1,textTransform:'uppercase',marginBottom:2}}>
                      {SORT_OPTIONS.find(o=>o.value===sortBy)?.label.replace(/^.*? /,'')||sortBy}
                    </div>
                    <div style={{fontSize:16,fontWeight:900,color:pColor,fontFamily:"'Orbitron',sans-serif"}}>
                      {sortBy==='profit'||sortBy==='invested'?`₹${Math.abs(sortVal).toFixed(0)}`:
                       sortBy==='winPct'||sortBy==='roi'?`${sortVal.toFixed(1)}%`:
                       sortBy==='avgPts'||sortBy==='bestPts'?sortVal.toFixed(1):
                       sortVal}
                    </div>
                  </div>

                  {/* Expand chevron */}
                  <div style={{fontSize:18,color:'#8899bb',transition:'transform 0.2s',transform:isExpanded?'rotate(180deg)':'none'}}>⌄</div>
                </div>

                {/* ── Expanded detail ── */}
                {isExpanded && (
                  <div style={{borderTop:`1px solid ${pColor}22`,padding:'16px 18px',background:'rgba(0,0,0,0.2)'}}>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:16}}>

                      {/* Overall stats block */}
                      <div>
                        <div style={{fontSize:10,letterSpacing:3,textTransform:'uppercase',color:'#8899bb',marginBottom:10}}>
                          {filterSeason==='all'?'All-Time Totals':ALL_SEASONS_META.find(s=>s.id===filterSeason)?.label}
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                          {[
                            ['🗓️ Matches Played',  totalMatchesVal],
                            ['🎯 Paid Contests',    paidContests],
                            ['🏆 Total Wins',       wins],
                            ['🥇 1st Place',        winsRank1],
                            ['🥈 2nd Place',        winsRank2],
                            ['📈 Win Rate',         `${winPct}%`],
                            ['💸 Total Invested',   `₹${invested.toLocaleString()}`],
                            ['💰 Total Winnings',   `₹${winnings.toFixed(0)}`],
                            ['📊 Net Profit',       `${profit>=0?'+':''}₹${profit.toFixed(0)}`],
                            ['🔁 ROI',              `${roi>=0?'+':''}${roi}%`],
                            ['⚡ Best Points',      t.bestPts > 0 ? t.bestPts : '—'],
                            ['📐 Avg Points',       avgPts],
                            ['🔥 Best Win Streak',  t.highestWinStreak || 0],
                            ['💀 Worst Loss Streak',t.highestLossStreak || 0],
                          ].map(([label,val])=>(
                            <div key={label} style={{
                              display:'flex',justifyContent:'space-between',alignItems:'center',
                              padding:'5px 8px',background:'rgba(255,255,255,0.03)',
                              borderRadius:6,fontSize:11,
                            }}>
                              <span style={{color:'#8899bb'}}>{label}</span>
                              <span style={{
                                fontWeight:700, color:
                                  label.includes('Profit')||label.includes('ROI') ? (profit>=0?'#2ecc71':'#e74c3c') :
                                  label.includes('Win') ? pColor :
                                  label.includes('Invest') ? '#e74c3c' :
                                  label.includes('Winning') ? '#2ecc71' : 'var(--text)',
                              }}>{val}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Season-by-season breakdown (only for All Time view) */}
                      {filterSeason === 'all' && (
                        <div>
                          <div style={{fontSize:10,letterSpacing:3,textTransform:'uppercase',color:'#8899bb',marginBottom:10}}>Season Breakdown</div>
                          {ALL_SEASONS_META.map(sm => (
                            <SeasonBar key={sm.id} seasonId={sm.id} sData={seasonBreakdown[p]?.[sm.id]} accent={sm.accent} />
                          ))}
                          {/* Seasons not played info */}
                          {ALL_SEASONS_META.filter(sm => !seasonsPlayedAll.includes(sm.id)).length > 0 && (
                            <div style={{marginTop:8,fontSize:10,color:'#555',fontStyle:'italic'}}>
                              Not in: {ALL_SEASONS_META.filter(sm=>!seasonsPlayedAll.includes(sm.id)).map(sm=>sm.short).join(', ')}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Win breakdown visual */}
                      <div>
                        <div style={{fontSize:10,letterSpacing:3,textTransform:'uppercase',color:'#8899bb',marginBottom:10}}>Win Type Breakdown</div>
                        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                          {[
                            {label:'🥇 1st Place', count:winsRank1, color:'#FFD700'},
                            {label:'🥈 2nd Place', count:winsRank2, color:'#C0C0C0'},
                          ].map(({label,count,color})=>(
                            <div key={label} style={{
                              flex:1,minWidth:100,textAlign:'center',
                              background:`${color}11`,border:`1px solid ${color}44`,
                              borderRadius:10,padding:'10px 8px',
                            }}>
                              <div style={{fontSize:10,color:'#8899bb',marginBottom:4}}>{label}</div>
                              <div style={{fontSize:28,fontWeight:900,color,fontFamily:"'Orbitron',sans-serif"}}>{count}</div>
                              <div style={{fontSize:9,color:'#8899bb',marginTop:2}}>
                                {paidContests>0?`${((count/paidContests)*100).toFixed(0)}% of paid`:'—'}
                              </div>
                            </div>
                          ))}
                          <div style={{
                            flex:1,minWidth:100,textAlign:'center',
                            background:'rgba(231,76,60,0.08)',border:'1px solid rgba(231,76,60,0.2)',
                            borderRadius:10,padding:'10px 8px',
                          }}>
                            <div style={{fontSize:10,color:'#8899bb',marginBottom:4}}>❌ Losses</div>
                            <div style={{fontSize:28,fontWeight:900,color:'#e74c3c',fontFamily:"'Orbitron',sans-serif"}}>{paidContests - wins}</div>
                            <div style={{fontSize:9,color:'#8899bb',marginTop:2}}>
                              {paidContests>0?`${(((paidContests-wins)/paidContests)*100).toFixed(0)}% of paid`:'—'}
                            </div>
                          </div>
                        </div>

                        {/* Pnl bar visual */}
                        {invested > 0 && (
                          <div style={{marginTop:14}}>
                            <div style={{fontSize:10,color:'#8899bb',marginBottom:6}}>💹 Invested vs Returned</div>
                            <div style={{position:'relative',height:18,borderRadius:9,background:'rgba(231,76,60,0.15)',overflow:'hidden'}}>
                              <div style={{
                                position:'absolute',left:0,top:0,bottom:0,
                                width:`${Math.min((winnings/Math.max(invested,winnings))*100,100)}%`,
                                background: profit >= 0
                                  ? 'linear-gradient(90deg,#2ecc71,#27ae60)'
                                  : 'linear-gradient(90deg,#e74c3c,#c0392b)',
                                borderRadius:9,transition:'width 0.6s ease',
                              }}/>
                              <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#fff',letterSpacing:0.5}}>
                                ₹{winnings.toFixed(0)} / ₹{invested.toFixed(0)}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ═══ TABLE VIEW ═══ */}
      {viewMode === 'table' && (
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{background:'rgba(255,255,255,0.04)',borderBottom:'1px solid #1e2d50'}}>
                {[
                  {key:'rank',    label:'#'},
                  {key:'player',  label:'Player'},
                  {key:'seasons', label:'Seasons'},
                  {key:'totalMatches', label:'Matches'},
                  {key:'paidContests', label:'Paid'},
                  {key:'wins',    label:'Wins'},
                  {key:'winsRank1',label:'🥇'},
                  {key:'winsRank2',label:'🥈'},
                  {key:'winPct',  label:'Win%'},
                  {key:'invested',label:'Invested'},
                  {key:'winnings',label:'Winnings'},
                  {key:'profit',  label:'Profit'},
                  {key:'roi',     label:'ROI%'},
                  {key:'bestPts', label:'Best Pts'},
                  {key:'avgPts',  label:'Avg Pts'},
                  {key:'winStreak',label:'🔥 Streak'},
                ].map(col => {
                  const isSorted = SORT_OPTIONS.find(o=>o.value===col.key)
                  return (
                    <th
                      key={col.key}
                      onClick={isSorted ? ()=>toggleSort(col.key) : undefined}
                      style={{
                        padding:'10px 12px',textAlign:'left',fontSize:10,color:'#8899bb',
                        fontFamily:"'Rajdhani',sans-serif",letterSpacing:1,whiteSpace:'nowrap',
                        cursor:isSorted?'pointer':'default',
                        color: sortBy===col.key?'#f5a623':'#8899bb',
                        borderBottom:'2px solid '+(sortBy===col.key?'#f5a623':'#1e2d50'),
                      }}
                    >
                      {col.label}{sortBy===col.key?sortDir==='desc'?'↓':'↑':''}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {ranked.map((p, ri) => {
                const t = filterSeason === 'all' ? totals[p] : (seasonBreakdown[p]?.[filterSeason] || {})
                const invested = t.invested || 0
                const winnings = parseFloat(t.winnings || 0)
                const paidContests = t.paidContests || 0
                const wins = t.wins || 0
                const profit = winnings - invested
                const winPct = paidContests > 0 ? ((wins / paidContests) * 100).toFixed(1) : '0.0'
                const roi = invested > 0 ? ((profit / invested) * 100).toFixed(1) : '0.0'
                const avgPts = (t.ptsMatchCount || 0) > 0 ? (t.totalPtsSum / t.ptsMatchCount).toFixed(1) : '—'
                const totalMatchesVal = t.matches || t.totalMatches || 0
                const pColor = ALL_PLAYER_COLORS[p] || '#f5a623'
                const seasonsP = totals[p].seasonsPlayed || []
                const medal = ri===0?'🥇':ri===1?'🥈':ri===2?'🥉':`#${ri+1}`

                return (
                  <tr key={p} style={{borderBottom:'1px solid rgba(255,255,255,0.04)',transition:'background 0.15s'}}>
                    <td style={{padding:'10px 12px',fontSize:16}}>{medal}</td>
                    <td style={{padding:'10px 12px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div style={{width:30,height:30,borderRadius:'50%',background:`${pColor}22`,border:`2px solid ${pColor}`,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Bebas Neue',sans-serif",fontSize:15,color:pColor,flexShrink:0}}>{p[0]}</div>
                        <span style={{fontWeight:700,color:'var(--text)',whiteSpace:'nowrap'}}>{p}</span>
                      </div>
                    </td>
                    <td style={{padding:'10px 12px'}}>
                      <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
                        {seasonsP.map(sid=>(
                          <span key={sid} style={{fontSize:8,padding:'1px 5px',borderRadius:6,background:`${accentForSeason(sid)}20`,color:accentForSeason(sid),border:`1px solid ${accentForSeason(sid)}44`}}>
                            {ALL_SEASONS_META.find(s=>s.id===sid)?.short||sid}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{padding:'10px 12px',color:'var(--text2)'}}>{totalMatchesVal}</td>
                    <td style={{padding:'10px 12px',color:'var(--text2)'}}>{paidContests}</td>
                    <td style={{padding:'10px 12px',color:pColor,fontWeight:700}}>{wins}</td>
                    <td style={{padding:'10px 12px',color:'#FFD700',fontWeight:700}}>{t.winsRank1||0}</td>
                    <td style={{padding:'10px 12px',color:'#C0C0C0',fontWeight:700}}>{t.winsRank2||0}</td>
                    <td style={{padding:'10px 12px',color:'var(--text2)'}}>{winPct}%</td>
                    <td style={{padding:'10px 12px',color:'#e74c3c'}}>₹{invested.toLocaleString()}</td>
                    <td style={{padding:'10px 12px',color:'#2ecc71'}}>₹{winnings.toFixed(0)}</td>
                    <td style={{padding:'10px 12px',fontWeight:700,color:profit>=0?'#2ecc71':'#e74c3c'}}>{profit>=0?'+':''}₹{profit.toFixed(0)}</td>
                    <td style={{padding:'10px 12px',color:parseFloat(roi)>=0?'#2ecc71':'#e74c3c'}}>{roi>=0?'+':''}{roi}%</td>
                    <td style={{padding:'10px 12px',color:'#f5a623'}}>{t.bestPts>0?t.bestPts:'—'}</td>
                    <td style={{padding:'10px 12px',color:'var(--text2)'}}>{avgPts}</td>
                    <td style={{padding:'10px 12px',color:'#f5a623',fontWeight:700}}>{t.highestWinStreak||0}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Footer note ── */}
      <div style={{marginTop:20,padding:'10px 14px',background:'rgba(255,255,255,0.02)',borderRadius:10,border:'1px solid rgba(255,255,255,0.06)',fontSize:11,color:'#8899bb',lineHeight:1.7}}>
        <b style={{color:'var(--text)'}}>ℹ️ Notes:</b> IPL 2024 & Champions Trophy 2025 data has no Dream11 points (not recorded). 
        Nilesh joined from IPL 2025 (Match 32 onwards). Kalpesh &amp; Pritam joined IPL 2026. 
        Rank-based index is used for IPL 2024 stock charts. 
        IPL 2026 stats update live from the cloud.
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────
export default function App() {
  const [matches, setMatches]         = useState([])
  const [fantasyData, setFantasyData] = useState({})   // { matchNo: { youtubeUrl, notes } }
  const [highlightsData, setHighlightsData] = useState({}) // { matchNo: [{ type, url, label }] }
  const [h2hPlayers, setH2hPlayers]   = useState({ p1: null, p2: null })
  const [loading, setLoading]         = useState(false)
  const [activeSection, setActiveSection] = useState('matchlog')
  const [liveState, setLiveState]     = useState({ dot:'', label:'CONNECTING...', info:'Connecting to cloud...' })
  const [clock, setClock]             = useState('')
  const [refreshLeft, setRefreshLeft] = useState(DAILY_LIMIT)
  const [isCooldown, setIsCooldown]   = useState(false)
  const [btnText, setBtnText]         = useState('⟳ Refresh')
  const lastVersionRef = useRef(null)

  const [activeSeason, setActiveSeason] = useState('ipl2026')
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
      const newFantasyData = data.fantasyData || {}
      const newHighlightsData = data.highlightsData || {}
      const newVersion = data.version || data.updatedAt || JSON.stringify(newMatches).length
      if (newVersion !== lastVersionRef.current) {
        lastVersionRef.current = newVersion
        setMatches(newMatches)
        setFantasyData(newFantasyData)
        setHighlightsData(newHighlightsData)
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

  const hasHighlights = useMemo(() => Object.values(highlightsData).some(v => Array.isArray(v) && v.length > 0), [highlightsData])

  const navItems = activeSeason === 'ipl2026' ? [
    { id:'matchlog',    label:'📋 Match Log' },
    { id:'playerstats', label:'👤 Player Stats' },
    { id:'leaderboard', label:'🏆 Leaderboard' },
    { id:'graphs',      label:'📊 Graphs' },
    { id:'stockindex',  label:'📈 Stock Index' },
    { id:'fantasy',     label:'🎯 Fantasy Tips' },
    ...(hasHighlights ? [{ id:'highlights', label:'🎬 Highlights' }] : []),
    { id:'alltime',     label:'🌐 All-Time Stats' },
  ] : [
    { id:'matchlog',    label:'📋 Match Log' },
    { id:'playerstats', label:'👤 Player Stats' },
    { id:'leaderboard', label:'🏆 Leaderboard' },
    { id:'graphs',      label:'📊 Graphs' },
    { id:'stockindex',  label:'📈 Stock Index' },
    { id:'alltime',     label:'🌐 All-Time Stats' },
  ]

  return (
    <>
      {adminView === 'login' && (
        <AdminLogin onLoginSuccess={() => setAdminView('admin')} onBack={() => setAdminView('public')} />
      )}
      {adminView === 'admin' && (
        <AdminPage
          onLogout={() => setAdminView('public')}
          matches={matches}
          fantasyData={fantasyData}
          onFantasyDataSave={(newFD) => setFantasyData(newFD)}
          highlightsData={highlightsData}
          onHighlightsDataSave={(newHD) => setHighlightsData(newHD)}
          onMatchesSave={(newMatches) => setMatches(newMatches)}
        />
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
                <div className="title-main">{activeSeason === 'ipl2026' ? 'VOIS Panthers IPL 2026' : SEASON_CONFIG[activeSeason]?.label || 'VOIS Panthers'}</div>
                <div className="title-sub"><span className="title-live-dot"/>&nbsp;Fantasy League · MyCircle11</div>
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <div className="season-badge" style={{background:`${SEASON_CONFIG[activeSeason]?.themeAccent || "#f5a623"}22`,color:SEASON_CONFIG[activeSeason]?.themeAccent||"#f5a623",borderColor:`${SEASON_CONFIG[activeSeason]?.themeAccent||"#f5a623"}44`}}>{SEASON_CONFIG[activeSeason]?.badge || "IPL 2026"}</div>
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

        {activeSeason === 'ipl2026' && <MarketSentimentTicker matches={matches} />}
        {activeSeason === 'ipl2026' && <TVNewsBulletin matches={matches} />}
        <SeasonSelectorBar activeSeason={activeSeason} onSeasonChange={(s)=>{setActiveSeason(s);setActiveSection('matchlog')}} />

        {/* NAV */}
        <nav>
          <div className="nav-inner">
            {navItems.map(n => (
              <button key={n.id} className={`nav-btn${activeSection===n.id?' active':''}`} onClick={() => setActiveSection(n.id)}>{n.label}</button>
            ))}
          </div>
        </nav>

        {/* SECTIONS — Live 2026 or Historic */}
        {activeSeason === 'ipl2026' ? (
          <>
            <div style={activeSection==='matchlog'    ? {} : {display:'none'}}><MatchLog    matches={matches} /></div>
            <div style={activeSection==='playerstats' ? {} : {display:'none'}}><PlayerStats matches={matches} h2hPlayers={h2hPlayers} setH2hPlayers={setH2hPlayers} /></div>
            <div style={activeSection==='leaderboard' ? {} : {display:'none'}}><Leaderboard matches={matches} /></div>
            <div style={activeSection==='graphs'      ? {} : {display:'none'}}><Graphs      matches={matches} /></div>
            <div style={activeSection==='stockindex'  ? {} : {display:'none'}}><PlayerStockIndex matches={matches} /></div>
            <div style={activeSection==='fantasy'     ? {} : {display:'none'}}><FantasySuggestions matches={matches} fantasyData={fantasyData} /></div>
            <div style={activeSection==='highlights'  ? {} : {display:'none'}}><MatchHighlights matches={matches} highlightsData={highlightsData} /></div>
            <div style={activeSection==='alltime'      ? {} : {display:'none'}}><AllTimeStats liveMatches={matches} /></div>
          </>
        ) : (
          <>
            <HistoricSeasonView seasonId={activeSeason} activeSection={activeSection} />
            <div style={activeSection==='alltime' ? {} : {display:'none'}}><AllTimeStats liveMatches={matches} /></div>
          </>
        )}

        <div className="pb-footer">&copy;&trade; Designed and Developed by <span>Prabhat Singh</span></div>
        {h2hPlayers.p1 && h2hPlayers.p2 && (
          <H2HModal p1={h2hPlayers.p1} p2={h2hPlayers.p2} matches={matches} onClose={() => setH2hPlayers({ p1: null, p2: null })} />
        )}
      </div>
    </>
  )
}
