import { useState, useCallback, useEffect } from "react";
import usePreview from "../hooks/usePreview";

const API = "http://localhost:8000";

// ─── Design tokens ───────────────────────────────────────────────────────────
const C = {
  bg:      "#080808",
  card:    "#0e0e0e",
  card2:   "#111111",
  border:  "#1a1a1a",
  border2: "#222222",
  green:   "#1db954",
  greenBg: "#0d2b18",
  greenBd: "#1a4a2a",
  amber:   "#f59e0b",
  indigo:  "#6366f1",
  red:     "#ef4444",
  muted:   "#555555",
  sub:     "#888888",
  label:   "#444444",
};

const pill = (active, extra = {}) => ({
  padding: "5px 13px", borderRadius: "20px", fontSize: "12px",
  fontWeight: 600, cursor: "pointer", border: "1px solid",
  transition: "all 0.15s", userSelect: "none",
  background: active ? C.green   : "#151515",
  color:      active ? "#000"    : C.muted,
  borderColor: active ? C.green  : C.border,
  ...extra,
});

const card = (extra = {}) => ({
  background: C.card, border: `1px solid ${C.border}`,
  borderRadius: "12px", padding: "18px 20px", ...extra,
});

const btn = (variant = "primary", extra = {}) => {
  const base = { padding: "9px 18px", borderRadius: "9px", fontSize: "13px",
    fontWeight: 700, cursor: "pointer", border: "none", transition: "all 0.15s" };
  if (variant === "primary")
    return { ...base, background: C.green, color: "#000", ...extra };
  if (variant === "ghost")
    return { ...base, background: "#151515", color: C.sub,
             border: `1px solid ${C.border}`, ...extra };
  if (variant === "danger")
    return { ...base, background: "#1a0808", color: C.red,
             border: `1px solid #3a1a1a`, ...extra };
  return { ...base, ...extra };
};

const input = (extra = {}) => ({
  background: "#111", border: `1px solid ${C.border}`,
  borderRadius: "8px", padding: "8px 12px", color: "#fff",
  fontSize: "13px", outline: "none", ...extra,
});

// ─── Condition field definitions ─────────────────────────────────────────────
const FIELDS = [
  { value: "language",     label: "Language",       type: "enum",
    values: ["bengali","hindi","arabic","punjabi","english","spanish","french",
             "portuguese","tamil","telugu","urdu","korean","japanese","russian"] },
  { value: "mood",         label: "Mood",           type: "enum",
    values: ["happy","neutral","dark"] },
  { value: "decade",       label: "Decade",         type: "enum",
    values: ["2020s","2010s","2000s","90s","80s","70s","60s","older"] },
  { value: "energy",       label: "Energy",         type: "range01",   step: 0.05 },
  { value: "valence",      label: "Valence",        type: "range01",   step: 0.05 },
  { value: "tempo",        label: "Tempo (BPM)",    type: "rangeInt",  min: 40,  max: 220, step: 5 },
  { value: "danceability", label: "Danceability",   type: "range01",   step: 0.05 },
  { value: "acousticness", label: "Acousticness",   type: "range01",   step: 0.05 },
  { value: "speechiness",  label: "Speechiness",    type: "range01",   step: 0.05 },
  { value: "release_year", label: "Release Year",   type: "rangeInt",  min: 1950, max: 2026, step: 1 },
  { value: "artist",       label: "Artist",         type: "text" },
  { value: "saved_days",   label: "Saved within",   type: "days" },
];

const OPS_FOR = {
  enum:     [{ value: "eq",      label: "is" }],
  range01:  [{ value: "gte",     label: "≥" }, { value: "lte", label: "≤" },
             { value: "between", label: "between" }],
  rangeInt: [{ value: "gte",     label: "≥" }, { value: "lte", label: "≤" },
             { value: "between", label: "between" }],
  text:     [{ value: "contains", label: "contains" }, { value: "eq", label: "is exactly" }],
  days:     [{ value: "lte",     label: "last N days" }],
};

const defaultValueFor = (field) => {
  if (field.type === "enum")     return field.values[0];
  if (field.type === "range01")  return 0.5;
  if (field.type === "rangeInt") return field.value === "release_year" ? 2010 : 120;
  if (field.type === "days")     return 30;
  return "";
};

const defaultBetweenFor = (field) => {
  if (field.type === "range01")  return [0.4, 0.8];
  if (field.type === "rangeInt") return field.value === "release_year" ? [2010, 2020] : [100, 150];
  return [0, 1];
};

// ─── Quick presets ────────────────────────────────────────────────────────────
const PRESETS = [
  { label: "All Bengali",      emoji: "🇧🇩",
    conditions: [{ field: "language", op: "eq", value: "bengali" }] },
  { label: "All Hindi",        emoji: "🇮🇳",
    conditions: [{ field: "language", op: "eq", value: "hindi" }] },
  { label: "Bangers",          emoji: "🔥",
    conditions: [{ field: "energy", op: "gte", value: 0.82 },
                 { field: "tempo",  op: "gte", value: 130 }] },
  { label: "Sad Hours",        emoji: "🌧",
    conditions: [{ field: "mood",   op: "eq",  value: "dark" },
                 { field: "energy", op: "lte", value: 0.50 }] },
  { label: "Good Vibes",       emoji: "☀️",
    conditions: [{ field: "mood",   op: "eq",  value: "happy" }] },
  { label: "Acoustic",         emoji: "🎸",
    conditions: [{ field: "acousticness", op: "gte", value: 0.75 }] },
  { label: "Dance Floor",      emoji: "🕺",
    conditions: [{ field: "danceability", op: "gte", value: 0.80 },
                 { field: "energy",       op: "gte", value: 0.75 }] },
  { label: "2010s Nostalgia",  emoji: "📼",
    conditions: [{ field: "decade", op: "eq", value: "2010s" }] },
  { label: "Gym / Run",        emoji: "🏋️",
    conditions: [{ field: "energy", op: "gte", value: 0.87 },
                 { field: "tempo",  op: "gte", value: 138 }] },
  { label: "New Saves",        emoji: "✨",
    conditions: [{ field: "saved_days", op: "lte", value: 30 }] },
  { label: "Late Night",       emoji: "🌙",
    conditions: [{ field: "energy",  op: "lte", value: 0.55 },
                 { field: "valence", op: "lte", value: 0.45 }] },
  { label: "Deep Focus",       emoji: "🎧",
    conditions: [{ field: "energy",       op: "lte", value: 0.45 },
                 { field: "acousticness", op: "gte", value: 0.55 }] },
  { label: "Slow & Mellow",    emoji: "🕯",
    conditions: [{ field: "tempo",  op: "lte", value: 90 },
                 { field: "energy", op: "lte", value: 0.50 }] },
];

