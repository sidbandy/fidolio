import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import usePreview from "../hooks/usePreview";
import { C, FONT, TYPE, SECTION, PAGE_BG, btn as themeBtn, card as themeCard, pill as themePill, input as themeInput } from "../theme";
import Masthead from "../ui/Masthead";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Section 5 — royal purple (Playlists department)
const AC = SECTION[5].color;
const AW = SECTION[5].wash;
const AON = SECTION[5].on;

// ─── Vibe presets (mirrors backend) ──────────────────────────────────────────
const VIBES = [
  { id: "late_night",   label: "Late Night 🌙",   desc: "Chill, low energy, a little dark" },
  { id: "hype",         label: "Hype Session 🔥", desc: "High energy only" },
  { id: "road_trip",    label: "Road Trip 🚗",    desc: "Mid-to-high energy, positive" },
  { id: "good_vibes",   label: "Good Vibes ☀️",   desc: "Happy and uplifting only" },
  { id: "sad_hours",    label: "Sad Hours 💧",    desc: "Low energy, emotional" },
  { id: "acoustic",     label: "Acoustic 🎸",     desc: "Stripped back" },
  { id: "workout",      label: "Workout 🏋️",      desc: "High energy, get moving" },
  { id: "dinner_party", label: "Dinner Party 🍷", desc: "Ambient, classy" },
];

const REACTIONS = ["🔥", "😭", "💀", "✨"];

// ─── localStorage helpers ─────────────────────────────────────────────────────
const saveRoom = (room_id, room_name, my_name, vibe_label) => {
  const rooms = JSON.parse(localStorage.getItem("fidolio_collab_rooms") || "[]");
  const idx   = rooms.findIndex(r => r.room_id === room_id);
  const entry = { room_id, room_name, my_name, vibe_label, ts: Date.now() };
  if (idx >= 0) rooms[idx] = entry; else rooms.unshift(entry);
  localStorage.setItem("fidolio_collab_rooms", JSON.stringify(rooms.slice(0, 10)));
};
const getMyRooms = () =>
  JSON.parse(localStorage.getItem("fidolio_collab_rooms") || "[]");

const saveName = (room_id, name) => {
  const names = JSON.parse(localStorage.getItem("fidolio_collab_names") || "{}");
  names[room_id] = name;
  localStorage.setItem("fidolio_collab_names", JSON.stringify(names));
};
const getNameFor = room_id => {
  const names = JSON.parse(localStorage.getItem("fidolio_collab_names") || "{}");
  return names[room_id] || localStorage.getItem("fidolio_collab_name") || "";
};


// ─── ScoreBadge ───────────────────────────────────────────────────────────────
function ScoreBadge({ score }) {
  const positive = score > 0;
  const negative = score < 0;
  const bg     = positive ? AC : negative ? C.red : "transparent";
  const color  = positive ? C.ink2  : negative ? C.ink : C.muted;
  const border = positive ? AC : negative ? C.red : C.border2;
  return (
    <div style={{
      minWidth: "34px", height: "34px", borderRadius: "4px",
      background: bg, border: `1.5px solid ${border}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: FONT.mono, fontSize: "13px", fontWeight: 800, color, flexShrink: 0,
    }}>
      {score > 0 ? "+" : ""}{score}
    </div>
  );
}


// ─── QR Share popover ─────────────────────────────────────────────────────────
function SharePopover({ roomId, onClose }) {
  const url   = `${window.location.origin}/collab/${roomId}`;
  // QR with warm-charcoal-on-cream palette
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&color=161410&bgcolor=F1EDE4&data=${encodeURIComponent(url)}`;
  const [copied, setCopied] = useState(false);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(22,20,16,0.7)",
      zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        ...themeCard({ width: "292px", textAlign: "center", padding: "28px 24px" }),
        boxShadow: "0 12px 32px rgba(0,0,0,0.45)", border: `1.5px solid ${C.border2}`,
      }} onClick={e => e.stopPropagation()}>

        <div style={{ ...TYPE.micro, marginBottom: "18px" }}>Share this room</div>

        <img src={qrUrl} alt="QR" style={{
          width: "160px", height: "160px",
          border: `1.5px solid ${C.border2}`, borderRadius: "3px", display: "block", margin: "0 auto",
        }} />

        {/* Room code */}
        <div style={{
          fontFamily: FONT.mono, fontSize: "28px", fontWeight: 800, color: AC,
          letterSpacing: "4px", margin: "18px 0 2px",
        }}>
          {roomId}
        </div>
        <div style={{ ...TYPE.micro, marginBottom: "20px" }}>Room code</div>

        <button onClick={() => {
          navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }} style={themeBtn(copied ? "primary" : "ghost", { width: "100%" })}>
          {copied ? "✓ Copied!" : "Copy Link"}
        </button>
      </div>
    </div>
  );
}


