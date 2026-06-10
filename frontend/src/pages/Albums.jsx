import { useState } from "react";

const API = "http://127.0.0.1:8000";

function ScoreBar({ score, max = 1 }) {
  const pct = Math.round((score / max) * 100);
  return (
    <div style={{ height: "4px", background: "#1a1a1a", borderRadius: "2px", marginTop: "6px" }}>
      <div style={{
        height: "4px", borderRadius: "2px",
        background: pct > 65 ? "#1db954" : pct > 40 ? "#f59e0b" : "#6366f1",
        width: `${pct}%`, transition: "width 0.4s"
      }} />
    </div>
  );
}

function FeaturePill({ label, value, isPercent = true }) {
  if (!value) return null;
  return (
    <span style={{ fontSize: "11px", color: "#555", background: "#151515",
      padding: "3px 8px", borderRadius: "4px" }}>
      {label}: {isPercent ? `${Math.round(value * 100)}%` : value}
    </span>
  );
}

export default function Albums() {
  const [albumName,  setAlbumName]  = useState("");
  const [artistName, setArtistName] = useState("");
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [blindSpots, setBlindSpots] = useState(null);
  const [loadingBS,  setLoadingBS]  = useState(false);
  const [tab,        setTab]        = useState("explorer");

  const exploreAlbum = async () => {
    if (!albumName || !artistName) return;
    setLoading(true);
    setData(null);
    try {
      const res  = await fetch(
        `${API}/albums/explore?album_name=${encodeURIComponent(albumName)}&artist_name=${encodeURIComponent(artistName)}`
      );
      setData(await res.json());
    } catch (e) {
      setData({ found: false, message: "Request failed — try again" });
    }
    setLoading(false);
  };

  const loadBlindSpots = async () => {
    setLoadingBS(true);
    try {
      const res  = await fetch(`${API}/albums/blind-spots`);
      setBlindSpots(await res.json());
    } catch {}
    setLoadingBS(false);
  };

  const fitLabel = (score) => {
    if (score >= 0.7) return { text: "Strong match for your taste", color: "#1db954" };
    if (score >= 0.5) return { text: "Decent fit for your taste",   color: "#f59e0b" };
    return               { text: "Outside your usual taste",        color: "#6366f1" };
  };

  return (
    <div style={{ padding: "40px", maxWidth: "1000px", margin: "0 auto" }}>

      <h1 style={{ fontSize: "36px", fontWeight: 800, color: "#1db954", marginBottom: "8px" }}>
        Albums
      </h1>
      <p style={{ color: "#555", fontSize: "15px", marginBottom: "32px" }}>
        Explore any album and see if it matches your taste before committing.
      </p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "32px" }}>
        {[
          { id: "explorer",    label: "Album Explorer" },
          { id: "blindspots",  label: "Blind Spots" },
        ].map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); if (t.id === "blindspots" && !blindSpots) loadBlindSpots(); }}
            style={{
              padding: "8px 20px", borderRadius: "20px", border: "none",
              background: tab === t.id ? "#1db954" : "#1a1a1a",
              color: tab === t.id ? "#000" : "#666",
              fontWeight: 600, fontSize: "13px", cursor: "pointer"
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Album Explorer */}
      {tab === "explorer" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
            <div>
              <div className="label" style={{ marginBottom: "8px" }}>Album name</div>
              <input value={albumName} onChange={e => setAlbumName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && exploreAlbum()}
                placeholder="e.g. Swimming"
                style={{ width: "100%", padding: "12px 16px", borderRadius: "10px",
                  background: "#111", border: "1px solid #1a1a1a",
                  color: "#fff", fontSize: "14px", outline: "none" }} />
            </div>
            <div>
              <div className="label" style={{ marginBottom: "8px" }}>Artist</div>
              <input value={artistName} onChange={e => setArtistName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && exploreAlbum()}
                placeholder="e.g. Mac Miller"
                style={{ width: "100%", padding: "12px 16px", borderRadius: "10px",
                  background: "#111", border: "1px solid #1a1a1a",
                  color: "#fff", fontSize: "14px", outline: "none" }} />
            </div>
          </div>

          <button onClick={exploreAlbum} disabled={loading || !albumName || !artistName} style={{
            width: "100%", padding: "14px", borderRadius: "12px", border: "none",
            background: loading ? "#1a1a1a" : "#1db954",
            color: loading ? "#555" : "#000",
            fontWeight: 700, fontSize: "15px",
            cursor: loading ? "default" : "pointer", marginBottom: "32px"
          }}>
            {loading ? "Exploring..." : "Explore Album →"}
          </button>

          {data && !loading && !data.found && (
            <div className="card" style={{ textAlign: "center", padding: "40px", color: "#555" }}>
              {data.message}
            </div>
          )}

          {data?.found && !loading && (
            <>
              {/* Album header */}
              <div className="card" style={{ marginBottom: "24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
                  <div>
                    <h2 style={{ fontSize: "24px", fontWeight: 800 }}>{data.album.name}</h2>
                    <p style={{ color: "#555", marginTop: "4px" }}>{data.album.artist}</p>
                    {data.album.tags?.length > 0 && (
                      <div style={{ display: "flex", gap: "6px", marginTop: "10px", flexWrap: "wrap" }}>
                        {data.album.tags.map(tag => (
                          <span key={tag} style={{ fontSize: "11px", color: "#888",
                            background: "#1a1a1a", padding: "3px 10px", borderRadius: "12px" }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "28px", fontWeight: 800,
                      color: fitLabel(data.taste_comparison.overall_fit).color }}>
                      {Math.round(data.taste_comparison.overall_fit * 100)}%
                    </div>
                    <div style={{ fontSize: "12px", color: "#555", marginTop: "4px" }}>taste match</div>
                    <div style={{ fontSize: "12px",
                      color: fitLabel(data.taste_comparison.overall_fit).color, marginTop: "4px" }}>
                      {fitLabel(data.taste_comparison.overall_fit).text}
                    </div>
                  </div>
                </div>

                {/* Taste comparison bars */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr",
                  gap: "16px", marginTop: "20px" }}>
                  {[
                    { label: "Energy",  yours: data.taste_comparison.your_energy,
                      album: data.taste_comparison.album_energy },
                    { label: "Mood",    yours: data.taste_comparison.your_valence,
                      album: data.taste_comparison.album_valence },
                  ].map(row => (
                    <div key={row.label}>
                      <div style={{ display: "flex", justifyContent: "space-between",
                        fontSize: "11px", color: "#444", marginBottom: "4px" }}>
                        <span>{row.label}</span>
                        <span>
                          You {Math.round((row.yours || 0) * 100)}% ·
                          Album {Math.round((row.album || 0) * 100)}%
                        </span>
                      </div>
                      <div style={{ height: "4px", background: "#1a1a1a", borderRadius: "2px", position: "relative" }}>
                        <div style={{ position: "absolute", height: "4px", background: "#333",
                          borderRadius: "2px", width: `${(row.album || 0) * 100}%` }} />
                        <div style={{ position: "absolute", height: "4px", background: "#1db954",
                          borderRadius: "2px", width: "2px",
                          left: `${(row.yours || 0) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: "16px", marginTop: "16px",
                  fontSize: "12px", color: "#444" }}>
                  <span>{data.album.track_count} tracks</span>
                  <span>{data.album.you_own} already in your library</span>
                </div>
              </div>

              {/* Entry points */}
              {data.entry_points?.length > 0 && (
                <div className="card" style={{ marginBottom: "24px",
                  border: "1px solid #1a4a2a" }}>
                  <div className="label" style={{ marginBottom: "16px", color: "#1db954" }}>
                    START HERE — Best entry points for your taste
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {data.entry_points.map((t, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center",
                        gap: "12px", padding: "10px 12px", background: "#0d2b18",
                        borderRadius: "8px" }}>
                        <div style={{ width: "28px", height: "28px", borderRadius: "50%",
                          background: "#1db954", color: "#000", display: "flex",
                          alignItems: "center", justifyContent: "center",
                          fontSize: "12px", fontWeight: 800, flexShrink: 0 }}>
                          {i + 1}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: "14px" }}>{t.name}</div>
                          <div style={{ fontSize: "11px", color: "#2a6a3a", marginTop: "2px" }}>
                            {Math.round(t.taste_score * 100)}% match to your taste
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <FeaturePill label="BPM" value={t.tempo} isPercent={false} />
                          <FeaturePill label="Energy" value={t.energy} />
                        </div>
                        {t.spotify_url && (
                          <a href={t.spotify_url} target="_blank" rel="noreferrer"
                            style={{ fontSize: "11px", color: "#1db954",
                              textDecoration: "none", padding: "4px 10px",
                              border: "1px solid #1db95440", borderRadius: "6px" }}>
                            Open ↗
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Full track list */}
              <div className="card">
                <div className="label" style={{ marginBottom: "16px" }}>Full Track List</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {data.tracks.map((t, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: "12px",
                      padding: "10px 12px", borderRadius: "8px",
                      background: t.already_saved ? "#0a1f0a" : "transparent",
                      border: `1px solid ${t.already_saved ? "#1a3a1a" : "transparent"}`
                    }}>
                      <span style={{ color: "#333", fontSize: "12px",
                        width: "20px", textAlign: "right", flexShrink: 0 }}>
                        {i + 1}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "14px", fontWeight: t.recommended_entry ? 600 : 400,
                          display: "flex", alignItems: "center", gap: "6px" }}>
                          {t.name}
                          {t.already_saved && (
                            <span style={{ fontSize: "10px", color: "#1db954",
                              background: "#0d2b18", padding: "1px 5px", borderRadius: "3px" }}>
                              SAVED
                            </span>
                          )}
                          {t.recommended_entry && !t.already_saved && (
                            <span style={{ fontSize: "10px", color: "#f59e0b",
                              background: "#2a1f00", padding: "1px 5px", borderRadius: "3px" }}>
                              RECOMMENDED
                            </span>
                          )}
                        </div>
                      </div>
                      <ScoreBar score={t.taste_score} />
                      <div style={{ display: "flex", gap: "6px" }}>
                        <FeaturePill label="BPM" value={t.tempo} isPercent={false} />
                        <FeaturePill label="Energy" value={t.energy} />
                      </div>
                      {t.spotify_url && (
                        <a href={t.spotify_url} target="_blank" rel="noreferrer"
                          style={{ fontSize: "11px", color: "#555",
                            textDecoration: "none", flexShrink: 0 }}>
                          ↗
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Blind Spots */}
      {tab === "blindspots" && (
        <div>
          <p style={{ color: "#555", fontSize: "14px", marginBottom: "24px" }}>
            Genres you've touched in your library but never gone deep on.
            Based on Last.fm tags from your top 50 artists.
          </p>

          {loadingBS && <div className="loading">Analyzing your taste...</div>}

          {blindSpots && !loadingBS && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {blindSpots.blind_spots.map((spot, i) => (
                <div key={i} className="card" style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center"
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "16px",
                      textTransform: "capitalize", marginBottom: "4px" }}>
                      {spot.genre}
                    </div>
                    <div style={{ fontSize: "12px", color: "#555" }}>
                      You have it via: {spot.artists_you_have.join(", ")}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "20px", fontWeight: 800, color: "#1db954" }}>
                      {spot.songs_in_library}
                    </div>
                    <div style={{ fontSize: "11px", color: "#444" }}>songs</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}