// ─── Mood colour ─────────────────────────────────────────────────────────────
const moodColor = (v) => v >= 0.6 ? C.green : v <= 0.35 ? C.indigo : C.amber;

// ─── Condition row component ─────────────────────────────────────────────────
function ConditionRow({ cond, onChange, onRemove, isExclude }) {
  const fieldDef = FIELDS.find(f => f.value === cond.field) || FIELDS[0];
  const ops      = OPS_FOR[fieldDef.type] || OPS_FOR.text;
  const isBetween = cond.op === "between";

  const accentColor = isExclude ? C.red : C.green;

  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "center",
      padding: "10px 12px", background: C.card2,
      borderRadius: "9px", border: `1px solid ${C.border}` }}>

      {/* Exclude / include indicator */}
      <span style={{ fontSize: "11px", fontWeight: 700,
        color: accentColor, flexShrink: 0, minWidth: "32px" }}>
        {isExclude ? "NOT" : "IF"}
      </span>

      {/* Field */}
      <select value={cond.field}
        onChange={e => {
          const f = FIELDS.find(x => x.value === e.target.value) || FIELDS[0];
          const newOps = OPS_FOR[f.type] || OPS_FOR.text;
          onChange({ field: e.target.value, op: newOps[0].value,
            value: defaultValueFor(f) });
        }}
        style={{ ...input(), flex: "0 0 auto", minWidth: "140px" }}>
        {FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>

      {/* Op */}
      <select value={cond.op}
        onChange={e => {
          const newOp = e.target.value;
          const val = newOp === "between"
            ? defaultBetweenFor(fieldDef)
            : Array.isArray(cond.value) ? defaultValueFor(fieldDef) : cond.value;
          onChange({ ...cond, op: newOp, value: val });
        }}
        style={{ ...input(), flex: "0 0 auto", minWidth: "110px" }}>
        {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {/* Value(s) */}
      {fieldDef.type === "enum" ? (
        <select value={cond.value}
          onChange={e => onChange({ ...cond, value: e.target.value })}
          style={{ ...input(), flex: 1 }}>
          {fieldDef.values.map(v => (
            <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
          ))}
        </select>
      ) : fieldDef.type === "text" ? (
        <input value={cond.value} placeholder="e.g. Drake"
          onChange={e => onChange({ ...cond, value: e.target.value })}
          style={{ ...input(), flex: 1 }} />
      ) : fieldDef.type === "days" ? (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1 }}>
          <input type="number" value={cond.value} min={1} max={365}
            onChange={e => onChange({ ...cond, value: parseInt(e.target.value) || 30 })}
            style={{ ...input(), width: "70px" }} />
          <span style={{ color: C.muted, fontSize: "12px" }}>days</span>
        </div>
      ) : isBetween ? (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1 }}>
          <input type="number"
            value={Array.isArray(cond.value) ? cond.value[0] : 0}
            step={fieldDef.step || 1}
            onChange={e => {
              const arr = Array.isArray(cond.value) ? [...cond.value] : [0, 1];
              arr[0] = parseFloat(e.target.value);
              onChange({ ...cond, value: arr });
            }}
            style={{ ...input(), width: "70px" }} />
          <span style={{ color: C.muted, fontSize: "12px" }}>–</span>
          <input type="number"
            value={Array.isArray(cond.value) ? cond.value[1] : 1}
            step={fieldDef.step || 1}
            onChange={e => {
              const arr = Array.isArray(cond.value) ? [...cond.value] : [0, 1];
              arr[1] = parseFloat(e.target.value);
              onChange({ ...cond, value: arr });
            }}
            style={{ ...input(), width: "70px" }} />
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
          <input type="number" value={cond.value}
            step={fieldDef.step || 1}
            min={fieldDef.min} max={fieldDef.max}
            onChange={e => {
              const v = fieldDef.type === "rangeInt"
                ? parseInt(e.target.value)
                : parseFloat(e.target.value);
              onChange({ ...cond, value: isNaN(v) ? cond.value : v });
            }}
            style={{ ...input(), width: "80px" }} />
          {fieldDef.type === "range01" && (
            <input type="range" min={0} max={1} step={0.05}
              value={cond.value}
              onChange={e => onChange({ ...cond, value: parseFloat(e.target.value) })}
              style={{ flex: 1, accentColor: C.green }} />
          )}
        </div>
      )}

      <button onClick={onRemove}
        style={{ background: "none", border: "none", cursor: "pointer",
          color: C.muted, fontSize: "16px", flexShrink: 0, padding: "0 4px",
          lineHeight: 1 }}>×</button>
    </div>
  );
}

