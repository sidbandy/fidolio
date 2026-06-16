import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const PERIODS = ["day", "week", "month", "year"];

export default function Wrapped() {
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState(null);
  const [allTime, setAllTime] = useState(null);

  useEffect(() => {
    fetch(`${API}/stats/wrapped?period=${period}`)
      .then(r => r.json())
      .then(setData);
  }, [period]);

  useEffect(() => {
    fetch(`${API}/stats/all-time`)
      .then(r => r.json())
      .then(setAllTime);
  }, []);

  const hours = Math.floor((data?.total_minutes || 0) / 60);
  const mins = Math.round((data?.total_minutes || 0) % 60);

  return (
    <div style={{ padding: "40px", maxWidth: "1100px", margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "40px" }}>
        <div>
          <h1 style={{ fontSize: "36px", fontWeight: 800, color: "#1db954" }}>Live Wrapped</h1>
          <p style={{ color: "#555", marginTop: "6px", fontSize: "15px" }}>Your stats, any time you want them.</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: "8px 18px", borderRadius: "20px", border: "none",
              background: period === p ? "#1db954" : "#1a1a1a",
              color: period === p ? "#000" : "#666",
              fontWeight: 600, fontSize: "13px", cursor: "pointer",
              textTransform: "capitalize", transition: "all 0.15s"
            }}>
              {p === "day" ? "Today" : p === "week" ? "Week" : p === "month" ? "Month" : "Year"}
            </button>
          ))}
        </div>
      </div>

      {/* All-time stat bar */}
      {allTime && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }}>
          {[
            { label: "Total Plays Ever",    value: allTime.total_plays?.toLocaleString() },
            { label: "Total Hours Ever",    value: `${allTime.estimated_hours}h` },
            { label: "Tracking Since",      value: allTime.tracking_since },
            { label: "Top Artist All Time", value: allTime.top_artists_all_time?.[0]?.artist },
          ].map(s => (
            <div key={s.label} className="card" style={{ textAlign: "center" }}>
              <div style={{ fontSize: "26px", fontWeight: 800, color: "#1db954", marginBottom: "6px" }}>{s.value || "—"}</div>
              <div className="label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {!data ? <div className="loading">Loading...</div> : (
        <>
          {/* Period stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "32px" }}>
            <div className="card" style={{ textAlign: "center" }}>
              <div style={{ fontSize: "36px", fontWeight: 800, color: "#1db954" }}>{hours}h {mins}m</div>
              <div className="label" style={{ marginTop: "6px" }}>Listening Time</div>
            </div>
            <div className="card" style={{ textAlign: "center" }}>
              <div style={{ fontSize: "36px", fontWeight: 800, color: "#1db954" }}>
                {data.top_artists?.[0]?.artist || "—"}
              </div>
              <div className="label" style={{ marginTop: "6px" }}>Top Artist</div>
            </div>
            <div className="card" style={{ textAlign: "center" }}>
              <div style={{ fontSize: "36px", fontWeight: 800, color: "#1db954" }}>
                {data.top_songs?.[0]?.track || "—"}
              </div>
              <div className="label" style={{ marginTop: "6px" }}>Top Song</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "32px" }}>

            {/* Top artists */}
            <div className="card">
              <div className="label" style={{ marginBottom: "20px" }}>Top Artists</div>
              {data.top_artists?.length === 0 ? (
                <p style={{ color: "#444", fontSize: "14px" }}>No listening history yet — keep the poller running!</p>
              ) : (
                data.top_artists?.map((a, i) => (
                  <div key={a.artist} style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                    <span style={{ color: "#333", fontSize: "13px", width: "20px", textAlign: "right" }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "14px", fontWeight: 500 }}>{a.artist}</div>
                      <div style={{ height: "3px", background: "#1a1a1a", borderRadius: "2px", marginTop: "6px" }}>
                        <div style={{
                          height: "3px", borderRadius: "2px", background: "#1db954",
                          width: `${(a.plays / (data.top_artists[0]?.plays || 1)) * 100}%`,
                          transition: "width 0.5s"
                        }} />
                      </div>
                    </div>
                    <span style={{ color: "#555", fontSize: "12px", minWidth: "50px", textAlign: "right" }}>
                      {a.plays} plays
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Top songs */}
            <div className="card">
              <div className="label" style={{ marginBottom: "20px" }}>Top Songs</div>
              {data.top_songs?.length === 0 ? (
                <p style={{ color: "#444", fontSize: "14px" }}>No listening history yet — keep the poller running!</p>
              ) : (
                data.top_songs?.map((s, i) => (
                  <div key={s.track} style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                    <span style={{ color: "#333", fontSize: "13px", width: "20px", textAlign: "right" }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "14px", fontWeight: 500 }}>{s.track}</div>
                      <div style={{ fontSize: "12px", color: "#555" }}>{s.artist}</div>
                    </div>
                    <span style={{ color: "#555", fontSize: "12px" }}>{s.plays}x</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Listening clock */}
          <div className="card">
            <div className="label" style={{ marginBottom: "20px" }}>Listening Clock — When You Actually Listen</div>
            {data.listening_clock?.every(h => h.plays === 0) ? (
              <p style={{ color: "#444", fontSize: "14px" }}>More data needed — keep the poller running.</p>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={data.listening_clock} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="hour" tick={{ fill: "#444", fontSize: 11 }}
                    tickFormatter={h => h % 6 === 0 ? `${h}:00` : ""} />
                  <YAxis tick={{ fill: "#444", fontSize: 11 }} />
                  <Tooltip
                    formatter={(v) => [`${v} plays`, "Plays"]}
                    labelFormatter={h => `${h}:00`}
                    contentStyle={{ background: "#1a1a1a", border: "none", borderRadius: "8px", fontSize: "12px" }}
                  />
                  <Bar dataKey="plays" radius={[3, 3, 0, 0]}>
                    {data.listening_clock?.map((entry, i) => (
                      <Cell key={i} fill={entry.plays > 0 ? "#1db954" : "#1a1a1a"} opacity={0.4 + (entry.plays / (Math.max(...data.listening_clock.map(h => h.plays)) || 1)) * 0.6} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </div>
  );
}