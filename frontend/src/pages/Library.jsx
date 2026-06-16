import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function Library() {
  const [tab, setTab] = useState("duplicates");
  const [duplicates, setDuplicates] = useState(null);
  const [deadSaves, setDeadSaves] = useState(null);
  const [topArtists, setTopArtists] = useState(null);

  useEffect(() => {
    fetch(`${API}/library/duplicates`).then(r => r.json()).then(setDuplicates);
    fetch(`${API}/library/dead-saves`).then(r => r.json()).then(setDeadSaves);
    fetch(`${API}/library/top-saved-artists?limit=20`).then(r => r.json()).then(setTopArtists);
  }, []);

  const tabs = [
    { id: "duplicates", label: `Duplicates ${duplicates ? `(${duplicates.duplicates.length})` : ""}` },
    { id: "dead",       label: `Dead Saves ${deadSaves ? `(${deadSaves.dead_saves.length})` : ""}` },
    { id: "artists",    label: "Top Artists" },
  ];

  return (
    <div style={{ padding: "40px", maxWidth: "1100px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "36px", fontWeight: 800, color: "#1db954", marginBottom: "8px" }}>Library Manager</h1>
      <p style={{ color: "#555", fontSize: "15px", marginBottom: "32px" }}>Fix what Spotify won't.</p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "32px" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "8px 20px", borderRadius: "20px", border: "none",
            background: tab === t.id ? "#1db954" : "#1a1a1a",
            color: tab === t.id ? "#000" : "#666",
            fontWeight: 600, fontSize: "13px", cursor: "pointer"
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Duplicates */}
      {tab === "duplicates" && (
        <div>
          {!duplicates ? <div className="loading">Scanning...</div> :
           duplicates.duplicates.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "60px", color: "#555" }}>
              ✓ No duplicates found in your library.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {duplicates.duplicates.map((d, i) => (
                <div key={i} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{d.name}</div>
                    <div style={{ fontSize: "13px", color: "#555", marginTop: "2px" }}>{d.artist}</div>
                    <div style={{ fontSize: "11px", color: "#333", marginTop: "4px" }}>
                      Saved: {d.saved_dates?.map(d => d.slice(0, 10)).join(", ")}
                    </div>
                  </div>
                  <div style={{ background: "#ef4444", color: "#fff", borderRadius: "20px", padding: "4px 12px", fontSize: "12px", fontWeight: 700 }}>
                    {d.copies}x
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dead saves */}
      {tab === "dead" && (
        <div>
          {!deadSaves ? <div className="loading">Scanning...</div> : (
            <>
              <p style={{ color: "#555", fontSize: "13px", marginBottom: "20px" }}>
                Songs saved over a year ago that never appear in your listening history.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {deadSaves.dead_saves.map((s, i) => (
                  <div key={i} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: "13px", color: "#555" }}>{s.artist}</div>
                      <div style={{ fontSize: "11px", color: "#333", marginTop: "4px" }}>Saved {s.saved_at}</div>
                    </div>
                    <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "#444" }}>
                      {s.energy && <span>Energy {Math.round(s.energy * 100)}%</span>}
                      {s.valence && <span>Mood {Math.round(s.valence * 100)}%</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Top artists */}
      {tab === "artists" && (
        <div>
          {!topArtists ? <div className="loading">Loading...</div> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
              {topArtists.artists.map((a, i) => (
                <div key={i} className="card" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <span style={{ fontSize: "20px", fontWeight: 800, color: "#222", minWidth: "32px" }}>{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{a.artist}</div>
                    <div style={{ height: "3px", background: "#1a1a1a", borderRadius: "2px", marginTop: "8px" }}>
                      <div style={{
                        height: "3px", borderRadius: "2px", background: "#1db954",
                        width: `${(a.songs / (topArtists.artists[0]?.songs || 1)) * 100}%`
                      }} />
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "18px", fontWeight: 700, color: "#1db954" }}>{a.songs}</div>
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