// ─── Track row ────────────────────────────────────────────────────────────────
function TrackRow({ track, playing, onPlay }) {
  const isPlaying = playing === track.id;
  const v = track.valence;
  const mc = moodColor(v || 0.5);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px",
      padding: "9px 14px", borderRadius: "8px",
      background: isPlaying ? C.greenBg : "transparent",
      border: `1px solid ${isPlaying ? C.greenBd : "transparent"}`,
      transition: "all 0.15s" }}>

      <button onClick={() => onPlay(track.id, track.name, track.artist)}
        style={{ width: "30px", height: "30px", borderRadius: "50%",
          border: "none", cursor: "pointer", flexShrink: 0, fontSize: "11px",
          background: isPlaying ? C.green : "#1a1a1a",
          color: isPlaying ? "#000" : C.muted }}>
        {isPlaying ? "■" : "▶"}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {track.name}
        </div>
        <div style={{ fontSize: "12px", color: C.sub,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {track.artist}
        </div>
      </div>

      <div style={{ display: "flex", gap: "6px", flexShrink: 0, flexWrap: "wrap",
        justifyContent: "flex-end" }}>
        {track.release_year && (
          <span style={{ fontSize: "11px", color: C.muted,
            background: "#151515", padding: "2px 7px", borderRadius: "10px" }}>
            {track.release_year}
          </span>
        )}
        {track.tempo && (
          <span style={{ fontSize: "11px", color: C.muted,
            background: "#151515", padding: "2px 7px", borderRadius: "10px" }}>
            {Math.round(track.tempo)} BPM
          </span>
        )}
        {track.energy != null && (
          <span style={{ fontSize: "11px", color: C.muted,
            background: "#151515", padding: "2px 7px", borderRadius: "10px" }}>
            E {Math.round(track.energy * 100)}%
          </span>
        )}
        {track.valence != null && (
          <span style={{ fontSize: "11px", color: mc,
            background: "#151515", padding: "2px 7px", borderRadius: "10px" }}>
            ● {v >= 0.6 ? "happy" : v <= 0.35 ? "dark" : "neutral"}
          </span>
        )}
        {track.language && track.language !== "english" && (
          <span style={{ fontSize: "11px", color: C.amber,
            background: "#1a1505", padding: "2px 7px", borderRadius: "10px" }}>
            {track.language}
          </span>
        )}
        <a href={track.spotify_url} target="_blank" rel="noreferrer"
          style={{ fontSize: "11px", color: C.green, textDecoration: "none" }}>↗</a>
      </div>
    </div>
  );
}

