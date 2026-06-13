import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import usePreview from "../hooks/usePreview";

const API = "http://127.0.0.1:8000";

// ── Helpers ────────────────────────────────────────────────────────────────

function ScoreBadge({ score }) {
  const color = score > 0 ? "#1db954" : score < 0 ? "#ef4444" : "#555";
  return (
    <div style={{
      minWidth: "36px", height: "36px", borderRadius: "8px",
      background: "#111", border: `1px solid ${color}22`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: "14px", fontWeight: 800, color, flexShrink: 0
    }}>
      {score > 0 ? "+" : ""}{score}
    </div>
  );
}

function VoteButtons({ sub, myName, onVote }) {
  const isOwn = sub.submitted_by === myName;
  return (
    <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
      <button onClick={() => onVote(sub.id, sub.my_vote === 1 ? 0 : 1)}
        disabled={isOwn}
        style={{
          width: "32px", height: "32px", borderRadius: "8px", border: "none",
          background: sub.my_vote === 1 ? "#1db954" : "#1a1a1a",
          color: sub.my_vote === 1 ? "#000" : "#666",
          cursor: isOwn ? "default" : "pointer", fontSize: "14px"
        }}>
        ▲
      </button>
      <button onClick={() => onVote(sub.id, sub.my_vote === -1 ? 0 : -1)}
        disabled={isOwn}
        style={{
          width: "32px", height: "32px", borderRadius: "8px", border: "none",
          background: sub.my_vote === -1 ? "#ef4444" : "#1a1a1a",
          color: sub.my_vote === -1 ? "#fff" : "#666",
          cursor: isOwn ? "default" : "pointer", fontSize: "14px"
        }}>
        ▼
      </button>
    </div>
  );
}


// ── Create Room screen ─────────────────────────────────────────────────────

