import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import usePreview from "../hooks/usePreview";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg: "#080808", card: "#0e0e0e", card2: "#111",
  border: "#1a1a1a", border2: "#222",
  green: "#1db954", greenBg: "#0d2b18", greenBd: "#1a4a2a",
  amber: "#f59e0b", amberBg: "#1a1200",
  indigo: "#6366f1", red: "#ef4444", redBg: "#1a0808",
  muted: "#555", sub: "#888", label: "#444",
};
const card = (extra = {}) => ({
  background: C.card, border: `1px solid ${C.border}`,
  borderRadius: "14px", padding: "20px 22px", ...extra,
});
const btn = (v = "primary", extra = {}) => {
  const base = { padding: "9px 18px", borderRadius: "10px", fontSize: "13px",
    fontWeight: 700, cursor: "pointer", border: "none", transition: "all 0.15s" };
  if (v === "primary") return { ...base, background: C.green, color: "#000", ...extra };
  if (v === "ghost")   return { ...base, background: "#151515", color: C.sub,
    border: `1px solid ${C.border}`, ...extra };
  if (v === "danger")  return { ...base, background: C.redBg, color: C.red,
    border: `1px solid #3a1a1a`, ...extra };
  return { ...base, ...extra };
};
const inp = (extra = {}) => ({
  background: C.card2, border: `1px solid ${C.border}`, borderRadius: "10px",
  padding: "10px 14px", color: "#fff", fontSize: "13px", outline: "none",
  width: "100%", boxSizing: "border-box", ...extra,
});

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
  const col = score > 0 ? C.green : score < 0 ? C.red : C.muted;
  return (
    <div style={{ minWidth: "34px", height: "34px", borderRadius: "8px",
      background: "#111", border: `1px solid ${col}33`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: "13px", fontWeight: 800, color: col, flexShrink: 0 }}>
      {score > 0 ? "+" : ""}{score}
    </div>
  );
}