// ─── Save modal ───────────────────────────────────────────────────────────────
function SaveModal({ stats, onSave, onClose, saving, editTarget }) {
  const isEdit = Boolean(editTarget);
  const [form, setForm] = useState({
    name:             isEdit ? editTarget.name : "",
    mode:             isEdit && editTarget.spotify_playlist_id ? "existing" : "new",
    playlist_name:    isEdit ? editTarget.name : "",
    playlist_id:      isEdit ? (editTarget.spotify_playlist_id || "") : "",
    rotation_enabled: isEdit ? editTarget.rotation_enabled : false,
    rotation_size:    isEdit ? (editTarget.rotation_size || 5) : 5,
    rotation_source:  isEdit ? (editTarget.rotation_source || "library") : "library",
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ ...card(), width: "440px", maxWidth: "95vw",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>

        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800 }}>
            {isEdit ? "Update Rule" : "Save Playlist"}
          </h3>
          <button onClick={onClose}
            style={{ background: "none", border: "none", color: C.muted,
              cursor: "pointer", fontSize: "20px" }}>×</button>
        </div>

        {stats && (
          <div style={{ display: "flex", gap: "12px", marginBottom: "18px",
            padding: "10px 14px", background: C.card2, borderRadius: "9px",
            border: `1px solid ${C.border}` }}>
            <span style={{ fontSize: "12px", color: C.sub }}>
              <span style={{ color: "#fff", fontWeight: 700 }}>{stats.count}</span> tracks
            </span>
            {stats.avg_tempo && <span style={{ fontSize: "12px", color: C.sub }}>
              <span style={{ color: "#fff", fontWeight: 700 }}>{Math.round(stats.avg_tempo)}</span> avg BPM
            </span>}
            {stats.avg_energy && <span style={{ fontSize: "12px", color: C.sub }}>
              <span style={{ color: "#fff", fontWeight: 700 }}>{Math.round(stats.avg_energy * 100)}%</span> energy
            </span>}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", color: C.label,
              fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px",
              marginBottom: "6px" }}>Rule name</label>
            <input value={form.name} placeholder="Bengali Vibes, Late Night Drive..."
              onChange={e => set("name", e.target.value)}
              style={{ ...input(), width: "100%", boxSizing: "border-box" }} />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11px", color: C.label,
              fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px",
              marginBottom: "6px" }}>Spotify playlist</label>
            <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
              {[["new","Create new"],["existing","Link existing"],["none","Save rule only"]].map(([v, l]) => (
                <button key={v} onClick={() => set("mode", v)}
                  style={pill(form.mode === v, { fontSize: "11px" })}>
                  {l}
                </button>
              ))}
            </div>
            {form.mode === "new" && (
              <input value={form.playlist_name} placeholder="Playlist name on Spotify"
                onChange={e => set("playlist_name", e.target.value)}
                style={{ ...input(), width: "100%", boxSizing: "border-box" }} />
            )}
            {form.mode === "existing" && (
              <input value={form.playlist_id} placeholder="Paste Spotify playlist ID or URL"
                onChange={e => {
                  let v = e.target.value.trim();
                  if (v.includes("spotify.com/playlist/")) {
                    v = v.split("spotify.com/playlist/")[1].split("?")[0];
                  }
                  set("playlist_id", v);
                }}
                style={{ ...input(), width: "100%", boxSizing: "border-box" }} />
            )}
          </div>

          {form.mode !== "none" && (
            <div style={{ padding: "14px", background: C.card2, borderRadius: "9px",
              border: `1px solid ${C.border}` }}>
              <label style={{ display: "flex", alignItems: "center", gap: "10px",
                cursor: "pointer", marginBottom: form.rotation_enabled ? "12px" : 0 }}>
                <input type="checkbox" checked={form.rotation_enabled}
                  onChange={e => set("rotation_enabled", e.target.checked)}
                  style={{ accentColor: C.green, width: "14px", height: "14px" }} />
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>
                  Enable auto-rotation
                </span>
              </label>

              {form.rotation_enabled && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <label style={{ fontSize: "12px", color: C.sub, minWidth: "100px" }}>
                      Swap out
                    </label>
                    <select value={form.rotation_size}
                      onChange={e => set("rotation_size", parseInt(e.target.value))}
                      style={{ ...input() }}>
                      {[3,5,8,10,15].map(n => (
                        <option key={n} value={n}>{n} tracks at a time</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <label style={{ fontSize: "12px", color: C.sub, minWidth: "100px" }}>
                      Pull from
                    </label>
                    <select value={form.rotation_source}
                      onChange={e => set("rotation_source", e.target.value)}
                      style={{ ...input() }}>
                      <option value="library">Library (re-runs your rule)</option>
                      <option value="similar">Similar artists (Last.fm)</option>
                      <option value="discover">Discover (ReccoBeats recs)</option>
                    </select>
                  </div>
                  <p style={{ margin: 0, fontSize: "11px", color: C.muted, lineHeight: 1.5 }}>
                    {form.rotation_source === "library" && "Pulls fresh tracks matching your rule that aren't already in the playlist."}
                    {form.rotation_source === "similar" && "Finds artists similar to those in your playlist (via Last.fm) and picks their tracks from your library."}
                    {form.rotation_source === "discover" && "Uses ReccoBeats to find tracks that fit the playlist's sound, including ones not in your library yet."}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "20px",
          justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btn("ghost")}>Cancel</button>
          <button disabled={saving || !form.name.trim()}
            onClick={() => onSave(form)}
            style={btn("primary", { opacity: saving || !form.name.trim() ? 0.5 : 1 })}>
            {saving ? "Saving..." : "Save & Sync"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Saved playlist card ──────────────────────────────────────────────────────
function SavedCard({ pl, onSync, onRotate, onDelete, onEdit, syncing, rotating }) {
  const rule = pl.rule || {};
  const conds = rule.conditions || [];
  const excls = rule.excludes || [];

  const condLabel = (c) => {
    if (c.field === "language") return `Language = ${c.value}`;
    if (c.field === "mood")     return `Mood = ${c.value}`;
    if (c.field === "decade")   return `Decade = ${c.value}`;
    if (c.field === "saved_days") return `Saved last ${c.value} days`;
    if (c.field === "artist")   return `Artist ${c.op === "contains" ? "contains" : "="} ${c.value}`;
    const label = FIELDS.find(f => f.value === c.field)?.label || c.field;
    if (c.op === "between" && Array.isArray(c.value))
      return `${label} ${c.value[0]}–${c.value[1]}`;
    const opLabel = { gte: "≥", lte: "≤", eq: "=" }[c.op] || c.op;
    return `${label} ${opLabel} ${c.value}`;
  };

  return (
    <div style={{ ...card(), position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", marginBottom: "10px" }}>

        <div>
          <div style={{ fontSize: "15px", fontWeight: 800, color: "#fff" }}>
            {pl.name}
          </div>
          {pl.spotify_playlist_url && (
            <a href={pl.spotify_playlist_url} target="_blank" rel="noreferrer"
              style={{ fontSize: "11px", color: C.green, textDecoration: "none" }}>
              Open in Spotify ↗
            </a>
          )}
        </div>

        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap",
          justifyContent: "flex-end" }}>
          <button onClick={() => onEdit(pl)}
            style={btn("ghost", { fontSize: "11px", padding: "5px 10px" })}>
            Edit
          </button>
          {pl.spotify_playlist_id && (
            <>
              <button onClick={() => onSync(pl.id)} disabled={syncing === pl.id}
                style={btn("ghost", { fontSize: "11px", padding: "5px 10px",
                  opacity: syncing === pl.id ? 0.5 : 1 })}>
                {syncing === pl.id ? "Syncing..." : "Sync Now"}
              </button>
              <button onClick={() => onRotate(pl)} disabled={rotating === pl.id}
                style={btn("primary", { fontSize: "11px", padding: "5px 10px",
                  opacity: rotating === pl.id ? 0.5 : 1 })}>
                {rotating === pl.id ? "Rotating..." : `Rotate (${pl.rotation_size || 5})`}
              </button>
            </>
          )}
          <button onClick={() => onDelete(pl.id)}
            style={btn("danger", { fontSize: "11px", padding: "5px 10px" })}>
            Delete
          </button>
        </div>
      </div>

      {/* Conditions summary */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px",
        marginBottom: "10px" }}>
        {conds.map((c, i) => (
          <span key={i} style={{ fontSize: "11px", color: C.sub,
            background: "#151515", padding: "3px 9px",
            borderRadius: "10px", border: `1px solid ${C.border}` }}>
            {condLabel(c)}
          </span>
        ))}
        {excls.map((c, i) => (
          <span key={i} style={{ fontSize: "11px", color: C.red,
            background: "#1a0808", padding: "3px 9px",
            borderRadius: "10px", border: "1px solid #3a1a1a" }}>
            ✕ {condLabel(c)}
          </span>
        ))}
      </div>

      {/* Meta row */}
      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
        {pl.rotation_enabled && (
          <span style={{ fontSize: "11px", color: C.green }}>
            ↻ Rotation {pl.rotation_source}
          </span>
        )}
        {pl.last_synced_at && (
          <span style={{ fontSize: "11px", color: C.muted }}>
            Synced {pl.last_synced_at}
          </span>
        )}
        {pl.last_rotated_at && (
          <span style={{ fontSize: "11px", color: C.muted }}>
            Rotated {pl.last_rotated_at}
          </span>
        )}
        <span style={{ fontSize: "11px", color: C.label }}>
          Created {pl.created_at}
        </span>
      </div>
    </div>
  );
}

// ─── Rotate modal ─────────────────────────────────────────────────────────────
function RotateModal({ playlist, onRotate, onClose, rotating, result }) {
  const [size, setSize] = useState(playlist.rotation_size || 5);
  const [source, setSource] = useState(playlist.rotation_source || "library");

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ ...card(), width: "420px", maxWidth: "95vw",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>

        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: "18px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800 }}>
            Rotate "{playlist.name}"
          </h3>
          <button onClick={onClose}
            style={{ background: "none", border: "none", color: C.muted,
              cursor: "pointer", fontSize: "20px" }}>×</button>
        </div>

        {result ? (
          <div>
            <p style={{ color: C.green, fontWeight: 700, marginBottom: "12px" }}>
              ✓ Rotated {result.rotated} tracks
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div>
                <div style={{ fontSize: "11px", color: C.red, fontWeight: 600,
                  marginBottom: "6px" }}>REMOVED</div>
                {result.removed.map((n, i) => (
                  <div key={i} style={{ fontSize: "12px", color: C.muted,
                    marginBottom: "4px" }}>− {n}</div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: "11px", color: C.green, fontWeight: 600,
                  marginBottom: "6px" }}>ADDED</div>
                {result.added.map((n, i) => (
                  <div key={i} style={{ fontSize: "12px", color: C.sub,
                    marginBottom: "4px" }}>+ {n}</div>
                ))}
              </div>
            </div>
            <button onClick={onClose} style={{ ...btn("ghost"), marginTop: "16px" }}>
              Done
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={{ fontSize: "11px", color: C.label,
                fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px",
                display: "block", marginBottom: "8px" }}>Swap out</label>
              <select value={size} onChange={e => setSize(parseInt(e.target.value))}
                style={{ ...input() }}>
                {[3,5,8,10,15].map(n => (
                  <option key={n} value={n}>{n} tracks</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: "11px", color: C.label,
                fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px",
                display: "block", marginBottom: "8px" }}>Pull replacements from</label>
              {[
                ["library",  "Library",         "Fresh tracks matching your original rule"],
                ["similar",  "Similar Artists",  "Last.fm similar-artists found in your library"],
                ["discover", "Discover",         "ReccoBeats picks matching the playlist vibe"],
              ].map(([v, l, desc]) => (
                <label key={v} onClick={() => setSource(v)}
                  style={{ display: "flex", gap: "10px", padding: "10px 12px",
                    background: source === v ? C.greenBg : C.card2,
                    border: `1px solid ${source === v ? C.greenBd : C.border}`,
                    borderRadius: "8px", cursor: "pointer", marginBottom: "6px" }}>
                  <div style={{ width: "14px", height: "14px", borderRadius: "50%",
                    border: `2px solid ${source === v ? C.green : C.muted}`,
                    background: source === v ? C.green : "transparent",
                    flexShrink: 0, marginTop: "2px" }} />
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>{l}</div>
                    <div style={{ fontSize: "11px", color: C.muted }}>{desc}</div>
                  </div>
                </label>
              ))}
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
              <button onClick={onClose} style={btn("ghost")}>Cancel</button>
              <button onClick={() => onRotate(size, source)} disabled={rotating}
                style={btn("primary", { opacity: rotating ? 0.5 : 1 })}>
                {rotating ? "Rotating..." : `Rotate ${size} tracks`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Playlists() {
  const [tab,        setTab]        = useState("builder");
  const [conditions, setConditions] = useState([]);
  const [excludes,   setExcludes]   = useState([]);
  const [sortBy,     setSortBy]     = useState("saved_at");
  const [sortOrder,  setSortOrder]  = useState("desc");
  const [limit,      setLimit]      = useState(200);

  const [tracks,     setTracks]     = useState(null);
  const [stats,      setStats]      = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [searchQ,    setSearchQ]    = useState("");

  const [saved,      setSaved]      = useState([]);
  const [savedLoading, setSavedLoading] = useState(false);

  const [showSave,   setShowSave]   = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const [syncing,    setSyncing]    = useState(null);
  const [rotateTarget, setRotateTarget] = useState(null);
  const [rotating,   setRotating]   = useState(false);
  const [rotateResult, setRotateResult] = useState(null);

  const [setupMsg,   setSetupMsg]   = useState(null);
  const [enrichMsg,  setEnrichMsg]  = useState(null);
  const [enriching,  setEnriching]  = useState(false);
  const [languages,  setLanguages]  = useState([]);

  const { playing, play } = usePreview();

  // ── Load saved playlists ─────────────────────────────────────────────────
  const loadSaved = useCallback(async () => {
    setSavedLoading(true);
    try {
      const r = await fetch(`${API}/playlists/`);
      const d = await r.json();
      if (d.playlists) setSaved(d.playlists);
    } catch (e) {
      console.error(e);
    } finally {
      setSavedLoading(false);
    }
  }, []);

  useEffect(() => { loadSaved(); }, [loadSaved]);

  // ── Load language breakdown ──────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/playlists/languages`)
      .then(r => r.json())
      .then(d => { if (d.languages) setLanguages(d.languages); })
      .catch(() => {});
  }, []);

  // ── Preview ──────────────────────────────────────────────────────────────
  const runPreview = useCallback(async (overrideConds, overrideExcls) => {
    const conds = overrideConds !== undefined ? overrideConds : conditions;
    const excls = overrideExcls !== undefined ? overrideExcls : excludes;
    setLoading(true);
    try {
      const r = await fetch(`${API}/playlists/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conditions: conds, excludes: excls,
          sort_by: sortBy, sort_order: sortOrder, limit }),
      });
      const d = await r.json();
      if (d.error) { alert(d.error); return; }
      setTracks(d.tracks || []);
      setStats(d.stats || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [conditions, excludes, sortBy, sortOrder, limit]);

  // ── Apply preset ─────────────────────────────────────────────────────────
  const applyPreset = useCallback((preset) => {
    setConditions(preset.conditions);
    setExcludes([]);
    runPreview(preset.conditions, []);
  }, [runPreview]);

  // ── Add condition ────────────────────────────────────────────────────────
  const addCondition = (toExcludes = false) => {
    const f = FIELDS[0];
    const newCond = { field: f.value, op: OPS_FOR[f.type][0].value, value: defaultValueFor(f) };
    if (toExcludes) setExcludes(e => [...e, newCond]);
    else setConditions(c => [...c, newCond]);
  };

  // ── Save / create ────────────────────────────────────────────────────────
  const handleSave = async (form) => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const body = {
        name:              form.name,
        conditions,
        excludes,
        sort_by:           sortBy,
        sort_order:        sortOrder,
        limit,
        playlist_name:     form.mode === "new" ? form.playlist_name : null,
        playlist_id:       form.mode === "existing" ? form.playlist_id : null,
        rotation_enabled:  form.rotation_enabled,
        rotation_size:     form.rotation_size,
        rotation_source:   form.rotation_source,
      };

      const url    = editTarget ? `${API}/playlists/${editTarget.id}` : `${API}/playlists/`;
      const method = editTarget ? "PUT" : "POST";
      const r  = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.error) { alert(d.error); return; }
      setShowSave(false);
      setEditTarget(null);
      loadSaved();
      setTab("saved");
    } finally {
      setSaving(false);
    }
  };

  // ── Sync ─────────────────────────────────────────────────────────────────
  const handleSync = async (id) => {
    setSyncing(id);
    try {
      const r = await fetch(`${API}/playlists/${id}/sync`, { method: "POST" });
      const d = await r.json();
      if (d.error) alert(d.error);
      else { loadSaved(); alert(`✓ Synced ${d.synced} tracks`); }
    } finally {
      setSyncing(null);
    }
  };

  // ── Rotate ───────────────────────────────────────────────────────────────
  const handleRotate = async (size, source) => {
    if (!rotateTarget) return;
    setRotating(true);
    try {
      const r = await fetch(`${API}/playlists/${rotateTarget.id}/rotate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotation_size: size, rotation_source: source }),
      });
      const d = await r.json();
      if (d.error) { alert(d.error); }
      else { setRotateResult(d); loadSaved(); }
    } finally {
      setRotating(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!confirm("Delete this playlist rule?")) return;
    await fetch(`${API}/playlists/${id}`, { method: "DELETE" });
    loadSaved();
  };

  // ── Edit (load rule back into builder) ───────────────────────────────────
  const handleEdit = (pl) => {
    const rule = pl.rule || {};
    setConditions(rule.conditions || []);
    setExcludes(rule.excludes || []);
    setSortBy(rule.sort_by || "saved_at");
    setSortOrder(rule.sort_order || "desc");
    setLimit(rule.limit || 200);
    setEditTarget(pl);
    setShowSave(true);
    setTab("builder");
  };

  // ── Setup ────────────────────────────────────────────────────────────────
  const runSetup = async () => {
    setSetupMsg("Running setup...");
    const r = await fetch(`${API}/playlists/setup`, { method: "POST" });
    const d = await r.json();
    setSetupMsg(d.error || `✓ Setup complete — ${d.non_english_tracks} non-English tracks detected`);
    // Refresh language list
    fetch(`${API}/playlists/languages`).then(r => r.json())
      .then(d => { if (d.languages) setLanguages(d.languages); });
  };

  const runEnrich = async () => {
    setEnriching(true);
    setEnrichMsg("Running Last.fm enrichment (this takes ~2 min)...");
    try {
      const r = await fetch(`${API}/playlists/enrich-language`, { method: "POST" });
      const d = await r.json();
      if (d.error) setEnrichMsg(d.error);
      else setEnrichMsg(`✓ Enriched ${d.enriched_tracks} tracks (${d.enriched_artists?.length || 0} artists)`);
      fetch(`${API}/playlists/languages`).then(r => r.json())
        .then(d => { if (d.languages) setLanguages(d.languages); });
    } finally {
      setEnriching(false);
    }
  };

  // ── Filtered tracks for search-within-results ────────────────────────────
  const displayed = (tracks || []).filter(t =>
    !searchQ ||
    t.name.toLowerCase().includes(searchQ.toLowerCase()) ||
    t.artist.toLowerCase().includes(searchQ.toLowerCase())
  );

  return (
    <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "36px 24px 100px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "center", marginBottom: "28px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 800 }}>Smart Playlists</h1>
          <p style={{ margin: "4px 0 0", color: C.muted, fontSize: "13px" }}>
            Build rule-based playlists from your library. Auto-sync and rotate them.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => setTab("builder")}
            style={pill(tab === "builder")}>Builder</button>
          <button onClick={() => { setTab("saved"); loadSaved(); }}
            style={pill(tab === "saved")}>
            My Playlists {saved.length > 0 ? `(${saved.length})` : ""}
          </button>
        </div>
      </div>

      {/* ── BUILDER TAB ────────────────────────────────────────────────────── */}
      {tab === "builder" && (
        <div style={{ display: "grid", gridTemplateColumns: "340px 1fr",
          gap: "16px", alignItems: "start" }}>

          {/* Left: rule builder */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

            {/* Quick presets */}
            <div style={{ ...card() }}>
              <div style={{ fontSize: "11px", color: C.label, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>
                Quick Presets
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {PRESETS.map(p => (
                  <button key={p.label} onClick={() => applyPreset(p)}
                    style={{ padding: "5px 11px", borderRadius: "16px",
                      fontSize: "11px", fontWeight: 600, cursor: "pointer",
                      background: "#151515", color: C.muted,
                      border: `1px solid ${C.border}`, transition: "all 0.15s" }}
                    onMouseEnter={e => {
                      e.target.style.background = C.greenBg;
                      e.target.style.color = C.green;
                      e.target.style.borderColor = C.greenBd;
                    }}
                    onMouseLeave={e => {
                      e.target.style.background = "#151515";
                      e.target.style.color = C.muted;
                      e.target.style.borderColor = C.border;
                    }}>
                    {p.emoji} {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Conditions */}
            <div style={{ ...card() }}>
              <div style={{ display: "flex", justifyContent: "space-between",
                alignItems: "center", marginBottom: "10px" }}>
                <div style={{ fontSize: "11px", color: C.label, fontWeight: 600,
                  textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Conditions
                </div>
                {conditions.length > 0 && (
                  <button onClick={() => setConditions([])}
                    style={{ background: "none", border: "none", cursor: "pointer",
                      fontSize: "11px", color: C.muted }}>clear all</button>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {conditions.map((c, i) => (
                  <ConditionRow key={i} cond={c}
                    onChange={v => setConditions(arr => arr.map((x, j) => j === i ? v : x))}
                    onRemove={() => setConditions(arr => arr.filter((_, j) => j !== i))}
                    isExclude={false} />
                ))}
              </div>
              <button onClick={() => addCondition(false)}
                style={{ marginTop: conditions.length ? "8px" : 0,
                  ...btn("ghost", { fontSize: "12px", padding: "6px 14px", width: "100%" }) }}>
                + Add condition
              </button>
            </div>

            {/* Excludes */}
            <div style={{ ...card() }}>
              <div style={{ display: "flex", justifyContent: "space-between",
                alignItems: "center", marginBottom: "10px" }}>
                <div style={{ fontSize: "11px", color: C.red, fontWeight: 600,
                  textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Exclude
                </div>
                {excludes.length > 0 && (
                  <button onClick={() => setExcludes([])}
                    style={{ background: "none", border: "none", cursor: "pointer",
                      fontSize: "11px", color: C.muted }}>clear</button>
                )}
              </div>
              {excludes.length === 0 && (
                <p style={{ margin: "0 0 8px", fontSize: "12px", color: C.muted }}>
                  Cut tracks that match these from the result
                </p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {excludes.map((c, i) => (
                  <ConditionRow key={i} cond={c}
                    onChange={v => setExcludes(arr => arr.map((x, j) => j === i ? v : x))}
                    onRemove={() => setExcludes(arr => arr.filter((_, j) => j !== i))}
                    isExclude={true} />
                ))}
              </div>
              <button onClick={() => addCondition(true)}
                style={{ marginTop: excludes.length ? "8px" : 0,
                  ...btn("ghost", { fontSize: "12px", padding: "6px 14px",
                    width: "100%", color: C.red, borderColor: "#3a1a1a" }) }}>
                + Add exclusion
              </button>
            </div>

            {/* Sort + limit */}
            <div style={{ ...card() }}>
              <div style={{ fontSize: "11px", color: C.label, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>
                Sort & Limit
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                  style={{ ...input(), flex: 1, minWidth: "130px" }}>
                  <option value="saved_at">Date Saved</option>
                  <option value="energy">Energy</option>
                  <option value="valence">Valence</option>
                  <option value="tempo">Tempo</option>
                  <option value="danceability">Danceability</option>
                  <option value="acousticness">Acousticness</option>
                  <option value="release_year">Release Year</option>
                  <option value="artist">Artist</option>
                  <option value="name">Title</option>
                </select>
                <select value={sortOrder} onChange={e => setSortOrder(e.target.value)}
                  style={{ ...input() }}>
                  <option value="desc">↓ Desc</option>
                  <option value="asc">↑ Asc</option>
                </select>
                <select value={limit} onChange={e => setLimit(parseInt(e.target.value))}
                  style={{ ...input() }}>
                  {[50, 100, 200, 500, 1000].map(n => (
                    <option key={n} value={n}>{n} tracks max</option>
                  ))}
                </select>
              </div>
            </div>

            <button onClick={() => runPreview()} disabled={loading}
              style={btn("primary", { width: "100%", padding: "12px",
                fontSize: "14px", opacity: loading ? 0.6 : 1 })}>
              {loading ? "Searching..." : "Preview →"}
            </button>
          </div>

          {/* Right: results */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {tracks === null && (
              <div style={{ ...card(), textAlign: "center", padding: "48px",
                color: C.muted }}>
                <div style={{ fontSize: "32px", marginBottom: "10px" }}>🎵</div>
                <div style={{ fontSize: "14px" }}>
                  Set conditions and hit <strong style={{ color: "#fff" }}>Preview</strong>
                </div>
                <div style={{ fontSize: "12px", marginTop: "6px" }}>
                  Or tap a quick preset above
                </div>
              </div>
            )}

            {tracks !== null && (
              <>
                {/* Stats bar */}
                {stats && (
                  <div style={{ display: "flex", gap: "12px", flexWrap: "wrap",
                    padding: "12px 16px", background: C.card,
                    borderRadius: "10px", border: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>
                      {stats.count} tracks
                    </span>
                    {stats.avg_tempo && (
                      <span style={{ fontSize: "12px", color: C.sub }}>
                        {Math.round(stats.avg_tempo)} avg BPM
                      </span>
                    )}
                    {stats.avg_energy != null && (
                      <span style={{ fontSize: "12px", color: C.sub }}>
                        {Math.round(stats.avg_energy * 100)}% energy
                      </span>
                    )}
                    <span style={{ fontSize: "12px", color: C.green }}>
                      {stats.happy_pct}% happy
                    </span>
                    <span style={{ fontSize: "12px", color: C.indigo }}>
                      {stats.dark_pct}% dark
                    </span>
                    <span style={{ fontSize: "12px", color: C.sub }}>
                      {stats.unique_artists} artists
                    </span>
                    {stats.languages && Object.entries(stats.languages)
                      .filter(([l]) => l !== "english")
                      .map(([l, n]) => (
                        <span key={l} style={{ fontSize: "12px", color: C.amber }}>
                          {n} {l}
                        </span>
                      ))}
                  </div>
                )}

                {/* Search within results */}
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <input value={searchQ} placeholder="Search within results..."
                    onChange={e => setSearchQ(e.target.value)}
                    style={{ ...input(), flex: 1 }} />
                  <button onClick={() => setShowSave(true)}
                    style={btn("primary", { whiteSpace: "nowrap" })}>
                    Save as Playlist →
                  </button>
                </div>

                {/* Track list */}
                <div style={{ ...card(), padding: "8px" }}>
                  {displayed.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "32px",
                      color: C.muted, fontSize: "13px" }}>
                      {searchQ ? "No matches in results" : "No tracks match these conditions"}
                    </div>
                  ) : (
                    displayed.map(t => (
                      <TrackRow key={t.id} track={t}
                        playing={playing}
                        onPlay={play} />
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── SAVED PLAYLISTS TAB ──────────────────────────────────────────────── */}
      {tab === "saved" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

          {/* Language detection setup card */}
          <div style={{ ...card(), background: "#0a0f0a",
            border: `1px solid ${C.greenBd}` }}>
            <div style={{ display: "flex", justifyContent: "space-between",
              alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff",
                  marginBottom: "4px" }}>
                  Language Detection
                </div>
                <div style={{ fontSize: "12px", color: C.sub }}>
                  Detects Bengali, Hindi, Arabic and more in your library.
                  Run setup once, then enrich for romanized tracks.
                </div>
                {languages.length > 0 && (
                  <div style={{ display: "flex", gap: "8px", marginTop: "8px",
                    flexWrap: "wrap" }}>
                    {languages.filter(l => l.language !== "english").map(l => (
                      <span key={l.language}
                        style={{ fontSize: "11px", color: C.amber,
                          background: "#1a1505", padding: "2px 8px",
                          borderRadius: "10px", border: "1px solid #3a2a05" }}>
                        {l.count} {l.language}
                      </span>
                    ))}
                  </div>
                )}
                {(setupMsg || enrichMsg) && (
                  <div style={{ fontSize: "12px", color: C.green, marginTop: "8px" }}>
                    {setupMsg || enrichMsg}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={runSetup}
                  style={btn("ghost", { fontSize: "12px" })}>
                  Run Setup
                </button>
                <button onClick={runEnrich} disabled={enriching}
                  style={btn("ghost", { fontSize: "12px",
                    opacity: enriching ? 0.5 : 1 })}>
                  {enriching ? "Enriching..." : "Enrich (Last.fm)"}
                </button>
              </div>
            </div>
          </div>

          {savedLoading ? (
            <div style={{ textAlign: "center", padding: "40px", color: C.muted }}>
              Loading...
            </div>
          ) : saved.length === 0 ? (
            <div style={{ ...card(), textAlign: "center", padding: "48px",
              color: C.muted }}>
              <div style={{ fontSize: "28px", marginBottom: "10px" }}>📋</div>
              <div style={{ fontSize: "14px" }}>No saved playlists yet</div>
              <div style={{ fontSize: "12px", marginTop: "6px" }}>
                Build one in the Builder tab
              </div>
              <button onClick={() => setTab("builder")}
                style={{ ...btn("primary"), marginTop: "16px" }}>
                Open Builder
              </button>
            </div>
          ) : (
            saved.map(pl => (
              <SavedCard key={pl.id} pl={pl}
                syncing={syncing} rotating={rotateTarget?.id === pl.id && rotating ? pl.id : null}
                onSync={handleSync}
                onRotate={(p) => { setRotateTarget(p); setRotateResult(null); }}
                onDelete={handleDelete}
                onEdit={handleEdit} />
            ))
          )}
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {showSave && (
        <SaveModal
          stats={stats}
          saving={saving}
          editTarget={editTarget}
          onSave={handleSave}
          onClose={() => { setShowSave(false); setEditTarget(null); }} />
      )}

      {rotateTarget && (
        <RotateModal
          playlist={rotateTarget}
          rotating={rotating}
          result={rotateResult}
          onRotate={handleRotate}
          onClose={() => { setRotateTarget(null); setRotateResult(null); }} />
      )}
    </div>
  );
}