// ─── Song Search ──────────────────────────────────────────────────────────────
function SongSearch({ roomId, myName, onSubmitted }) {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [added,   setAdded]   = useState({});  // trackId → {added, warning}
  const timer  = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`${API}/collab/search/tracks?q=${encodeURIComponent(query)}`);
        const d = await r.json();
        setResults(d.tracks || []);
      } catch {}
      setLoading(false);
    }, 350);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setResults([]);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const submit = async (track) => {
    const res = await fetch(`${API}/collab/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room_id:     roomId,
        track_id:    track.id,
        track_name:  track.name,
        artist_name: track.artist,
        album_name:  track.album,
        album_image: track.image,
        submitted_by: myName,
      }),
    });
    const d = await res.json();
    if (d.success) {
      setAdded(prev => ({ ...prev, [track.id]: { ok: true, warning: d.vibe_warning } }));
      setQuery(""); setResults([]);
      onSubmitted(d.vibe_warning);
    } else {
      setAdded(prev => ({ ...prev, [track.id]: { ok: false, msg: d.message } }));
    }
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input value={query} onChange={e => setQuery(e.target.value)}
        placeholder="Search any song to add..."
        style={themeInput({ width: "100%" })} autoComplete="off" />

      {(results.length > 0 || loading) && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
          background: C.card, border: `1.5px solid ${C.border2}`, borderRadius: "4px",
          overflow: "hidden", zIndex: 50, boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
        }}>
          {loading && (
            <div style={{ padding: "14px 16px", ...TYPE.body, fontSize: "13px" }}>
              Searching...
            </div>
          )}

          {results.map(track => {
            const state = added[track.id];
            return (
              <div key={track.id}
                style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "12px 14px",
                  borderBottom: `1px solid ${C.border}`,
                  background: state?.ok ? AW : "transparent",
                }}>

                {track.image
                  ? <img src={track.image} alt="" style={{ width: "38px", height: "38px",
                      borderRadius: "3px", flexShrink: 0, objectFit: "cover" }} />
                  : <div style={{ width: "38px", height: "38px", borderRadius: "3px",
                      background: C.border2, flexShrink: 0 }} />}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: FONT.ui, fontSize: "13px", fontWeight: 600, color: C.ink,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {track.name}
                  </div>
                  <div style={{ fontFamily: FONT.mono, fontSize: "11px", color: C.muted }}>
                    {track.artist} · {track.album}
                  </div>
                  {state && !state.ok && (
                    <div style={{ fontFamily: FONT.mono, fontSize: "11px", color: C.red, marginTop: "2px" }}>
                      {state.msg}
                    </div>
                  )}
                </div>

                <button onClick={() => !state?.ok && submit(track)}
                  disabled={!!state?.ok}
                  style={{
                    padding: "6px 14px", borderRadius: "3px",
                    border: `1.5px solid ${state?.ok ? C.border2 : AC}`,
                    background: state?.ok ? "transparent" : AC,
                    color: state?.ok ? C.muted : C.ink2,
                    fontFamily: FONT.ui, fontSize: "11px", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.04em",
                    flexShrink: 0, cursor: state?.ok ? "default" : "pointer",
                  }}>
                  {state?.ok ? "✓ Added" : "+ Add"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ─── Room view ────────────────────────────────────────────────────────────────
function Room({ roomId, myName, onLeave }) {
  const [room,       setRoom]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [finResult,  setFinResult]  = useState(null);
  const [minScore,   setMinScore]   = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [showShare,  setShowShare]  = useState(false);
  const [vibeNote,   setVibeNote]   = useState(null);  // last submit warning
  const { playing, play } = usePreview();

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/collab/${roomId}?voter_name=${encodeURIComponent(myName)}`);
      const d = await r.json();
      setRoom(d);
      if (d.room_name) saveRoom(roomId, d.room_name, myName, d.vibe_label);
    } catch {}
    setLoading(false);
  }, [roomId, myName]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const vote = async (submissionId, v) => {
    await fetch(`${API}/collab/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submission_id: submissionId, voter_name: myName, vote: v }),
    });
    load();
  };

  const remove = async (submissionId) => {
    if (!confirm("Remove your submission?")) return;
    await fetch(`${API}/collab/submissions/${submissionId}?caller_name=${encodeURIComponent(myName)}`,
      { method: "DELETE" });
    load();
  };

  const react = async (submissionId, emoji) => {
    await fetch(`${API}/collab/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submission_id: submissionId, reactor_name: myName, emoji }),
    });
    load();
  };

  const finalize = async () => {
    setFinalizing(true);
    const r = await fetch(
      `${API}/collab/${roomId}/finalize?min_score=${minScore}&caller_name=${encodeURIComponent(myName)}`,
      { method: "POST" }
    );
    const d = await r.json();
    setFinResult(d);
    if (d.success) load();
    setFinalizing(false);
  };

  const handleSubmitted = (vibeWarning) => {
    load();
    if (vibeWarning?.outside_vibe) {
      setVibeNote(vibeWarning.reason);
      setTimeout(() => setVibeNote(null), 6000);
    }
    setShowSearch(false);
  };

  if (loading && !room) {
    return (
      <div style={{ ...TYPE.body, display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        Loading room...
      </div>
    );
  }
  if (!room) {
    return (
      <div style={{ padding: "60px", textAlign: "center", ...TYPE.body }}>
        Room not found.
      </div>
    );
  }

  const isOwner  = room.owner?.trim().toLowerCase() === myName?.trim().toLowerCase();
  const isOpen   = room.status !== "finalized";
  const eligible = room.submissions.filter(s => s.score >= minScore);
  const hasVibe  = Boolean(room.vibe_preset);

  return (
    <div style={{ background: PAGE_BG, minHeight: "100vh", "--accent": AC, "--accent-ink": AON, "--accent-wash": AW }}>

      {showShare && <SharePopover roomId={roomId} onClose={() => setShowShare(false)} />}

      {/* ── Shared masthead (only in standalone mode) ─────────────────── */}
      <Masthead
        no="05"
        section="Playlists · Collab Room"
        title={room.room_name || "Collab Room"}
        lede={<>
          Everybody adds songs and votes. Top picks become a real Spotify playlist.
          {hasVibe && <> Theme: <b style={{ color: AC }}>{room.vibe_label}</b>.</>}
          {!isOpen && <> <b style={{ color: AC }}>Finalized.</b></>}
        </>}
        actions={<>
          <button onClick={() => setShowShare(true)} style={{
            padding: "8px 16px", borderRadius: "4px",
            border: `1px solid ${C.border2}`,
            background: "transparent", color: C.ink,
            fontFamily: FONT.ui, fontSize: "12px", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.04em", cursor: "pointer",
          }}>
            Share
          </button>
          <button onClick={onLeave} style={{
            padding: "8px 16px", borderRadius: "4px",
            border: `1px solid ${C.border2}`,
            background: "transparent", color: C.ink,
            fontFamily: FONT.ui, fontSize: "12px", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.04em", cursor: "pointer",
          }}>
            Leave
          </button>
        </>}
      />

      {/* ── Stat strip overlapping the masthead edge ──────────────────── */}
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 24px" }}>
        <div style={{
          background: C.card, border: `1px solid ${C.border2}`,
          boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
          borderRadius: "6px", padding: "18px 22px",
          marginTop: -32, position: "relative",
          display: "flex", alignItems: "center", gap: "28px", flexWrap: "wrap",
        }}>
          <div style={{ fontFamily: FONT.mono, fontSize: "11px", color: C.sub }}>
            Room{" "}
            <span style={{ fontFamily: FONT.mono, fontWeight: 800, color: AC, letterSpacing: "1.5px" }}>
              {roomId}
            </span>
          </div>
          <div style={{ width: 1, height: 20, background: C.border2, flexShrink: 0 }} />
          <div style={{ fontFamily: FONT.mono, fontSize: "11px", color: C.sub }}>
            <span style={{ fontWeight: 700, color: C.ink }}>{room.total_songs}</span> songs
          </div>
          <div style={{ width: 1, height: 20, background: C.border2, flexShrink: 0 }} />
          <div style={{ fontFamily: FONT.mono, fontSize: "11px", color: C.sub }}>
            You are{" "}
            <span style={{ fontWeight: 700, color: C.ink }}>{myName}</span>
            {isOwner && (
              <span style={{ marginLeft: 6, fontFamily: FONT.mono, fontSize: "10px",
                background: AC, color: C.ink2, padding: "2px 6px", borderRadius: "3px",
                fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                creator
              </span>
            )}
          </div>

          {/* Room theme note */}
          {hasVibe && room.vibe_desc && (
            <>
              <div style={{ width: 1, height: 20, background: C.border2, flexShrink: 0 }} />
              <div style={{ fontFamily: FONT.mono, fontSize: "11px", color: C.sub }}>
                <span style={{ color: AC, marginRight: 5 }}>●</span>
                Theme: {room.vibe_desc}
              </div>
            </>
          )}
        </div>

        {/* Members in the room */}
        {room.members?.length > 0 && (
          <div style={{ marginTop: "16px", display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontFamily: FONT.mono, fontSize: "10px", color: C.label, textTransform: "uppercase", letterSpacing: "1px", fontWeight: 700 }}>
              In the room · {room.members.length}
            </span>
            {room.members.map((m) => {
              const me = m.trim().toLowerCase() === myName.trim().toLowerCase();
              return (
                <span key={m} style={{
                  fontFamily: FONT.mono, fontSize: "11px", fontWeight: 600,
                  padding: "4px 12px", borderRadius: "3px",
                  background: me ? AC : "transparent",
                  color: me ? C.ink2 : C.sub,
                  border: `1.5px solid ${me ? AC : C.border2}`,
                }}>
                  {m}{me ? " (you)" : ""}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Page body ─────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 24px 100px" }}>

        {/* ── Vibe note (post-submit warning) ─────────────────────────────── */}
        {vibeNote && (
          <div style={{
            display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
            padding: "14px 18px", borderRadius: "4px",
            background: C.amberBg, border: `1.5px solid ${C.amber}`,
            boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
          }}>
            <span style={{ fontSize: "16px", flexShrink: 0 }}>⚠</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT.ui, fontSize: "13px", fontWeight: 700, color: C.ink }}>
                Song added, but it's outside the room's vibe
              </div>
              <div style={{ fontFamily: FONT.body, fontSize: "12px", color: C.sub, marginTop: 2 }}>
                {vibeNote}
              </div>
            </div>
            <button onClick={() => setVibeNote(null)} style={{
              background: "none", border: "none", color: C.muted,
              cursor: "pointer", fontSize: "18px", lineHeight: 1, flexShrink: 0,
            }}>×</button>
          </div>
        )}

        {/* ── Add song section ─────────────────────────────────────────────── */}
        {isOpen && (
          <div style={{ marginBottom: "28px" }}>
            {showSearch ? (
              <div style={{ ...themeCard() }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "center", marginBottom: "16px" }}>
                  <div style={{ fontFamily: FONT.ui, fontSize: "13px", fontWeight: 700, color: C.ink }}>
                    Add a song
                  </div>
                  <button onClick={() => setShowSearch(false)}
                    style={{ background: "none", border: "none", color: C.muted,
                      cursor: "pointer", fontSize: "20px", lineHeight: 1 }}>×</button>
                </div>
                <SongSearch roomId={roomId} myName={myName} onSubmitted={handleSubmitted} />
              </div>
            ) : (
              <button onClick={() => setShowSearch(true)}
                style={themeBtn("primary", { width: "100%", padding: "13px", fontSize: "14px" })}>
                + Add a Song
              </button>
            )}
          </div>
        )}

        {/* ── Song list ────────────────────────────────────────────────────── */}
        {room.submissions.length === 0 ? (
          <div style={{
            ...themeCard({ textAlign: "center", padding: "60px 20px" }),
            border: `1px solid ${C.border2}`,
          }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>🎵</div>
            <div style={{ fontFamily: FONT.ui, fontSize: "14px", fontWeight: 600, color: C.ink }}>No songs yet.</div>
            {isOpen && (
              <div style={{ fontFamily: FONT.body, fontSize: "12px", color: C.sub, marginTop: "6px" }}>
                Be the first to add one!
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "28px" }}>
            {room.submissions.map((sub, i) => {
              const isMyVote1 = sub.my_vote === 1;
              const isMyVoteN = sub.my_vote === -1;
              const isMine    = sub.submitted_by?.trim().toLowerCase() === myName?.trim().toLowerCase();
              const isLeader  = i === 0;

              // Background: leader = amber wash; my upvote = amber wash; my downvote = red wash; else card
              const rowBg      = isLeader ? AW : isMyVote1 ? AW : isMyVoteN ? C.redBg : C.card;
              const rowBorder  = isLeader
                ? `1.5px solid ${AC}`
                : isMyVote1
                  ? `1.5px solid ${AC}`
                  : isMyVoteN
                    ? `1.5px solid ${C.red}`
                    : `1px solid ${C.line}`;
              const rowShadow  = isLeader ? "0 12px 32px rgba(0,0,0,0.45)" : "none";

              return (
                <div key={sub.id} className={isLeader ? "lift" : ""} style={{
                  display: "flex", flexDirection: "column", gap: "10px",
                  padding: "14px 16px", borderRadius: "6px",
                  background: rowBg, border: rowBorder, boxShadow: rowShadow,
                  transition: "all 0.15s",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>

                    {/* Rank */}
                    <div style={{
                      width: "22px", flexShrink: 0, textAlign: "center",
                      fontFamily: FONT.mono, fontSize: i < 3 ? "13px" : "11px",
                      fontWeight: 800, color: isLeader ? AC : C.faint,
                    }}>
                      {i < 3 ? ["01", "02", "03"][i] : String(i + 1).padStart(2, "0")}
                    </div>

                    {/* Album art */}
                    {sub.album_image
                      ? <img src={sub.album_image} alt="" style={{ width: "38px", height: "38px",
                          borderRadius: "3px", flexShrink: 0, objectFit: "cover",
                          border: `1px solid ${C.border}` }} />
                      : <div style={{ width: "38px", height: "38px", borderRadius: "3px",
                          background: C.border2, flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: FONT.mono, fontSize: "16px", color: C.muted }}>♪</div>}

                    {/* Play button */}
                    <button onClick={() => play(sub.track_id, sub.track_name, sub.artist_name)}
                      style={{
                        width: "30px", height: "30px", borderRadius: "4px",
                        border: `1.5px solid ${playing === sub.track_id ? AC : C.border2}`,
                        background: playing === sub.track_id ? AC : "transparent",
                        color: playing === sub.track_id ? C.ink2 : C.ink,
                        cursor: "pointer", fontSize: "10px", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontFamily: FONT.mono,
                      }}>
                      {playing === sub.track_id ? "■" : "▶"}
                    </button>

                    {/* Track info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: FONT.ui, fontSize: "13px", fontWeight: 700, color: C.ink,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        display: "flex", alignItems: "center", gap: "6px",
                      }}>
                        {sub.track_name}
                        {!sub.vibe_ok && (
                          <span title="Outside room vibe" style={{
                            fontFamily: FONT.mono, fontSize: "10px", fontWeight: 700,
                            color: C.amber, flexShrink: 0, letterSpacing: "0.02em",
                          }}>⚠</span>
                        )}
                      </div>
                      <div style={{
                        fontFamily: FONT.mono, fontSize: "11px", color: C.muted, marginTop: "2px",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {sub.artist_name}
                        <span style={{ margin: "0 6px", color: C.border2 }}>·</span>
                        added by{" "}
                        <span style={{ color: isMine ? AC : C.sub, fontWeight: isMine ? 700 : 400 }}>
                          {sub.submitted_by}
                        </span>
                      </div>
                    </div>

                    {/* Vote counts */}
                    <div style={{
                      fontFamily: FONT.mono, fontSize: "11px", color: C.label,
                      textAlign: "right", flexShrink: 0, lineHeight: 1.7,
                    }}>
                      <div style={{ color: AC }}>▲ {sub.upvotes}</div>
                      <div style={{ color: C.red }}>▼ {sub.downvotes}</div>
                    </div>

                    {/* Score badge */}
                    <ScoreBadge score={sub.score} />

                    {/* Vote buttons */}
                    {isOpen && (
                      <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                        <button onClick={() => vote(sub.id, isMyVote1 ? 0 : 1)}
                          disabled={isMine}
                          style={{
                            width: "30px", height: "30px", borderRadius: "4px",
                            border: `1.5px solid ${isMyVote1 ? AC : C.border2}`,
                            background: isMyVote1 ? AC : "transparent",
                            color: isMyVote1 ? C.ink2 : C.muted,
                            cursor: isMine ? "default" : "pointer",
                            fontFamily: FONT.mono, fontSize: "12px",
                          }}>
                          ▲
                        </button>
                        <button onClick={() => vote(sub.id, isMyVoteN ? 0 : -1)}
                          disabled={isMine}
                          style={{
                            width: "30px", height: "30px", borderRadius: "4px",
                            border: `1.5px solid ${isMyVoteN ? C.red : C.border2}`,
                            background: isMyVoteN ? C.red : "transparent",
                            color: isMyVoteN ? C.ink2 : C.muted,
                            cursor: isMine ? "default" : "pointer",
                            fontFamily: FONT.mono, fontSize: "12px",
                          }}>
                          ▼
                        </button>
                      </div>
                    )}

                    {/* Remove own + Spotify link */}
                    <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                      {isMine && isOpen && (
                        <button onClick={() => remove(sub.id)}
                          title="Remove your submission"
                          style={{
                            width: "28px", height: "28px", borderRadius: "4px",
                            border: `1px solid ${C.border2}`, background: "transparent",
                            color: C.muted, cursor: "pointer", fontSize: "14px",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                          ×
                        </button>
                      )}
                      <a href={sub.spotify_url} target="_blank" rel="noreferrer"
                        style={{
                          width: "28px", height: "28px", borderRadius: "4px",
                          border: `1px solid ${C.border2}`, background: "transparent",
                          color: C.sub, display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "14px", textDecoration: "none", transition: "color 0.15s",
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = AC}
                        onMouseLeave={e => e.currentTarget.style.color = C.sub}>
                        ↗
                      </a>
                    </div>
                  </div>

                  {/* Reactions — boxy mono tags */}
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", paddingLeft: "32px" }}>
                    {REACTIONS.map((em) => {
                      const rx  = (sub.reactions || []).find((x) => x.emoji === em);
                      const cnt = rx?.count || 0;
                      return (
                        <button key={em} onClick={() => react(sub.id, em)}
                          style={{
                            padding: "4px 12px", borderRadius: "3px", cursor: "pointer",
                            fontFamily: FONT.mono, fontSize: "12px", lineHeight: 1.5,
                            background: rx?.mine ? AW : "transparent",
                            border: `1.5px solid ${rx?.mine ? AC : C.border2}`,
                            color: cnt > 0 ? C.ink : C.muted,
                          }}>
                          {em}{cnt > 0 ? ` ${cnt}` : ""}
                        </button>
                      );
                    })}
                  </div>

                  {/* Leader bar (rank 1 only) */}
                  {isLeader && (
                    <div style={{ paddingLeft: "32px" }}>
                      <div style={{ height: "3px", background: C.border2 }}>
                        <div style={{ height: "3px", background: AC, width: "100%", transition: "width 0.6s" }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Finalize section ─────────────────────────────────────────────── */}
        {room.status === "finalized" && room.playlist_url ? (
          <div style={{
            ...themeCard({ textAlign: "center", padding: "32px 24px" }),
            border: `1px solid ${C.border2}`, boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
            background: AW,
          }}>
            <div style={{
              fontFamily: FONT.display, fontSize: "22px", fontWeight: 800, color: AC, marginBottom: "8px",
            }}>
              ✓ Playlist created
            </div>
            <div style={{ fontFamily: FONT.body, fontSize: "13px", color: C.sub, marginBottom: "20px" }}>
              {room.total_songs} songs, ready to play
            </div>
            <a href={room.playlist_url} target="_blank" rel="noreferrer"
              style={{ ...themeBtn("primary"), display: "inline-flex", textDecoration: "none" }}>
              Open in Spotify ↗
            </a>
          </div>
        ) : isOwner ? (
          <div style={{
            ...themeCard(), border: `1px solid ${C.border2}`,
            boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between",
              alignItems: "center", flexWrap: "wrap", gap: "14px" }}>
              <div>
                <div style={{ fontFamily: FONT.ui, fontSize: "14px", fontWeight: 700, color: C.ink, marginBottom: "4px" }}>
                  Create Spotify Playlist
                </div>
                <div style={{ fontFamily: FONT.mono, fontSize: "11px", color: C.sub }}>
                  {eligible.length} songs with score ≥ {minScore} will be added
                </div>
              </div>

              <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontFamily: FONT.mono, fontSize: "11px", color: C.muted }}>Min score</span>
                {[-1, 0, 1, 2, 3].map(s => (
                  <button key={s} onClick={() => setMinScore(s)}
                    style={{
                      width: "30px", height: "30px", borderRadius: "4px",
                      border: `1.5px solid ${minScore === s ? AC : C.border2}`,
                      background: minScore === s ? AC : "transparent",
                      color: minScore === s ? C.ink2 : C.muted,
                      fontFamily: FONT.mono, fontSize: "12px", fontWeight: 700, cursor: "pointer",
                    }}>
                    {s}
                  </button>
                ))}
                {finResult?.success ? (
                  <a href={finResult.playlist_url} target="_blank" rel="noreferrer"
                    style={{ ...themeBtn("primary"), textDecoration: "none", whiteSpace: "nowrap" }}>
                    Open in Spotify ↗
                  </a>
                ) : (
                  <button onClick={finalize}
                    disabled={finalizing || eligible.length === 0}
                    style={themeBtn("primary", {
                      opacity: eligible.length === 0 ? 0.4 : 1,
                      whiteSpace: "nowrap",
                      cursor: eligible.length === 0 ? "default" : "pointer",
                    })}>
                    {finalizing ? "Creating..." : `Create (${eligible.length} songs)`}
                  </button>
                )}
              </div>
            </div>

            {finResult && !finResult.success && (
              <div style={{ marginTop: "14px", fontFamily: FONT.mono, fontSize: "12px", color: C.red }}>
                {finResult.message}
              </div>
            )}
          </div>
        ) : (
          <div style={{
            ...themeCard({ padding: "22px", textAlign: "center" }),
            border: `1px solid ${C.border2}`,
          }}>
            <div style={{ fontFamily: FONT.body, fontSize: "13px", color: C.sub }}>
              Waiting for{" "}
              <span style={{ fontWeight: 700, color: C.ink }}>{room.owner}</span>
              {" "}to finalize the playlist
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Name prompt (joining via shared URL) ─────────────────────────────────────
function NamePrompt({ roomId, onJoin }) {
  const [name, setName] = useState("");

  return (
    <div style={{ background: PAGE_BG, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", "--accent": AC, "--accent-ink": AON, "--accent-wash": AW }}>
      <div style={{ maxWidth: "400px", width: "100%", padding: "0 24px" }}>
        <div style={{
          ...themeCard({ padding: "32px 28px" }),
          border: `1px solid ${C.border2}`, boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
        }}>
          {/* Mini masthead kicker */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <span style={{ width: 10, height: 10, background: AC, flexShrink: 0 }} />
            <div style={{ fontFamily: FONT.mono, fontSize: "10px", fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "1.5px", color: AC }}>
              Playlists · Collab
            </div>
          </div>
          <h2 style={{ fontFamily: FONT.display, margin: "0 0 4px", fontWeight: 800, fontSize: "22px", color: C.ink }}>
            Joining{" "}
            <span style={{ color: AC }}>{roomId}</span>
          </h2>
          <p style={{ ...TYPE.body, margin: "0 0 24px", fontSize: "13px" }}>
            What should people see when you add songs?
          </p>
          <input value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && name.trim() && onJoin(name.trim())}
            placeholder="Your name"
            autoFocus
            style={themeInput({ width: "100%", marginBottom: "14px" })} />
          <button onClick={() => name.trim() && onJoin(name.trim())}
            disabled={!name.trim()}
            style={themeBtn("primary", { width: "100%", padding: "13px", opacity: name.trim() ? 1 : 0.4 })}>
            Join Room →
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Create Room ──────────────────────────────────────────────────────────────
function CreateRoom({ onCreated, embedded = false }) {
  const [roomName,  setRoomName]  = useState("");
  const [ownerName, setOwnerName] = useState(
    localStorage.getItem("fidolio_collab_name") || ""
  );
  const [vibe,    setVibe]    = useState(null);
  const [loading, setLoading] = useState(false);
  const myRooms = getMyRooms();

  const create = async () => {
    if (!roomName.trim() || !ownerName.trim()) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/collab/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: roomName, owner_name: ownerName, vibe_preset: vibe }),
      });
      const d = await r.json();
      localStorage.setItem("fidolio_collab_name", ownerName);
      onCreated(d.room_id, ownerName, d.vibe_label);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: PAGE_BG, minHeight: embedded ? "auto" : "100vh", "--accent": AC, "--accent-ink": AON, "--accent-wash": AW }}>

      {/* Shared masthead — only when not embedded */}
      {!embedded && (
        <Masthead
          no="05"
          section="Playlists · Collab Room"
          title="Collab Room"
          lede={<>Everybody adds songs and votes. Top picks become a real Spotify playlist.</>}
        />
      )}

      <div style={{ maxWidth: "560px", margin: "0 auto", padding: embedded ? "0 0 40px" : "0 24px 100px" }}>

        {/* Spacer from masthead */}
        {!embedded && <div style={{ marginTop: 28 }} />}

        {/* Your rooms */}
        {myRooms.length > 0 && (
          <div style={{ marginBottom: "28px", marginTop: embedded ? 0 : 0 }}>
            <div style={{ fontFamily: FONT.mono, fontSize: "10px", fontWeight: 700, color: C.label,
              textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px" }}>
              Your Rooms
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {myRooms.map(r => (
                <div key={r.room_id} style={{
                  ...themeCard({ padding: "14px 16px" }),
                  border: `1px solid ${C.border2}`,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
                }}>
                  <div>
                    <div style={{ fontFamily: FONT.ui, fontSize: "14px", fontWeight: 700, color: C.ink }}>
                      {r.room_name}
                    </div>
                    <div style={{ fontFamily: FONT.mono, fontSize: "11px", color: C.muted, marginTop: "2px" }}>
                      <span style={{ color: AC, fontWeight: 700, letterSpacing: "1px" }}>{r.room_id}</span>
                      {r.vibe_label && <span style={{ marginLeft: "8px", color: C.sub }}>{r.vibe_label}</span>}
                    </div>
                  </div>
                  <button onClick={() => onCreated(r.room_id, r.my_name)}
                    style={themeBtn("ghost", { fontSize: "12px", padding: "6px 14px" })}>
                    Rejoin →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* New room form */}
        <div style={{
          ...themeCard(), border: `1px solid ${C.border2}`,
          boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
        }}>
          <div style={{ fontFamily: FONT.mono, fontSize: "10px", fontWeight: 700, color: C.label,
            textTransform: "uppercase", letterSpacing: "1px", marginBottom: "20px" }}>
            New Room
          </div>

          <div style={{ marginBottom: "18px" }}>
            <label style={{ display: "block", fontFamily: FONT.mono, fontSize: "10px", color: C.label,
              fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>
              Room Name
            </label>
            <input value={roomName} onChange={e => setRoomName(e.target.value)}
              placeholder="Road Trip 2026, Wedding Playlist..."
              style={themeInput({ width: "100%" })} />
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label style={{ display: "block", fontFamily: FONT.mono, fontSize: "10px", color: C.label,
              fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>
              Your Name
            </label>
            <input value={ownerName} onChange={e => setOwnerName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && create()}
              placeholder="How should you appear?"
              style={themeInput({ width: "100%" })} />
          </div>

          {/* Playlist theme — free text describing what this room is for */}
          <div style={{ marginBottom: "28px" }}>
            <label style={{ display: "block", fontFamily: FONT.mono, fontSize: "10px", color: C.label,
              fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>
              Playlist Theme{" "}
              <span style={{ fontFamily: FONT.body, color: C.muted, textTransform: "none",
                fontWeight: 400, fontSize: "11px" }}>
                (optional — what kind of playlist is this?)
              </span>
            </label>
            <div style={{ height: "1px", background: C.border2, marginBottom: "14px" }} />
            <input value={vibe || ""} onChange={e => setVibe(e.target.value)}
              placeholder="e.g. chill study beats, hype gym mix, road-trip sing-alongs"
              style={themeInput({ width: "100%" })} />
          </div>

          <button onClick={create}
            disabled={loading || !roomName.trim() || !ownerName.trim()}
            style={themeBtn("primary", {
              width: "100%", padding: "13px", fontSize: "14px",
              opacity: (!roomName.trim() || !ownerName.trim()) ? 0.4 : 1,
              cursor: (!roomName.trim() || !ownerName.trim()) ? "default" : "pointer",
            })}>
            {loading ? "Creating..." : "Create Room →"}
          </button>
        </div>

        {/* Join existing */}
        <div style={{ marginTop: "20px", textAlign: "center" }}>
          <span style={{ fontFamily: FONT.body, color: C.sub, fontSize: "13px" }}>Have a room code? </span>
          <button onClick={() => {
            const code = prompt("Enter room code:");
            if (!code?.trim()) return;
            const name = prompt("Your name:");
            if (!name?.trim()) return;
            onCreated(code.trim().toUpperCase(), name.trim());
          }} style={{
            background: "none", border: "none", color: AC,
            fontSize: "13px", cursor: "pointer",
            fontFamily: FONT.ui, fontWeight: 700,
            textDecoration: "underline",
          }}>
            Join existing room
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Main export ──────────────────────────────────────────────────────────────
export default function CollabPage({ embedded = false }) {
  const { roomId: urlRoomId } = useParams();
  const navigate = useNavigate();

  const [roomId, setRoomId] = useState(urlRoomId?.toUpperCase() || null);
  const [myName, setMyName] = useState(() =>
    urlRoomId ? getNameFor(urlRoomId.toUpperCase()) : ""
  );

  const handleCreated = (id, name, vibeLabel) => {
    const rid = id.toUpperCase();
    saveName(rid, name);
    localStorage.setItem("fidolio_collab_name", name);
    setMyName(name);
    setRoomId(rid);
    navigate(`/collab/${rid}`, { replace: true });
  };

  const handleLeave = () => {
    setRoomId(null);
    setMyName("");
    navigate("/playlists", { replace: true });
  };

  // Joined via shared URL but no name stored
  if (urlRoomId && !myName) {
    return (
      <NamePrompt
        roomId={urlRoomId.toUpperCase()}
        onJoin={name => {
          const rid = urlRoomId.toUpperCase();
          saveName(rid, name);
          localStorage.setItem("fidolio_collab_name", name);
          setMyName(name);
        }}
      />
    );
  }

  if (roomId && myName) {
    return <Room roomId={roomId} myName={myName} onLeave={handleLeave} />;
  }

  return <CreateRoom onCreated={handleCreated} embedded={embedded} />;
}
