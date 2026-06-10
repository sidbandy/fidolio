import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip,
         ResponsiveContainer, Legend, ReferenceLine } from "recharts";

const API = "http://127.0.0.1:8000";

const FEATURES = [
  { key: "valence",      label: "Mood",        color: "#1db954" },
  { key: "energy",       label: "Energy",      color: "#f59e0b" },
  { key: "acousticness", label: "Acoustic",    color: "#6366f1" },
  { key: "danceability", label: "Danceability",color: "#ec4899" },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#111", border: "1px solid #1a1a1a",
      borderRadius: "10px", padding: "12px 16px", fontSize: "12px" }}>
      <div style={{ color: "#888", marginBottom: "8px", fontWeight: 600 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: "4px" }}>
          {p.name}: {Math.round(p.value * 100)}%
        </div>
      ))}
    </div>
  );
};

export default function Timeline() {
  const [data,    setData]    = useState(null);
  const [active,  setActive]  = useState(["valence","energy"]);

  useEffect(() => {
    fetch(`${API}/stats/taste-timeline`)
      .then(r => r.json())
      .then(setData);
  }, []);

  const toggle = (key) => {
    setActive(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  if (!data) return <div className="loading">Analyzing your taste timeline...</div>;

  const timeline = data.timeline;

  if (timeline.length < 2) {
    return (
      <div style={{ padding: "40px", maxWidth: "900px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "36px", fontWeight: 800, color: "#1db954", marginBottom: "8px" }}>
          Taste Timeline
        </h1>
        <div className="card" style={{ textAlign: "center", padding: "60px", color: "#555" }}>
          <div style={{ fontSize: "32px", marginBottom: "16px" }}>📈</div>
          <div style={{ fontSize: "16px", marginBottom: "8px" }}>Not enough data yet.</div>
          <div style={{ fontSize: "13px", color: "#444" }}>
            Keep the poller running — this page gets more interesting every week.
            You need at least 2 months of listening history.
          </div>
        </div>
      </div>
    );
  }

  // Find biggest mood shift between consecutive months
  let biggestShift = null;
  for (let i = 1; i < timeline.length; i++) {
    const prev = timeline[i-1];
    const curr = timeline[i];
    if (!prev.valence || !curr.valence) continue;
    const shift = Math.abs(curr.valence - prev.valence);
    if (!biggestShift || shift > biggestShift.shift) {
      biggestShift = {
        month: curr.month,
        shift: shift,
        direction: curr.valence > prev.valence ? "brighter" : "darker",
        from: Math.round(prev.valence * 100),
        to: Math.round(curr.valence * 100),
      };
    }
  }

  const first = timeline[0];
  const last  = timeline[timeline.length - 1];
  const moodDrift = last.valence && first.valence
    ? Math.round((last.valence - first.valence) * 100)
    : null;
  const energyDrift = last.energy && first.energy
    ? Math.round((last.energy - first.energy) * 100)
    : null;

  return (
    <div style={{ padding: "40px", maxWidth: "1000px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "36px", fontWeight: 800, color: "#1db954", marginBottom: "8px" }}>
        Taste Timeline
      </h1>
      <p style={{ color: "#555", fontSize: "15px", marginBottom: "36px" }}>
        How your music has actually changed over {timeline.length} months of listening.
      </p>

      {/* Insight cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
        gap: "16px", marginBottom: "32px" }}>

        {moodDrift !== null && (
          <div className="card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: "28px", fontWeight: 800,
              color: moodDrift > 0 ? "#1db954" : "#6366f1" }}>
              {moodDrift > 0 ? "+" : ""}{moodDrift}%
            </div>
            <div className="label" style={{ marginTop: "6px" }}>Mood drift overall</div>
            <div style={{ fontSize: "12px", color: "#555", marginTop: "4px" }}>
              Your music got {moodDrift > 0 ? "happier" : "darker"} over time
            </div>
          </div>
        )}

        {energyDrift !== null && (
          <div className="card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: "28px", fontWeight: 800,
              color: energyDrift > 0 ? "#f59e0b" : "#6366f1" }}>
              {energyDrift > 0 ? "+" : ""}{energyDrift}%
            </div>
            <div className="label" style={{ marginTop: "6px" }}>Energy drift overall</div>
            <div style={{ fontSize: "12px", color: "#555", marginTop: "4px" }}>
              Your music got {energyDrift > 0 ? "more intense" : "more mellow"} over time
            </div>
          </div>
        )}

        {biggestShift && (
          <div className="card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#fff" }}>
              {biggestShift.month}
            </div>
            <div className="label" style={{ marginTop: "6px" }}>Biggest mood shift</div>
            <div style={{ fontSize: "12px", color: "#555", marginTop: "4px" }}>
              Mood went {biggestShift.direction} — {biggestShift.from}% → {biggestShift.to}%
            </div>
          </div>
        )}
      </div>

      {/* Feature toggles */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        {FEATURES.map(f => (
          <button key={f.key} onClick={() => toggle(f.key)} style={{
            padding: "6px 16px", borderRadius: "16px", border: "none",
            background: active.includes(f.key) ? f.color : "#1a1a1a",
            color: active.includes(f.key) ? "#000" : "#666",
            fontWeight: 600, fontSize: "13px", cursor: "pointer",
            transition: "all 0.15s"
          }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Main chart */}
      <div className="card" style={{ marginBottom: "32px" }}>
        <div className="label" style={{ marginBottom: "20px" }}>
          Audio features over time — monthly averages from your listening history
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={timeline} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <XAxis dataKey="month" tick={{ fill: "#444", fontSize: 11 }}
              tickFormatter={m => m.slice(2)} />
            <YAxis domain={[0, 1]} tick={{ fill: "#444", fontSize: 11 }}
              tickFormatter={v => `${Math.round(v * 100)}%`} />
            <Tooltip content={<CustomTooltip />} />
            {FEATURES.filter(f => active.includes(f.key)).map(f => (
              <Line key={f.key} type="monotone" dataKey={f.key}
                stroke={f.color} strokeWidth={2} dot={false}
                name={f.label} connectNulls />
            ))}
            {biggestShift && (
              <ReferenceLine x={biggestShift.month}
                stroke="#ffffff22" strokeDasharray="4 4"
                label={{ value: "↑ shift", fill: "#444", fontSize: 10 }} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly breakdown table */}
      <div className="card">
        <div className="label" style={{ marginBottom: "16px" }}>Monthly breakdown</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1a1a1a" }}>
                {["Month","Plays","Mood","Energy","Acoustic","Dance","BPM"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 12px",
                    color: "#444", fontWeight: 600, fontSize: "11px",
                    textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...timeline].reverse().map((row, i) => (
                <tr key={row.month} style={{
                  borderBottom: "1px solid #111",
                  background: i % 2 === 0 ? "transparent" : "#0a0a0a"
                }}>
                  <td style={{ padding: "8px 12px", fontWeight: 600 }}>{row.month}</td>
                  <td style={{ padding: "8px 12px", color: "#555" }}>{row.plays}</td>
                  <td style={{ padding: "8px 12px",
                    color: row.valence < 0.3 ? "#6366f1" : row.valence > 0.6 ? "#1db954" : "#f59e0b" }}>
                    {row.valence ? `${Math.round(row.valence * 100)}%` : "—"}
                  </td>
                  <td style={{ padding: "8px 12px", color: "#f59e0b" }}>
                    {row.energy ? `${Math.round(row.energy * 100)}%` : "—"}
                  </td>
                  <td style={{ padding: "8px 12px", color: "#6366f1" }}>
                    {row.acousticness ? `${Math.round(row.acousticness * 100)}%` : "—"}
                  </td>
                  <td style={{ padding: "8px 12px", color: "#ec4899" }}>
                    {row.danceability ? `${Math.round(row.danceability * 100)}%` : "—"}
                  </td>
                  <td style={{ padding: "8px 12px", color: "#888" }}>
                    {row.tempo ? Math.round(row.tempo) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}