// ─── QR Share popover ─────────────────────────────────────────────────────────
function SharePopover({ roomId, onClose }) {
  const url      = `${window.location.origin}/collab/${roomId}`;
  const qrUrl    = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&color=1db954&bgcolor=0e0e0e&data=${encodeURIComponent(url)}`;
  const [copied, setCopied] = useState(false);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ ...card(), width: "280px", textAlign: "center",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}
        onClick={e => e.stopPropagation()}>

        <div style={{ fontSize: "13px", fontWeight: 700, color: C.sub, marginBottom: "14px" }}>
          Share this room
        </div>

        {/* QR code */}
        <img src={qrUrl} alt="QR" style={{ width: "160px", height: "160px",
          borderRadius: "10px", border: `1px solid ${C.border}` }} />

        {/* Room code */}
        <div style={{ fontSize: "28px", fontWeight: 800, color: C.green,
          letterSpacing: "4px", margin: "14px 0 4px" }}>
          {roomId}
        </div>
        <div style={{ fontSize: "11px", color: C.muted, marginBottom: "16px" }}>
          Room code
        </div>

        <button onClick={() => {
          navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }} style={btn(copied ? "primary" : "ghost", { width: "100%" })}>
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
        style={inp()} autoComplete="off" />

      {(results.length > 0 || loading) && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
          background: "#111", border: `1px solid ${C.border}`, borderRadius: "12px",
          overflow: "hidden", zIndex: 50, boxShadow: "0 12px 40px rgba(0,0,0,0.7)" }}>

          {loading && (
            <div style={{ padding: "14px 16px", color: C.muted, fontSize: "13px" }}>
              Searching...
            </div>
          )}

          {results.map(track => {
            const state = added[track.id];
            return (
              <div key={track.id}
                style={{ display: "flex", alignItems: "center", gap: "10px",
                  padding: "10px 14px", borderBottom: `1px solid ${C.border}`,
                  transition: "background 0.1s",
                  background: state?.ok ? C.greenBg : "transparent" }}>

                {track.image
                  ? <img src={track.image} alt="" style={{ width: "38px", height: "38px",
                      borderRadius: "5px", flexShrink: 0, objectFit: "cover" }} />
                  : <div style={{ width: "38px", height: "38px", borderRadius: "5px",
                      background: C.border, flexShrink: 0 }} />}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {track.name}
                  </div>
                  <div style={{ fontSize: "11px", color: C.muted }}>
                    {track.artist} · {track.album}
                  </div>
                  {state && !state.ok && (
                    <div style={{ fontSize: "11px", color: C.red, marginTop: "2px" }}>
                      {state.msg}
                    </div>
                  )}
                </div>

                <button onClick={() => !state?.ok && submit(track)}
                  disabled={!!state?.ok}
                  style={{ padding: "6px 14px", borderRadius: "8px", border: "none",
                    background: state?.ok ? C.greenBg : C.green,
                    color: state?.ok ? C.green : "#000",
                    fontSize: "11px", fontWeight: 700, flexShrink: 0,
                    cursor: state?.ok ? "default" : "pointer" }}>
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
      // Keep room in localStorage
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
        height: "60vh", color: C.muted, fontSize: "14px" }}>
        Loading room...
      </div>
    );
  }
  if (!room) {
    return (
      <div style={{ padding: "60px", textAlign: "center", color: C.muted }}>
        Room not found.
      </div>
    );
  }

  const isOwner   = room.owner?.trim().toLowerCase() === myName?.trim().toLowerCase();
  const isOpen    = room.status !== "finalized";
  const eligible  = room.submissions.filter(s => s.score >= minScore);
  const hasVibe   = Boolean(room.vibe_preset);

  return (
    <div style={{ padding: "36px 24px 100px", maxWidth: "860px", margin: "0 auto" }}>

      {showShare && <SharePopover roomId={roomId} onClose={() => setShowShare(false)} />}

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px",
              flexWrap: "wrap", marginBottom: "6px" }}>
              <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 800, color: "#fff" }}>
                {room.room_name}
              </h1>
              {hasVibe && (
                <span style={{ fontSize: "12px", fontWeight: 700, padding: "3px 10px",
                  borderRadius: "12px", background: C.greenBg, color: C.green,
                  border: `1px solid ${C.greenBd}` }}>
                  {room.vibe_label}
                </span>
              )}
              {!isOpen && (
                <span style={{ fontSize: "12px", fontWeight: 700, padding: "3px 10px",
                  borderRadius: "12px", background: "#1a1a0a", color: C.amber,
                  border: `1px solid #3a3a10` }}>
                  ✓ Finalized
                </span>
              )}
            </div>
            <div style={{ fontSize: "13px", color: C.muted, display: "flex",
              gap: "10px", flexWrap: "wrap" }}>
              <span>Room <span style={{ color: C.green, fontWeight: 700,
                letterSpacing: "1.5px" }}>{roomId}</span></span>
              <span>·</span>
              <span>{room.total_songs} songs</span>
              <span>·</span>
              <span>You are <span style={{ color: "#fff" }}>{myName}</span>
                {isOwner && <span style={{ color: C.green, fontSize: "11px" }}> (creator)</span>}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => setShowShare(true)}
              style={btn("ghost", { fontSize: "12px", padding: "7px 14px" })}>
              Share 🔗
            </button>
            <button onClick={onLeave}
              style={btn("ghost", { fontSize: "12px", padding: "7px 14px" })}>
              Leave
            </button>
          </div>
        </div>

        {/* Vibe guardrail description */}
        {hasVibe && room.vibe_desc && (
          <div style={{ marginTop: "8px", fontSize: "12px", color: C.sub,
            display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ color: C.green }}>●</span>
            Vibe guardrail: {room.vibe_desc}.
            Songs that don't fit get a ⚠ flag.
          </div>
        )}
      </div>

      {/* ── Vibe note (post-submit warning) ───────────────────────────────── */}
      {vibeNote && (
        <div style={{ ...card({ background: C.amberBg, border: `1px solid #3a2a00`,
          padding: "12px 16px", marginBottom: "16px" }),
          display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "16px" }}>⚠</span>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: C.amber }}>
              Song added, but it's outside the room's vibe
            </div>
            <div style={{ fontSize: "12px", color: C.sub, marginTop: "2px" }}>
              {vibeNote}
            </div>
          </div>
          <button onClick={() => setVibeNote(null)}
            style={{ background: "none", border: "none", color: C.muted,
              cursor: "pointer", marginLeft: "auto", fontSize: "18px" }}>×</button>
        </div>
      )}

      {/* ── Add song section ──────────────────────────────────────────────── */}
      {isOpen && (
        <div style={{ marginBottom: "20px" }}>
          {showSearch ? (
            <div style={{ ...card() }}>
              <div style={{ display: "flex", justifyContent: "space-between",
                alignItems: "center", marginBottom: "12px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>Add a song</div>
                <button onClick={() => setShowSearch(false)}
                  style={{ background: "none", border: "none", color: C.muted,
                    cursor: "pointer", fontSize: "18px" }}>×</button>
              </div>
              <SongSearch roomId={roomId} myName={myName} onSubmitted={handleSubmitted} />
            </div>
          ) : (
            <button onClick={() => setShowSearch(true)}
              style={{ ...btn("primary"), width: "100%", padding: "12px",
                fontSize: "14px" }}>
              + Add a Song
            </button>
          )}
        </div>
      )}

      {/* ── Song list ─────────────────────────────────────────────────────── */}
      {room.submissions.length === 0 ? (
        <div style={{ ...card(), textAlign: "center", padding: "60px 20px", color: C.muted }}>
          <div style={{ fontSize: "36px", marginBottom: "12px" }}>🎵</div>
          <div style={{ fontSize: "14px" }}>No songs yet.</div>
          {isOpen && (
            <div style={{ fontSize: "12px", marginTop: "6px" }}>Be the first to add one!</div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px",
          marginBottom: "24px" }}>
          {room.submissions.map((sub, i) => {
            const isMyVote1 = sub.my_vote === 1;
            const isMyVoteN = sub.my_vote === -1;
            const isMine    = sub.submitted_by?.trim().toLowerCase() === myName?.trim().toLowerCase();

            return (
              <div key={sub.id} style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "11px 14px", borderRadius: "11px",
                background: isMyVote1 ? C.greenBg : isMyVoteN ? C.redBg : C.card,
                border: `1px solid ${isMyVote1 ? C.greenBd : isMyVoteN ? "#3a1a1a" : C.border}`,
                transition: "all 0.15s",
              }}>

                {/* Rank */}
                <div style={{ width: "18px", fontSize: "11px", color: C.label,
                  flexShrink: 0, textAlign: "center" }}>
                  {i + 1}
                </div>

                {/* Album art */}
                {sub.album_image
                  ? <img src={sub.album_image} alt="" style={{ width: "38px", height: "38px",
                      borderRadius: "5px", flexShrink: 0, objectFit: "cover" }} />
                  : <div style={{ width: "38px", height: "38px", borderRadius: "5px",
                      background: C.border, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "16px", color: C.muted }}>♪</div>}

                {/* Play */}
                <button onClick={() => play(sub.track_id, sub.track_name, sub.artist_name)}
                  style={{ width: "30px", height: "30px", borderRadius: "50%", border: "none",
                    background: playing === sub.track_id ? C.green : "#1a1a1a",
                    color: playing === sub.track_id ? "#000" : C.muted,
                    cursor: "pointer", fontSize: "10px", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {playing === sub.track_id ? "■" : "▶"}
                </button>

                {/* Track info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    display: "flex", alignItems: "center", gap: "6px" }}>
                    {sub.track_name}
                    {!sub.vibe_ok && (
                      <span title="Outside room vibe" style={{ fontSize: "11px",
                        color: C.amber, flexShrink: 0 }}>⚠</span>
                    )}
                  </div>
                  <div style={{ fontSize: "11px", color: C.muted, marginTop: "1px",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {sub.artist_name}
                    <span style={{ margin: "0 6px", color: C.label }}>·</span>
                    added by{" "}
                    <span style={{ color: isMine ? C.green : C.sub }}>
                      {sub.submitted_by}
                    </span>
                  </div>
                </div>

                {/* Vote counts */}
                <div style={{ fontSize: "11px", color: C.label, textAlign: "right",
                  flexShrink: 0, lineHeight: 1.6 }}>
                  <div style={{ color: C.green }}>▲ {sub.upvotes}</div>
                  <div style={{ color: C.red }}>▼ {sub.downvotes}</div>
                </div>

                {/* Score */}
                <ScoreBadge score={sub.score} />

                {/* Vote buttons */}
                {isOpen && (
                  <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                    <button onClick={() => vote(sub.id, isMyVote1 ? 0 : 1)}
                      disabled={isMine}
                      style={{ width: "30px", height: "30px", borderRadius: "7px",
                        border: "none",
                        background: isMyVote1 ? C.green : "#1a1a1a",
                        color: isMyVote1 ? "#000" : C.muted,
                        cursor: isMine ? "default" : "pointer", fontSize: "12px" }}>
                      ▲
                    </button>
                    <button onClick={() => vote(sub.id, isMyVoteN ? 0 : -1)}
                      disabled={isMine}
                      style={{ width: "30px", height: "30px", borderRadius: "7px",
                        border: "none",
                        background: isMyVoteN ? C.red : "#1a1a1a",
                        color: isMyVoteN ? "#fff" : C.muted,
                        cursor: isMine ? "default" : "pointer", fontSize: "12px" }}>
                      ▼
                    </button>
                  </div>
                )}

                {/* Remove own + Spotify link */}
                <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                  {isMine && isOpen && (
                    <button onClick={() => remove(sub.id)}
                      title="Remove your submission"
                      style={{ width: "28px", height: "28px", borderRadius: "6px",
                        border: "none", background: "transparent", color: C.label,
                        cursor: "pointer", fontSize: "14px",
                        display: "flex", alignItems: "center", justifyContent: "center" }}>
                      ×
                    </button>
                  )}
                  <a href={sub.spotify_url} target="_blank" rel="noreferrer"
                    style={{ width: "28px", height: "28px", borderRadius: "6px",
                      background: "transparent", color: C.border,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "14px", textDecoration: "none",
                      transition: "color 0.15s" }}
                    onMouseEnter={e => e.target.style.color = C.green}
                    onMouseLeave={e => e.target.style.color = C.border}>
                    ↗
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Finalize section ──────────────────────────────────────────────── */}
      {room.status === "finalized" && room.playlist_url ? (
        <div style={{ ...card({ background: C.greenBg, border: `1px solid ${C.greenBd}` }),
          textAlign: "center" }}>
          <div style={{ fontSize: "20px", fontWeight: 800, color: C.green, marginBottom: "6px" }}>
            ✓ Playlist created
          </div>
          <div style={{ fontSize: "13px", color: C.sub, marginBottom: "16px" }}>
            {room.total_songs} songs, ready to play
          </div>
          <a href={room.playlist_url} target="_blank" rel="noreferrer"
            style={{ ...btn("primary"), display: "inline-block", textDecoration: "none" }}>
            Open in Spotify ↗
          </a>
        </div>
      ) : isOwner ? (
        <div style={{ ...card({ border: `1px solid ${C.greenBd}` }) }}>
          <div style={{ display: "flex", justifyContent: "space-between",
            alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff",
                marginBottom: "4px" }}>
                Create Spotify Playlist
              </div>
              <div style={{ fontSize: "12px", color: C.muted }}>
                {eligible.length} songs with score ≥ {minScore} will be added
              </div>
            </div>

            <div style={{ display: "flex", gap: "6px", alignItems: "center",
              flexWrap: "wrap" }}>
              <span style={{ fontSize: "12px", color: C.muted }}>Min score</span>
              {[-1, 0, 1, 2, 3].map(s => (
                <button key={s} onClick={() => setMinScore(s)}
                  style={{ width: "30px", height: "30px", borderRadius: "7px", border: "none",
                    background: minScore === s ? C.green : "#1a1a1a",
                    color: minScore === s ? "#000" : C.muted,
                    fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                  {s}
                </button>
              ))}
              {finResult?.success ? (
                <a href={finResult.playlist_url} target="_blank" rel="noreferrer"
                  style={{ ...btn("primary"), textDecoration: "none", whiteSpace: "nowrap" }}>
                  Open in Spotify ↗
                </a>
              ) : (
                <button onClick={finalize}
                  disabled={finalizing || eligible.length === 0}
                  style={btn("primary", {
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
            <div style={{ marginTop: "12px", fontSize: "13px", color: C.red }}>
              {finResult.message}
            </div>
          )}
        </div>
      ) : (
        <div style={{ ...card({ border: `1px solid ${C.border2}` }),
          textAlign: "center", padding: "20px" }}>
          <div style={{ fontSize: "13px", color: C.muted }}>
            Waiting for <span style={{ color: "#fff" }}>{room.owner}</span> to finalize the playlist
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Name prompt (joining via shared URL) ─────────────────────────────────────
function NamePrompt({ roomId, onJoin }) {
  const [name, setName] = useState("");

  return (
    <div style={{ maxWidth: "400px", margin: "100px auto", padding: "0 24px" }}>
      <div style={card()}>
        <h2 style={{ margin: "0 0 4px", fontWeight: 800, fontSize: "18px" }}>
          Joining <span style={{ color: C.green }}>{roomId}</span>
        </h2>
        <p style={{ margin: "0 0 20px", color: C.muted, fontSize: "13px" }}>
          What should people see when you add songs?
        </p>
        <input value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && name.trim() && onJoin(name.trim())}
          placeholder="Your name"
          autoFocus
          style={inp({ marginBottom: "14px" })} />
        <button onClick={() => name.trim() && onJoin(name.trim())}
          disabled={!name.trim()}
          style={btn("primary", { width: "100%", padding: "12px",
            opacity: name.trim() ? 1 : 0.4 })}>
          Join Room →
        </button>
      </div>
    </div>
  );
}


// ─── Create Room ──────────────────────────────────────────────────────────────
function CreateRoom({ onCreated }) {
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
    <div style={{ maxWidth: "560px", margin: "0 auto", padding: "40px 24px 100px" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 800, color: C.green, marginBottom: "6px" }}>
        Collab Playlists
      </h1>
      <p style={{ color: C.muted, fontSize: "14px", marginBottom: "32px", margin: "0 0 32px" }}>
        Everybody adds songs and votes. Top picks become a real Spotify playlist.
      </p>

      {/* Your rooms */}
      {myRooms.length > 0 && (
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "11px", fontWeight: 600, color: C.label,
            textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>
            Your Rooms
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {myRooms.map(r => (
              <div key={r.room_id}
                style={{ ...card({ padding: "12px 16px" }),
                  display: "flex", justifyContent: "space-between",
                  alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>
                    {r.room_name}
                  </div>
                  <div style={{ fontSize: "11px", color: C.muted, marginTop: "2px" }}>
                    <span style={{ color: C.green, fontWeight: 600,
                      letterSpacing: "1px" }}>{r.room_id}</span>
                    {r.vibe_label && <span style={{ marginLeft: "8px" }}>{r.vibe_label}</span>}
                  </div>
                </div>
                <button onClick={() => onCreated(r.room_id, r.my_name)}
                  style={btn("ghost", { fontSize: "12px", padding: "6px 14px" })}>
                  Rejoin →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New room form */}
      <div style={card()}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff",
          marginBottom: "18px" }}>New Room</div>

        <div style={{ marginBottom: "14px" }}>
          <label style={{ display: "block", fontSize: "11px", color: C.label,
            fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px",
            marginBottom: "6px" }}>Room Name</label>
          <input value={roomName} onChange={e => setRoomName(e.target.value)}
            placeholder="Road Trip 2026, Wedding Playlist..."
            style={inp()} />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", fontSize: "11px", color: C.label,
            fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px",
            marginBottom: "6px" }}>Your Name</label>
          <input value={ownerName} onChange={e => setOwnerName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && create()}
            placeholder="How should you appear?"
            style={inp()} />
        </div>

        {/* Vibe preset */}
        <div style={{ marginBottom: "22px" }}>
          <label style={{ display: "block", fontSize: "11px", color: C.label,
            fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px",
            marginBottom: "10px" }}>
            Vibe Guardrail <span style={{ color: C.muted, textTransform: "none",
              fontWeight: 400 }}>(optional — flags songs that don't fit)</span>
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {VIBES.map(v => (
              <button key={v.id} onClick={() => setVibe(vibe === v.id ? null : v.id)}
                title={v.desc}
                style={{ padding: "5px 12px", borderRadius: "16px", border: "1px solid",
                  fontSize: "12px", fontWeight: 600, cursor: "pointer",
                  transition: "all 0.15s",
                  background: vibe === v.id ? C.green    : "#151515",
                  color:      vibe === v.id ? "#000"     : C.muted,
                  borderColor: vibe === v.id ? C.green   : C.border }}>
                {v.label}
              </button>
            ))}
          </div>
          {vibe && (
            <div style={{ marginTop: "8px", fontSize: "12px", color: C.sub }}>
              {VIBES.find(v2 => v2.id === vibe)?.desc}
            </div>
          )}
        </div>

        <button onClick={create}
          disabled={loading || !roomName.trim() || !ownerName.trim()}
          style={btn("primary", { width: "100%", padding: "13px", fontSize: "14px",
            opacity: (!roomName.trim() || !ownerName.trim()) ? 0.4 : 1,
            cursor: (!roomName.trim() || !ownerName.trim()) ? "default" : "pointer" })}>
          {loading ? "Creating..." : "Create Room →"}
        </button>
      </div>

      {/* Join existing */}
      <div style={{ marginTop: "20px", textAlign: "center" }}>
        <span style={{ color: C.label, fontSize: "13px" }}>Have a room code? </span>
        <button onClick={() => {
          const code = prompt("Enter room code:");
          if (!code?.trim()) return;
          const name = prompt("Your name:");
          if (!name?.trim()) return;
          onCreated(code.trim().toUpperCase(), name.trim());
        }} style={{ background: "none", border: "none", color: C.green,
          fontSize: "13px", cursor: "pointer", textDecoration: "underline" }}>
          Join existing room
        </button>
      </div>
    </div>
  );
}


// ─── Main export ──────────────────────────────────────────────────────────────
export default function CollabPage() {
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
    navigate("/collab", { replace: true });
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

  return <CreateRoom onCreated={handleCreated} />;
}
