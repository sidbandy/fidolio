import { useEffect, useState } from "react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

const API = "http://127.0.0.1:8000";

export default function SonicIdentity() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`${API}/stats/sonic-identity`)
      .then(r => r.json())
      .then(setData);
  }, []);

  if (!data) return (
    <div className="loading">Analyzing your sound...</div>
  );

  const { averages, mood_distribution, energy_distribution, dominant_key, rabbit_holes } = data;

  const radarData = [
    { feature: "Energy",      value: Math.round(averages.energy * 100) },
    { feature: "Dance",       value: Math.round(averages.danceability * 100) },
    { feature: "Mood",        value: Math.round(averages.valence * 100) },
    { feature: "Acoustic",    value: Math.round(averages.acousticness * 100) },
    { feature: "Vocal",       value: Math.round((1 - averages.instrumentalness) * 100) },
    { feature: "Speech",      value: Math.round(averages.speechiness * 100) },
  ];

  const moodData = [
    { name: "Dark",    value: mood_distribution.dark,    color: "#6366f1" },
    { name: "Neutral", value: mood_distribution.neutral, color: "#8b5cf6" },
    { name: "Happy",   value: mood_distribution.happy,   color: "#1db954" },
  ];

  const energyData = [
    { name: "Calm",    value: energy_distribution.calm,    color: "#3b82f6" },
    { name: "Medium",  value: energy_distribution.medium,  color: "#f59e0b" },
    { name: "Intense", value: energy_distribution.intense, color: "#ef4444" },
  ];

  const total = mood_distribution.dark + mood_distribution.neutral + mood_distribution.happy;

  return (
    <div style={{ padding: "40px", maxWidth: "1100px", margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: "48px" }}>
        <h1 style={{ fontSize: "36px", fontWeight: 800, color: "#1db954", marginBottom: "8px" }}>
          Your Sonic Identity
        </h1>
        <p style={{ color: "#888", fontSize: "16px" }}>
          Built from {averages.total_analyzed.toLocaleString()} songs in your library.
          Average tempo: <span style={{ color: "#fff" }}>{averages.tempo} BPM</span>.
          Dominant key: <span style={{ color: "#1db954" }}>{dominant_key}</span>.
        </p>
      </div>

      {/* Top row — radar + mood + energy */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "24px", marginBottom: "32px" }}>

        {/* Radar chart */}
        <div style={{ background: "#111", borderRadius: "16px", padding: "24px" }}>
          <h2 style={{ fontSize: "14px", color: "#888", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "16px" }}>
            Audio Profile
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#222" />
              <PolarAngleAxis dataKey="feature" tick={{ fill: "#888", fontSize: 12 }} />
              <Radar dataKey="value" stroke="#1db954" fill="#1db954" fillOpacity={0.2} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Mood distribution */}
        <div style={{ background: "#111", borderRadius: "16px", padding: "24px" }}>
          <h2 style={{ fontSize: "14px", color: "#888", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "16px" }}>
            Mood Distribution
          </h2>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={moodData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                {moodData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(v) => `${Math.round(v / total * 100)}%`} contentStyle={{ background: "#1a1a1a", border: "none", borderRadius: "8px" }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", justifyContent: "center", gap: "16px", marginTop: "8px" }}>
            {moodData.map(d => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: d.color }} />
                <span style={{ fontSize: "12px", color: "#888" }}>{d.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Energy distribution */}
        <div style={{ background: "#111", borderRadius: "16px", padding: "24px" }}>
          <h2 style={{ fontSize: "14px", color: "#888", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "16px" }}>
            Energy Split
          </h2>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={energyData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                {energyData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(v) => `${Math.round(v / total * 100)}%`} contentStyle={{ background: "#1a1a1a", border: "none", borderRadius: "8px" }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", justifyContent: "center", gap: "16px", marginTop: "8px" }}>
            {energyData.map(d => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: d.color }} />
                <span style={{ fontSize: "12px", color: "#888" }}>{d.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stat pills */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }}>
        {[
          { label: "Avg BPM", value: averages.tempo },
          { label: "Energy", value: `${Math.round(averages.energy * 100)}%` },
          { label: "Danceability", value: `${Math.round(averages.danceability * 100)}%` },
          { label: "Acoustic", value: `${Math.round(averages.acousticness * 100)}%` },
        ].map(stat => (
          <div key={stat.label} style={{ background: "#111", borderRadius: "12px", padding: "20px", textAlign: "center" }}>
            <div style={{ fontSize: "28px", fontWeight: 800, color: "#1db954" }}>{stat.value}</div>
            <div style={{ fontSize: "12px", color: "#666", marginTop: "4px", textTransform: "uppercase", letterSpacing: "1px" }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Rabbit holes */}
      <div style={{ background: "#111", borderRadius: "16px", padding: "24px" }}>
        <h2 style={{ fontSize: "14px", color: "#888", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "20px" }}>
          Rabbit Holes — Artists You Binged
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {rabbit_holes.map(rh => (
            <div key={rh.artist} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#181818", borderRadius: "10px" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{rh.artist}</div>
                <div style={{ fontSize: "12px", color: "#666", marginTop: "2px" }}>
                  {rh.first_save === rh.last_save
                    ? `Saved ${rh.songs_saved} songs in one sitting on ${rh.first_save}`
                    : `${rh.songs_saved} songs saved between ${rh.first_save} and ${rh.last_save}`}
                </div>
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800, color: "#1db954" }}>{rh.songs_saved}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}