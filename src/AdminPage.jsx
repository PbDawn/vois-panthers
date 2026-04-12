// ═══════════════════════════════════════════════════════════════
// AdminPage.jsx — Admin Panel with Fantasy Tips Editor
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react'

const ADMIN_HTML_URL   = 'https://pbdawn.github.io/vois-ipl-tracker/indexadmin.html'
const JSONBIN_BASE     = 'https://api.jsonbin.io/v3/b'
const HARDCODED_BIN_ID = '69c84b985fdde574550bf9f7'

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
function HighlightsAdmin({ matches, highlightsData, onHighlightsDataSave }) {
  const [localData, setLocalData]     = useState({})
  const [saving, setSaving]           = useState(false)
  const [saveMsg, setSaveMsg]         = useState('')
  const [openMatchNo, setOpenMatchNo] = useState(null)
  // Per-match new-item form state
  const [newUrl, setNewUrl]           = useState('')
  const [newLabel, setNewLabel]       = useState('')
  const [newType, setNewType]         = useState('auto')

  useEffect(() => { setLocalData(highlightsData || {}) }, [highlightsData])

  function detectType(url) {
    if (!url) return 'unknown'
    if (url.includes('instagram.com')) return 'instagram'
    if (url.includes('youtube.com/shorts')) return 'youtube_shorts'
    if (url.includes('youtu.be') || url.includes('youtube.com')) return 'youtube'
    return 'unknown'
  }

  const saveToCloud = async (newData) => {
    setSaving(true); setSaveMsg('')
    try {
      let binData = {}
      const getRes = await fetch(`${JSONBIN_BASE}/${HARDCODED_BIN_ID}/latest`, { headers: { 'X-Bin-Meta': 'false' } })
      if (getRes.ok) { binData = await getRes.json() }
      else {
        const getRes2 = await fetch(`${JSONBIN_BASE}/${HARDCODED_BIN_ID}/latest`)
        if (getRes2.ok) { const d = await getRes2.json(); binData = d.record || d }
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
    } catch (err) {
      setSaveMsg(`❌ ${err.message}`)
    } finally { setSaving(false) }
  }

  const addClip = async (matchNo) => {
    if (!newUrl.trim()) return
    const type = newType === 'auto' ? detectType(newUrl.trim()) : newType
    const clip = { type, url: newUrl.trim(), label: newLabel.trim() || `Highlight` }
    const existing = localData[matchNo] || []
    const newData = { ...localData, [matchNo]: [...existing, clip] }
    setLocalData(newData)
    setNewUrl(''); setNewLabel(''); setNewType('auto')
    await saveToCloud(newData)
  }

  const removeClip = async (matchNo, idx) => {
    if (!window.confirm(`Remove this highlight?`)) return
    const existing = [...(localData[matchNo] || [])]
    existing.splice(idx, 1)
    const newData = { ...localData, [matchNo]: existing }
    if (existing.length === 0) delete newData[matchNo]
    setLocalData(newData)
    await saveToCloud(newData)
  }

  return (
    <div style={{ padding: '16px 20px', color: '#e8eaf6', fontFamily: "'Rajdhani', sans-serif" }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 3, color: '#f5a623', marginBottom: 4 }}>
        🎬 HIGHLIGHTS MANAGER
      </div>
      <div style={{ fontSize: 12, color: '#8899bb', marginBottom: 20 }}>
        Add Instagram Reels and YouTube Shorts per match. Multiple clips per match supported. Visible to public on the Highlights tab.
      </div>

      {matches.length === 0 && (
        <div style={{ fontSize: 12, color: '#8899bb', padding: 24, textAlign: 'center', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 10 }}>
          No matches loaded.
        </div>
      )}

      {saveMsg && (
        <div style={{ fontSize: 12, color: saveMsg.startsWith('✅') ? '#2ecc71' : '#e74c3c', marginBottom: 12, background: saveMsg.startsWith('✅') ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)', border: `1px solid ${saveMsg.startsWith('✅') ? 'rgba(46,204,113,0.3)' : 'rgba(231,76,60,0.3)'}`, borderRadius: 8, padding: '8px 12px' }}>
          {saveMsg}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[...matches].sort((a, b) => parseInt(b.matchno) - parseInt(a.matchno)).map(m => {
          const mn = parseInt(m.matchno)
          const clips = localData[mn] || []
          const isOpen = openMatchNo === mn
          const done = m.teamwon && m.teamwon.trim() !== '' && m.teamwon !== '—'

          return (
            <div key={mn} style={{
              background: isOpen ? 'rgba(245,166,35,0.06)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isOpen ? 'rgba(245,166,35,0.35)' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 10, overflow: 'hidden',
            }}>
              {/* Match row header */}
              <div
                onClick={() => setOpenMatchNo(isOpen ? null : mn)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', flexWrap: 'wrap' }}
              >
                <span style={{
                  background: done ? 'rgba(46,204,113,0.15)' : 'rgba(245,166,35,0.15)',
                  color: done ? '#2ecc71' : '#f5a623',
                  border: `1px solid ${done ? 'rgba(46,204,113,0.3)' : 'rgba(245,166,35,0.3)'}`,
                  borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700,
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
                <span style={{ fontSize: 11, color: '#8899bb', marginLeft: 4 }}>{isOpen ? '▲' : '▼'}</span>
              </div>

              {/* Expanded panel */}
              {isOpen && (
                <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                  {/* Existing clips */}
                  {clips.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 11, color: '#8899bb', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                        Current Clips ({clips.length})
                      </div>
                      {clips.map((c, i) => {
                        const t = c.type || 'unknown'
                        const isIg = t === 'instagram'
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '8px 10px', flexWrap: 'wrap' }}>
                            <span style={{
                              fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 900, letterSpacing: 1, flexShrink: 0,
                              background: isIg ? 'linear-gradient(45deg,#f09433,#dc2743,#bc1888)' : '#e74c3c',
                              color: '#fff',
                            }}>
                              {isIg ? 'IG' : t === 'youtube_shorts' ? 'YT SHORT' : 'YT'}
                            </span>
                            <span style={{ fontWeight: 700, fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.label || `Clip ${i + 1}`}
                            </span>
                            <a href={c.url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#8899bb', textDecoration: 'none' }}>↗ link</a>
                            <button onClick={() => removeClip(mn, i)} style={btnStyle('#e74c3c')}>🗑 Remove</button>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Add new clip form */}
                  <div style={{ background: 'rgba(245,166,35,0.04)', border: '1px solid rgba(245,166,35,0.2)', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 11, color: '#f5a623', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                      ➕ Add New Clip to Match #{mn}
                    </div>

                    <div>
                      <label style={labelStyle}>Clip Label / Title</label>
                      <input
                        value={newLabel}
                        onChange={e => setNewLabel(e.target.value)}
                        placeholder="e.g. Kohli's 6 sixes over, Bumrah hat-trick..."
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Instagram / YouTube URL</label>
                      <input
                        value={newUrl}
                        onChange={e => setNewUrl(e.target.value)}
                        placeholder="https://www.instagram.com/reel/... or https://youtube.com/shorts/..."
                        style={inputStyle}
                      />
                      {newUrl && (
                        <div style={{ fontSize: 10, marginTop: 4, color: detectType(newUrl) === 'unknown' ? '#e74c3c' : '#2ecc71' }}>
                          {detectType(newUrl) === 'instagram' && '✅ Instagram Reel detected'}
                          {detectType(newUrl) === 'youtube_shorts' && '✅ YouTube Short detected'}
                          {detectType(newUrl) === 'youtube' && '✅ YouTube Video detected'}
                          {detectType(newUrl) === 'unknown' && '⚠️ Unknown URL format — paste Instagram or YouTube link'}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => addClip(mn)}
                        disabled={saving || !newUrl.trim()}
                        style={{ ...btnStyle('#2ecc71'), fontSize: 13, padding: '9px 20px', opacity: (!newUrl.trim() || saving) ? 0.5 : 1 }}
                      >
                        {saving ? '⏳ Saving...' : '➕ Add Clip'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 16, background: 'rgba(52,152,219,0.06)', border: '1px dashed rgba(52,152,219,0.25)', borderRadius: 10, padding: '12px 16px', fontSize: 11, color: '#8899bb', lineHeight: 1.8 }}>
        <div style={{ color: '#3498db', fontWeight: 700, marginBottom: 4, fontSize: 12 }}>💡 How Highlights Work</div>
        <div>1. Click any match row to expand it</div>
        <div>2. Paste Instagram Reel URL or YouTube Shorts/video URL</div>
        <div>3. Give it a label (e.g. "Kohli 50 off 22 balls")</div>
        <div>4. Click <b style={{ color: '#2ecc71' }}>Add Clip</b> — saved to cloud instantly</div>
        <div>5. Users see all clips for each match on the <b style={{ color: '#f5a623' }}>🎬 Highlights</b> tab</div>
        <div>6. Instagram reels embed in-app with an option to open on Instagram</div>
      </div>
    </div>
  )
}

// ─── MAIN ADMIN PAGE ─────────────────────────────────────────
export default function AdminPage({ onLogout, matches = [], fantasyData = {}, onFantasyDataSave, highlightsData = {}, onHighlightsDataSave }) {
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
        <div style={{ display: 'flex', gap: 6 }}>
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
          <iframe
            src={ADMIN_HTML_URL}
            style={styles.iframe}
            title="VOIS Panthers Admin"
            allow="clipboard-write"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
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
  iframe: { width: '100%', height: '100%', border: 'none', background: '#0a0f1e', display: 'block' },
}
