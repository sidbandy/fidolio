import { useEffect, useState, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea
} from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const C = {
  bg: "#080808", card: "#0e0e0e", card2: "#111111", border: "#1a1a1a",
  green: "#1db954", greenBg: "#0d2b18", indigo: "#6366f1", amber: "#f59e0b",
  pink: "#ec4899", red: "#ef4444", text: "#ffffff", sub: "#888888",
  muted: "#555555", label: "#444444",
};

const FEATURES = [
  { key: "valence",      label: "Mood",        color: C.green },
  { key: "energy",       label: "Energy",       color: C.amber },
  { key: "acousticness", label: "Acoustic",     color: C.indigo },
  { key: "danceability", label: "Danceability", color: C.pink },
];

const ERA_COLORS = [
  "#1db954", "#6366f1", "#f59e0b", "#ec4899",
  "#3b82f6", "#10b981", "#f43434", "#a78bfa",
];

function moodColor(label) {
  if (!label) return C.muted;
  if (label === "Dark" || label === "Melancholic") return C.indigo;
  if (label === "Bright" || label === "Upbeat") return C.green;
  return C.amber;
}

function ChartTooltip({ active, payload, label, labeled_months }) {
  if (!active || !payload?.length) return null;
  const md = labeled_months?.find(m => m.month === label);
  return (
    <div style={{ background: "#111", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "12px 16px", fontSize: "12px", minWidth: "160px" }}>
      <div style={{ color: C.sub, marginBottom: "8px", fontWeight: 600 }}>
        {label}
        {md?.era_name && <span style={{ marginLeft: "8px", color: C.muted, fontSize: "11px", fontStyle: "italic" }}>{md.era_name}</span>}
      </div>
      {payload.map(p => {
        const feat = FEATURES.find(f => f.key === p.dataKey);
        const pct = Math.round(p.value * 100);
        let word = "";
        if (p.dataKey === "valence") word = md?.mood_label ? ` · ${md.mood_label}` : "";
        if (p.dataKey === "energy") word = md?.energy_label ? ` · ${md.energy_label}` : "";
        if (p.dataKey === "acousticness") word = md?.acoustic_label ? ` · ${md.acoustic_label}` : "";
        return (
          <div key={p.dataKey} style={{ color: p.stroke, marginBottom: "4px", display: "flex", justifyContent: "space-between", gap: "16px" }}>
            <span>{feat?.label}</span>
            <span style={{ fontWeight: 700 }}>{pct}%{word}</span>
          </div>
        );
      })}
      {md?.plays && (
        <div style={{ color: C.label, marginTop: "8px", fontSize: "11px", borderTop: `1px solid ${C.border}`, paddingTop: "8px" }}>
          {md.plays} plays this month
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value, sub, color }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ fontSize: "11px", fontWeight: 600, color: C.label, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
      <div style={{ fontSize: "22px", fontWeight: 800, color: color || C.text }}>{value}</div>
      {sub && <div style={{ fontSize: "12px", color: C.muted, marginTop: "2px" }}>{sub}</div>}
    </div>
  );
}

function EraBadge({ era, index, selected, onClick }) {
  const isSel = selected === era.name;
  const color = ERA_COLORS[index % ERA_COLORS.length];
  return (
    <button onClick={() => onClick(isSel ? null : era.name)} style={{
      padding: "6px 14px", borderRadius: "20px", border: "none", cursor: "pointer",
      fontSize: "12px", fontWeight: 600, transition: "all 0.15s",
      background: isSel ? color : C.card2,
      color: isSel ? "#000" : C.muted,
      outline: isSel ? `1px solid ${color}` : "none",
    }}>
      {era.name}
      <span style={{ marginLeft: "6px", opacity: 0.6, fontWeight: 400 }}>
        {era.months.length === 1 ? era.start : `${era.start} – ${era.end}`}
      </span>
    </button>
  );
}

export default function Timeline() {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [active, setActive]     = useState(["valence", "energy"]);
  const [selEra, setSelEra]     = useState(null);

  useEffect(() => {
    fetch(`${API}/stats/taste-timeline-insights`)
      .then(r => r.json())
      .then(ins => { setInsights(ins); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const toggleFeature = useCallback((key) => {
    setActive(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "40px", maxWidth: "1000px", margin: "0 auto" }}>
        <div style={{ color: C.muted, fontSize: "14px" }}>Analyzing your taste timeline...</div>
      </div>
    );
  }

  if (!insights?.enough_data) {
    const have = insights?.months_have ?? 0;
    const needed = insights?.months_needed ?? 2;
    return (
      <div style={{ padding: "40px 24px 100px", maxWidth: "1000px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "32px", fontWeight: 800, color: C.text, marginBottom: "6px" }}>Taste Timeline</h1>
        <p style={{ color: C.muted, fontSize: "14px", marginBottom: "40px" }}>How your music has changed over time.</p>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "48px 32px", textAlign: "center" }}>
          <div style={{ fontSize: "36px", marginBottom: "16px" }}>📈</div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: C.text, marginBottom: "8px" }}>
            {have === 0 ? "No listening history yet" : `${have} of ${needed} months collected`}
          </div>
          <div style={{ fontSize: "13px", color: C.muted, maxWidth: "360px", margin: "0 auto" }}>
            {have === 0
              ? "Make sure the poller is running. It collects your listening history every 30 minutes."
              : `You need at least ${needed} months of data. Keep the poller running and check back soon.`}
          </div>
          <div style={{ marginTop: "24px", display: "inline-block", background: C.card2, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px 20px", fontFamily: "monospace", fontSize: "13px", color: C.sub }}>
            python scripts/poller.py
          </div>
        </div>
      </div>
    );
  }

  const selectedEraObj = selEra ? insights.eras.find(e => e.name === selEra) : null;
  const moodDriftColor  = (insights.mood_drift ?? 0) > 0 ? C.green : C.indigo;
  const energyDriftColor = (insights.energy_drift ?? 0) > 0 ? C.amber : C.indigo;

  return (
    <div style={{ padding: "40px 24px 100px", maxWidth: "1040px", margin: "0 auto" }}>

      <h1 style={{ fontSize: "32px", fontWeight: 800, color: C.text, margin: "0 0 12px 0" }}>Taste Timeline</h1>

      {/* Narrative card */}
      <div style={{ marginBottom: "32px", background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "16px 20px", borderLeft: `3px solid ${C.green}` }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: C.sub, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
          Your Story · {insights.total_months} months
        </div>
        <div style={{ fontSize: "14px", color: C.text, lineHeight: "1.6" }}>{insights.narrative}</div>
        {insights.current_chapter && (
          <div style={{ marginTop: "10px", fontSize: "12px", color: C.muted }}>
            Current chapter: <span style={{ color: C.green, fontWeight: 600 }}>{insights.current_chapter}</span>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "28px" }}>
        {insights.mood_drift !== null && (
          <StatPill label="Mood drift" value={`${insights.mood_drift > 0 ? "+" : ""}${insights.mood_drift}%`}
            sub={insights.mood_drift > 0 ? "Getting brighter" : "Getting darker"} color={moodDriftColor} />
        )}
        {insights.energy_drift !== null && (
          <StatPill label="Energy drift" value={`${insights.energy_drift > 0 ? "+" : ""}${insights.energy_drift}%`}
            sub={insights.energy_drift > 0 ? "More intense over time" : "More mellow over time"} color={energyDriftColor} />
        )}
        {insights.biggest_mood_shift && (
          <StatPill label="Biggest mood shift" value={insights.biggest_mood_shift.month}
            sub={`${insights.biggest_mood_shift.from_label} → ${insights.biggest_mood_shift.to_label}`} color={C.text} />
        )}
        {insights.biggest_energy_shift && (
          <StatPill label="Biggest energy shift" value={insights.biggest_energy_shift.month}
            sub={`${insights.biggest_energy_shift.from_label} → ${insights.biggest_energy_shift.to_label}`} color={C.text} />
        )}
      </div>

      {/* Era chips */}
      {insights.eras.length > 1 && (
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "11px", fontWeight: 600, color: C.label, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>
            Your listening eras — click to highlight
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {insights.eras.map((era, i) => (
              <EraBadge key={era.name + era.start} era={era} index={i} selected={selEra} onClick={setSelEra} />
            ))}
          </div>
        </div>
      )}

      {/* Feature toggles */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        {FEATURES.map(f => (
          <button key={f.key} onClick={() => toggleFeature(f.key)} style={{
            padding: "6px 16px", borderRadius: "16px", border: "none",
            background: active.includes(f.key) ? f.color : C.card2,
            color: active.includes(f.key) ? "#000" : C.muted,
            fontWeight: 600, fontSize: "13px", cursor: "pointer", transition: "all 0.15s"
          }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "24px 16px 16px", marginBottom: "28px" }}>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={insights.labeled_months} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <XAxis dataKey="month" tick={{ fill: C.label, fontSize: 11 }} tickFormatter={m => m.slice(2)} axisLine={{ stroke: C.border }} tickLine={false} />
            <YAxis domain={[0, 1]} tick={{ fill: C.label, fontSize: 11 }} tickFormatter={v => `${Math.round(v * 100)}%`} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip labeled_months={insights.labeled_months} />} />
            {selectedEraObj && selectedEraObj.months.length >= 1 && (
              <ReferenceArea x1={selectedEraObj.months[0]} x2={selectedEraObj.months[selectedEraObj.months.length - 1]} strokeOpacity={0} fill="#ffffff" fillOpacity={0.04} />
            )}
            {insights.biggest_mood_shift && (
              <ReferenceLine x={insights.biggest_mood_shift.month} stroke="#ffffff18" strokeDasharray="4 4" />
            )}
            {FEATURES.filter(f => active.includes(f.key)).map(f => (
              <Line key={f.key} type="monotone" dataKey={f.key} stroke={f.color} strokeWidth={2}
                dot={{ r: 3, fill: f.color, strokeWidth: 0 }} activeDot={{ r: 5, fill: f.color, strokeWidth: 0 }}
                name={f.label} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly table */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, fontSize: "11px", fontWeight: 600, color: C.label, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Monthly breakdown
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Month","Vibe","Mood","Energy","Acoustic","Dance","BPM","Plays"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: C.label, fontWeight: 600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...insights.labeled_months].reverse().map((row, i) => {
                const isHl = selectedEraObj?.months.includes(row.month);
                return (
                  <tr key={row.month} style={{ borderBottom: `1px solid ${C.border}`, background: isHl ? "#ffffff06" : i % 2 === 0 ? "transparent" : "#0a0a0a", transition: "background 0.15s" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: C.text, whiteSpace: "nowrap" }}>{row.month}</td>
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                      <span style={{ fontSize: "11px", fontWeight: 600, color: "#000", background: moodColor(row.mood_label), borderRadius: "10px", padding: "2px 8px" }}>
                        {row.era_name || "—"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", color: moodColor(row.mood_label), fontWeight: 600 }}>
                      {row.mood_label || "—"}
                      {row.mood_pct != null && <span style={{ color: C.muted, fontWeight: 400, marginLeft: "4px" }}>{row.mood_pct}%</span>}
                    </td>
                    <td style={{ padding: "10px 14px", color: C.amber, fontWeight: 600 }}>
                      {row.energy_label || "—"}
                      {row.energy_pct != null && <span style={{ color: C.muted, fontWeight: 400, marginLeft: "4px" }}>{row.energy_pct}%</span>}
                    </td>
                    <td style={{ padding: "10px 14px", color: C.indigo }}>{row.acoustic_label || "—"}</td>
                    <td style={{ padding: "10px 14px", color: C.pink }}>{row.danceability != null ? `${Math.round(row.danceability * 100)}%` : "—"}</td>
                    <td style={{ padding: "10px 14px", color: C.sub }}>{row.tempo != null ? Math.round(row.tempo) : "—"}</td>
                    <td style={{ padding: "10px 14px", color: C.muted }}>{row.plays}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