function CreateRoom({ onCreated }) {
  const [roomName,   setRoomName]   = useState("");
  const [ownerName,  setOwnerName]  = useState("");
  const [loading,    setLoading]    = useState(false);

  const create = async () => {
    if (!roomName.trim() || !ownerName.trim()) return;
    setLoading(true);
    const res  = await fetch(`${API}/collab/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: roomName, owner_name: ownerName })
    });
    const data = await res.json();
    setLoading(false);
    onCreated(data.room_id, ownerName);
  };

  return (
    <div style={{ maxWidth: "480px", margin: "80px auto", padding: "0 24px" }}>
      <h1 style={{ fontSize: "32px", fontWeight: 800, color: "#1db954", marginBottom: "8px" }}>
        Collab Playlists
      </h1>
      <p style={{ color: "#555", fontSize: "15px", marginBottom: "36px" }}>
        Create a room, share the link, everyone adds songs and votes.
        Top songs become a real Spotify playlist.
      </p>

      <div className="card">
        <div className="label" style={{ marginBottom: "8px" }}>Room Name</div>
        <input value={roomName} onChange={e => setRoomName(e.target.value)}
          placeholder="Road Trip 2026, Wedding Playlist, etc."
          style={{ width: "100%", padding: "12px 16px", borderRadius: "10px",
            background: "#0e0e0e", border: "1px solid #1a1a1a",
            color: "#fff", fontSize: "14px", outline: "none",
            marginBottom: "16px", boxSizing: "border-box" }} />

        <div className="label" style={{ marginBottom: "8px" }}>Your Name</div>
        <input value={ownerName} onChange={e => setOwnerName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && create()}
          placeholder="What should people see when you add songs?"
          style={{ width: "100%", padding: "12px 16px", borderRadius: "10px",
            background: "#0e0e0e", border: "1px solid #1a1a1a",
            color: "#fff", fontSize: "14px", outline: "none",
            marginBottom: "20px", boxSizing: "border-box" }} />

        <button onClick={create} disabled={loading || !roomName || !ownerName} style={{
          width: "100%", padding: "14px", borderRadius: "12px", border: "none",
          background: (!roomName || !ownerName) ? "#111" : "#1db954",
          color: (!roomName || !ownerName) ? "#333" : "#000",
          fontWeight: 700, fontSize: "15px",
          cursor: (!roomName || !ownerName) ? "default" : "pointer"
        }}>
          {loading ? "Creating..." : "Create Room →"}
        </button>
      </div>

      <div style={{ marginTop: "24px", textAlign: "center" }}>
        <span style={{ color: "#444", fontSize: "13px" }}>Have a room code? </span>
        <button onClick={() => {
          const code = prompt("Enter room code:");
          if (code) {
            const name = prompt("Your name:");
            if (name) onCreated(code.toUpperCase(), name);
          }
        }} style={{
          background: "none", border: "none", color: "#1db954",
          fontSize: "13px", cursor: "pointer", textDecoration: "underline"
        }}>
          Join existing room
        </button>
      </div>
    </div>
  );
}


// ── Song Search ────────────────────────────────────────────────────────────

function SongSearch({ roomId, myName, onSubmitted }) {
  const [query,    setQuery]   = useState("");
  const [results,  setResults] = useState([]);
  const [loading,  setLoading] = useState(false);
  const [added,    setAdded]   = useState(new Set());
  const timer = useRef(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      const res  = await fetch(`${API}/collab/search/tracks?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.tracks || []);
      setLoading(false);
    }, 400);
  }, [query]);

  const submit = async (track) => {
    await fetch(`${API}/collab/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room_id: roomId,
        track_id: track.id,
        track_name: track.name,
        artist_name: track.artist,
        album_name: track.album,
        submitted_by: myName
      })
    });
    setAdded(prev => new Set([...prev, track.id]));
    setQuery("");
    setResults([]);
    onSubmitted();
  };

  return (
    <div style={{ position: "relative" }}>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search any song to add..."
        style={{
          width: "100%", padding: "12px 16px", borderRadius: "12px",
          background: "#111", border: "1px solid #1a1a1a",
          color: "#fff", fontSize: "14px", outline: "none",
          boxSizing: "border-box"
        }}
      />

      {(results.length > 0 || loading) && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          background: "#111", border: "1px solid #1a1a1a", borderRadius: "12px",
          overflow: "hidden", zIndex: 50,
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)"
        }}>
          {loading && (
            <div style={{ padding: "16px", color: "#444", fontSize: "13px" }}>
              Searching...
            </div>
          )}
          {results.map(track => (
            <div key={track.id} style={{
              display: "flex", alignItems: "center", gap: "12px",
              padding: "10px 16px",
              borderBottom: "1px solid #1a1a1a",
              opacity: added.has(track.id) ? 0.4 : 1
            }}>
              {track.image && (
                <img src={track.image} alt="" style={{
                  width: "36px", height: "36px", borderRadius: "4px", flexShrink: 0
                }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {track.name}
                </div>
                <div style={{ fontSize: "11px", color: "#555" }}>
                  {track.artist} · {track.album}
                </div>
              </div>
              <button onClick={() => !added.has(track.id) && submit(track)} style={{
                padding: "6px 14px", borderRadius: "8px", border: "none",
                background: added.has(track.id) ? "#1a1a1a" : "#1db954",
                color: added.has(track.id) ? "#555" : "#000",
                fontSize: "12px", fontWeight: 700,
                cursor: added.has(track.id) ? "default" : "pointer", flexShrink: 0
              }}>
                {added.has(track.id) ? "Added" : "+ Add"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ── Main Room view ─────────────────────────────────────────────────────────

function Room({ roomId, myName, onLeave }) {
  const [room,       setRoom]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [finResult,  setFinResult]  = useState(null);
  const [minScore,   setMinScore]   = useState(0);
  const [copied,     setCopied]     = useState(false);
  const { playing, play }           = usePreview();

  const load = async () => {
    try {
      const res  = await fetch(
        `${API}/collab/${roomId}?voter_name=${encodeURIComponent(myName)}`
      );
      const data = await res.json();
      setRoom(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000); // poll every 5s
    return () => clearInterval(interval);
  }, [roomId, myName]);

  const vote = async (submissionId, v) => {
    await fetch(`${API}/collab/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submission_id: submissionId, voter_name: myName, vote: v })
    });
    load();
  };

  const finalize = async () => {
    setFinalizing(true);
    const res  = await fetch(
      `${API}/collab/${roomId}/finalize?min_score=${minScore}`,
      { method: "POST" }
    );
    const data = await res.json();
    setFinResult(data);
    setFinalizing(false);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/collab/${roomId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading && !room) return <div className="loading">Loading room...</div>;
  if (!room) return <div style={{ padding: "40px", color: "#555" }}>Room not found.</div>;

  const eligible = room.submissions.filter(s => s.score >= minScore);

  return (
    <div style={{ padding: "40px", maxWidth: "900px", margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", marginBottom: "28px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "30px", fontWeight: 800, color: "#fff", marginBottom: "4px" }}>
            {room.room_name}
          </h1>
          <div style={{ display: "flex", gap: "12px", fontSize: "13px", color: "#555" }}>
            <span>Room <span style={{ color: "#1db954", fontWeight: 700, letterSpacing: "1px" }}>
              {roomId}
            </span></span>
            <span>·</span>
            <span>{room.total_songs} songs</span>
            <span>·</span>
            <span>You are <span style={{ color: "#fff" }}>{myName}</span></span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={copyLink} style={{
            padding: "8px 16px", borderRadius: "8px", border: "none",
            background: copied ? "#1db954" : "#1a1a1a",
            color: copied ? "#000" : "#888",
            fontSize: "13px", fontWeight: 600, cursor: "pointer"
          }}>
            {copied ? "✓ Copied!" : "Share Link"}
          </button>
          <button onClick={onLeave} style={{
            padding: "8px 14px", borderRadius: "8px", border: "none",
            background: "#1a1a1a", color: "#666",
            fontSize: "13px", cursor: "pointer"
          }}>
            Leave
          </button>
        </div>
      </div>

      {/* Add song */}
      <div style={{ marginBottom: "28px" }}>
        <div className="label" style={{ marginBottom: "8px" }}>Add a song</div>
        <SongSearch roomId={roomId} myName={myName} onSubmitted={load} />
      </div>

      {/* Finalize section */}
      <div className="card" style={{ marginBottom: "28px",
        border: "1px solid #1a4a2a" }}>
        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>
              Create Spotify Playlist
            </div>
            <div style={{ fontSize: "13px", color: "#555" }}>
              {eligible.length} songs with score ≥ {minScore} will be added,
              sorted by votes.
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <div style={{ fontSize: "12px", color: "#555" }}>Min score:</div>
            {[-1, 0, 1, 2].map(s => (
              <button key={s} onClick={() => setMinScore(s)} style={{
                width: "32px", height: "32px", borderRadius: "8px", border: "none",
                background: minScore === s ? "#1db954" : "#1a1a1a",
                color: minScore === s ? "#000" : "#666",
                fontSize: "12px", fontWeight: 700, cursor: "pointer"
              }}>{s}</button>
            ))}
            {finResult?.success ? (
              <a href={finResult.playlist_url} target="_blank" rel="noreferrer"
                style={{ padding: "8px 20px", borderRadius: "10px",
                  background: "#1db954", color: "#000",
                  fontWeight: 700, fontSize: "13px", textDecoration: "none",
                  whiteSpace: "nowrap" }}>
                Open in Spotify ↗
              </a>
            ) : (
              <button onClick={finalize} disabled={finalizing || eligible.length === 0} style={{
                padding: "8px 20px", borderRadius: "10px", border: "none",
                background: eligible.length === 0 ? "#111" : "#1db954",
                color: eligible.length === 0 ? "#333" : "#000",
                fontWeight: 700, fontSize: "13px",
                cursor: eligible.length === 0 ? "default" : "pointer",
                whiteSpace: "nowrap"
              }}>
                {finalizing ? "Creating..." : `Create (${eligible.length} songs)`}
              </button>
            )}
          </div>
        </div>
        {finResult && !finResult.success && (
          <div style={{ marginTop: "12px", fontSize: "13px", color: "#f87171" }}>
            {finResult.message}
          </div>
        )}
      </div>

      {/* Song list */}
      {room.submissions.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "60px", color: "#444" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>🎵</div>
          No songs yet. Be the first to add one!
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {room.submissions.map((sub, i) => (
            <div key={sub.id} style={{
              display: "flex", alignItems: "center", gap: "12px",
              padding: "14px 16px", borderRadius: "12px",
              background: sub.my_vote === 1 ? "#0d2b18"
                : sub.my_vote === -1 ? "#1a0a0a" : "#0e0e0e",
              border: `1px solid ${
                sub.my_vote === 1 ? "#1a4a2a"
                : sub.my_vote === -1 ? "#3a1a1a" : "#161616"
              }`,
              transition: "all 0.2s"
            }}>

              {/* Rank */}
              <div style={{ width: "24px", textAlign: "center",
                fontSize: "12px", color: "#333", flexShrink: 0 }}>
                {i + 1}
              </div>

              {/* Play button */}
              <button onClick={() => play(sub.track_id, sub.track_name, sub.artist_name)}
                style={{
                  width: "32px", height: "32px", borderRadius: "50%", border: "none",
                  background: playing === sub.track_id ? "#1db954" : "#1a1a1a",
                  color: playing === sub.track_id ? "#000" : "#666",
                  cursor: "pointer", fontSize: "10px", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                {playing === sub.track_id ? "■" : "▶"}
              </button>

              {/* Track info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "14px", fontWeight: 600,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {sub.track_name}
                </div>
                <div style={{ fontSize: "12px", color: "#555", marginTop: "2px",
                  display: "flex", gap: "8px" }}>
                  <span>{sub.artist_name}</span>
                  <span>·</span>
                  <span style={{ color: "#333" }}>
                    added by <span style={{
                      color: sub.submitted_by === myName ? "#1db954" : "#666"
                    }}>
                      {sub.submitted_by}
                    </span>
                  </span>
                </div>
              </div>

              {/* Vote counts */}
              <div style={{ fontSize: "11px", color: "#444",
                textAlign: "center", flexShrink: 0 }}>
                <div style={{ color: "#1db954" }}>▲ {sub.upvotes}</div>
                <div style={{ color: "#ef4444" }}>▼ {sub.downvotes}</div>
              </div>

              {/* Score */}
              <ScoreBadge score={sub.score} />

              {/* Vote buttons */}
              <VoteButtons sub={sub} myName={myName} onVote={vote} />

              {/* Open in Spotify */}
              <a href={sub.spotify_url} target="_blank" rel="noreferrer"
                style={{ color: "#2a2a2a", textDecoration: "none",
                  fontSize: "14px", flexShrink: 0 }}>
                ↗
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ── Main export ────────────────────────────────────────────────────────────

export default function CollabPage() {
  const { roomId: urlRoomId } = useParams();
  const [roomId, setRoomId]   = useState(urlRoomId || null);
  const [myName, setMyName]   = useState(
    () => localStorage.getItem("fidolio_collab_name") || ""
  );
  const [nameInput, setNameInput] = useState("");
  const navigate = useNavigate();

  // If URL has a room ID, ask for name first
  const joinViaUrl = urlRoomId && !myName;

  const handleCreated = (id, name) => {
    localStorage.setItem("fidolio_collab_name", name);
    setMyName(name);
    setRoomId(id.toUpperCase());
    navigate(`/collab/${id.toUpperCase()}`, { replace: true });
  };

  const handleLeave = () => {
    setRoomId(null);
    setMyName("");
    localStorage.removeItem("fidolio_collab_name");
    navigate("/collab", { replace: true });
  };

  // Name prompt when joining via URL
  if (joinViaUrl) {
    return (
      <div style={{ maxWidth: "400px", margin: "100px auto", padding: "0 24px" }}>
        <div className="card">
          <h2 style={{ fontWeight: 700, marginBottom: "16px" }}>
            Joining room <span style={{ color: "#1db954" }}>{urlRoomId}</span>
          </h2>
          <div className="label" style={{ marginBottom: "8px" }}>Your name</div>
          <input value={nameInput} onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && nameInput.trim()) {
                localStorage.setItem("fidolio_collab_name", nameInput);
                setMyName(nameInput);
              }
            }}
            placeholder="How should you appear to others?"
            autoFocus
            style={{ width: "100%", padding: "12px 16px", borderRadius: "10px",
              background: "#0e0e0e", border: "1px solid #1a1a1a",
              color: "#fff", fontSize: "14px", outline: "none",
              marginBottom: "16px", boxSizing: "border-box" }} />
          <button onClick={() => {
            if (!nameInput.trim()) return;
            localStorage.setItem("fidolio_collab_name", nameInput);
            setMyName(nameInput);
          }} style={{
            width: "100%", padding: "12px", borderRadius: "10px", border: "none",
            background: nameInput ? "#1db954" : "#111",
            color: nameInput ? "#000" : "#333",
            fontWeight: 700, fontSize: "14px",
            cursor: nameInput ? "pointer" : "default"
          }}>
            Join Room →
          </button>
        </div>
      </div>
    );
  }

  if (roomId && myName) {
    return <Room roomId={roomId} myName={myName} onLeave={handleLeave} />;
  }

  return <CreateRoom onCreated={handleCreated} />;
}