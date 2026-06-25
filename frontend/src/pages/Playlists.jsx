import { useState, useCallback, useEffect } from "react";
import usePreview from "../hooks/usePreview";
import useMediaQuery from "../hooks/useMediaQuery";
import { MOBILE_Q } from "../components/Spine";
import SwipeDeck from "../components/SwipeDeck";
import { C, FONT, TYPE, SECTION, card, btn, pill, input } from "../theme";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Section 5 accent — royal purple (Playlists department; inherited by embedded Collab)
const AC  = SECTION[5].color;
const AW  = SECTION[5].wash;
const AON = SECTION[5].on;

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

// ─── Quick presets (used by the builder — kept for future preset UI) ─────────
// eslint-disable-next-line no-unused-vars
const PRESETS = [
  { label: "All Bengali",      conditions: [{ field: "language", op: "eq", value: "bengali" }] },
  { label: "All Hindi",        conditions: [{ field: "language", op: "eq", value: "hindi" }] },
  { label: "Bangers",          conditions: [{ field: "energy", op: "gte", value: 0.82 },
                                             { field: "tempo",  op: "gte", value: 130 }] },
  { label: "Sad Hours",        conditions: [{ field: "mood",   op: "eq",  value: "dark" },
                                             { field: "energy", op: "lte", value: 0.50 }] },
  { label: "Good Vibes",       conditions: [{ field: "mood",   op: "eq",  value: "happy" }] },
  { label: "Acoustic",         conditions: [{ field: "acousticness", op: "gte", value: 0.75 }] },
  { label: "Dance Floor",      conditions: [{ field: "danceability", op: "gte", value: 0.80 },
                                             { field: "energy",       op: "gte", value: 0.75 }] },
  { label: "2010s Nostalgia",  conditions: [{ field: "decade", op: "eq", value: "2010s" }] },
  { label: "Gym / Run",        conditions: [{ field: "energy", op: "gte", value: 0.87 },
                                             { field: "tempo",  op: "gte", value: 138 }] },
  { label: "New Saves",        conditions: [{ field: "saved_days", op: "lte", value: 30 }] },
  { label: "Late Night",       conditions: [{ field: "energy",  op: "lte", value: 0.55 },
                                             { field: "valence", op: "lte", value: 0.45 }] },
  { label: "Deep Focus",       conditions: [{ field: "energy",       op: "lte", value: 0.45 },
                                             { field: "acousticness", op: "gte", value: 0.55 }] },
  { label: "Slow & Mellow",    conditions: [{ field: "tempo",  op: "lte", value: 90 },
                                             { field: "energy", op: "lte", value: 0.50 }] },
];

// ─── Mood colour ─────────────────────────────────────────────────────────────
const moodColor = (v) => v >= 0.6 ? AC : v <= 0.35 ? C.indigo : C.amber;

// ─── Condition row component ─────────────────────────────────────────────────
function ConditionRow({ cond, onChange, onRemove, isExclude }) {
  const fieldDef = FIELDS.find(f => f.value === cond.field) || FIELDS[0];
  const ops      = OPS_FOR[fieldDef.type] || OPS_FOR.text;
  const isBetween = cond.op === "between";

  const accentColor = isExclude ? C.red : AC;

  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "center",
      flexWrap: "wrap", padding: "10px 12px", background: C.card2,
      borderRadius: "4px", border: `1.5px solid ${C.border2}`,
      boxSizing: "border-box", maxWidth: "100%" }}>

      {/* Exclude / include indicator */}
      <span style={{ fontFamily: FONT.mono, fontSize: "11px", fontWeight: 700,
        color: accentColor, flexShrink: 0, minWidth: "32px",
        textTransform: "uppercase", letterSpacing: "1px" }}>
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
        style={{ ...input(), flex: "1 1 120px", minWidth: "110px" }}>
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
        style={{ ...input(), flex: "0 1 90px", minWidth: "70px" }}>
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
          <span style={{ color: C.sub, fontSize: "12px", fontFamily: FONT.mono }}>days</span>
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
          <span style={{ color: C.sub, fontSize: "12px" }}>–</span>
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
              style={{ flex: 1, accentColor: AC }} />
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
      padding: "9px 14px", borderRadius: "4px",
      background: isPlaying ? AW : "transparent",
      border: `1.5px solid ${isPlaying ? AC : "transparent"}`,
      transition: "all 0.15s" }}>

      <button onClick={() => onPlay(track.id, track.name, track.artist)}
        style={{ width: "30px", height: "30px", borderRadius: "4px",
          border: `1.5px solid ${isPlaying ? AC : C.border2}`, cursor: "pointer",
          flexShrink: 0, fontSize: "11px",
          background: isPlaying ? AC : C.card2,
          color: isPlaying ? C.white : C.sub }}>
        {isPlaying ? "■" : "▶"}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: C.ink,
          fontFamily: FONT.ui,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {track.name}
        </div>
        <div style={{ fontSize: "12px", color: C.sub, fontFamily: FONT.ui,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {track.artist}
        </div>
      </div>

      <div style={{ display: "flex", gap: "5px", flexShrink: 0, flexWrap: "wrap",
        justifyContent: "flex-end" }}>
        {track.release_year && (
          <span style={{ fontFamily: FONT.mono, fontSize: "10.5px", color: C.sub,
            background: C.card2, padding: "2px 7px",
            border: `1px solid ${C.border2}`, borderRadius: "3px" }}>
            {track.release_year}
          </span>
        )}
        {track.tempo && (
          <span style={{ fontFamily: FONT.mono, fontSize: "10.5px", color: C.sub,
            background: C.card2, padding: "2px 7px",
            border: `1px solid ${C.border2}`, borderRadius: "3px" }}>
            {Math.round(track.tempo)} BPM
          </span>
        )}
        {track.energy != null && (
          <span style={{ fontFamily: FONT.mono, fontSize: "10.5px", color: C.sub,
            background: C.card2, padding: "2px 7px",
            border: `1px solid ${C.border2}`, borderRadius: "3px" }}>
            E {Math.round(track.energy * 100)}%
          </span>
        )}
        {track.valence != null && (
          <span style={{ fontFamily: FONT.mono, fontSize: "10.5px",
            background: C.card2, padding: "2px 7px",
            border: `1px solid ${C.border2}`, borderRadius: "3px",
            color: mc }}>
            ● {v >= 0.6 ? "happy" : v <= 0.35 ? "dark" : "neutral"}
          </span>
        )}
        {track.language && track.language !== "english" && (
          <span style={{ fontFamily: FONT.mono, fontSize: "10.5px", color: C.brown,
            background: C.amberBg, padding: "2px 7px",
            border: `1px solid ${C.amber}55`, borderRadius: "3px" }}>
            {track.language}
          </span>
        )}
        <a href={track.spotify_url} target="_blank" rel="noreferrer"
          style={{ fontFamily: FONT.mono, fontSize: "11px", color: AC,
            textDecoration: "none" }}>↗</a>
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
  const saveLabel = form.mode === "none"
    ? (isEdit ? "Update Rule" : "Save Rule")
    : (isEdit ? "Update & Sync" : "Save & Sync");

  return (
    <div style={{ position: "fixed", inset: 0,
      background: "rgba(22,17,24,0.55)",
      zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ ...card(), width: "440px", maxWidth: "95vw",
        border: `1.5px solid ${C.ink}`,
        boxShadow: "6px 6px 0 rgba(22,17,24,0.18)" }}>

        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800,
            fontFamily: FONT.display, color: C.ink }}>
            {isEdit ? "Update Rule" : "Save Playlist"}
          </h3>
          <button onClick={onClose}
            style={{ background: "none", border: "none", color: C.muted,
              cursor: "pointer", fontSize: "20px" }}>×</button>
        </div>

        {stats && (
          <div style={{ display: "flex", gap: "12px", marginBottom: "18px",
            padding: "10px 14px", background: C.card2,
            border: `1.5px solid ${C.border2}`, borderRadius: "4px" }}>
            <span style={{ fontFamily: FONT.mono, fontSize: "12px", color: C.sub }}>
              <span style={{ color: C.ink, fontWeight: 700 }}>{stats.count}</span> tracks
            </span>
            {stats.avg_tempo && <span style={{ fontFamily: FONT.mono, fontSize: "12px", color: C.sub }}>
              <span style={{ color: C.ink, fontWeight: 700 }}>{Math.round(stats.avg_tempo)}</span> avg BPM
            </span>}
            {stats.avg_energy && <span style={{ fontFamily: FONT.mono, fontSize: "12px", color: C.sub }}>
              <span style={{ color: C.ink, fontWeight: 700 }}>{Math.round(stats.avg_energy * 100)}%</span> energy
            </span>}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ display: "block", fontFamily: FONT.mono, fontSize: "11px",
              color: C.label, fontWeight: 600, textTransform: "uppercase",
              letterSpacing: "1.2px", marginBottom: "6px" }}>Rule name</label>
            <input value={form.name} placeholder="Bengali Vibes, Late Night Drive..."
              onChange={e => set("name", e.target.value)}
              style={{ ...input(), width: "100%", boxSizing: "border-box" }} />
          </div>

          <div>
            <label style={{ display: "block", fontFamily: FONT.mono, fontSize: "11px",
              color: C.label, fontWeight: 600, textTransform: "uppercase",
              letterSpacing: "1.2px", marginBottom: "6px" }}>Spotify playlist</label>
            <div style={{ display: "flex", gap: "6px", marginBottom: "8px", flexWrap: "wrap" }}>
              {[["new","Create new"],["existing","Link existing"],["none","Rule only"]].map(([v, l]) => (
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
            <div style={{ padding: "14px", background: C.card2,
              border: `1.5px solid ${C.border2}`, borderRadius: "4px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "10px",
                cursor: "pointer", marginBottom: form.rotation_enabled ? "12px" : 0 }}>
                <input type="checkbox" checked={form.rotation_enabled}
                  onChange={e => set("rotation_enabled", e.target.checked)}
                  style={{ accentColor: AC, width: "14px", height: "14px" }} />
                <span style={{ fontFamily: FONT.ui, fontSize: "13px",
                  fontWeight: 600, color: C.ink }}>
                  Enable auto-rotation
                </span>
              </label>

              {form.rotation_enabled && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <label style={{ fontFamily: FONT.mono, fontSize: "12px",
                      color: C.sub, minWidth: "100px" }}>
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
                    <label style={{ fontFamily: FONT.mono, fontSize: "12px",
                      color: C.sub, minWidth: "100px" }}>
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
                  <p style={{ margin: 0, fontFamily: FONT.body, fontSize: "11px",
                    color: C.muted, lineHeight: 1.5 }}>
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
            style={btn("primary", {
              background: AC, color: C.white, borderColor: AC,
              opacity: saving || !form.name.trim() ? 0.5 : 1 })}>
            {saving ? "Saving..." : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Saved playlist card ──────────────────────────────────────────────────────
function SavedCard({ pl, onSync, onRotate, onDelete, onEdit, onSaved, syncing, rotating }) {
  const [showRotSettings, setShowRotSettings] = useState(false);
  const [rotInterval, setRotInterval]         = useState(pl.rule?.rotation_interval_days || 7);
  const [rotSize,     setRotSize]             = useState(pl.rotation_size   || 5);
  const [rotSource,   setRotSource]           = useState(pl.rotation_source || "library");
  const [savingRot,   setSavingRot]           = useState(false);

  const rule  = pl.rule || {};
  const conds = rule.conditions || [];
  const excls = rule.excludes   || [];

  const condLabel = (c) => {
    if (c.field === "language")   return `Language = ${c.value}`;
    if (c.field === "mood")       return `Mood = ${c.value}`;
    if (c.field === "decade")     return `Decade = ${c.value}`;
    if (c.field === "saved_days") return `Saved last ${c.value} days`;
    if (c.field === "artist")     return `Artist ${c.op === "contains" ? "contains" : "="} ${c.value}`;
    const label = FIELDS.find(f => f.value === c.field)?.label || c.field;
    if (c.op === "between" && Array.isArray(c.value)) return `${label} ${c.value[0]}–${c.value[1]}`;
    const opLabel = { gte: "≥", lte: "≤", eq: "=" }[c.op] || c.op;
    return `${label} ${opLabel} ${c.value}`;
  };

  const rotStatus = (() => {
    if (!pl.rotation_enabled) return null;
    if (!pl.last_rotated_at)  return { text: "Never rotated — due now", due: true };
    const days  = Math.floor((new Date() - new Date(pl.last_rotated_at)) / 86400000);
    const until = Math.max(0, rotInterval - days);
    if (until === 0) return { text: "Rotation due now",  due: true };
    if (until === 1) return { text: "Rotates tomorrow",  due: false };
    return { text: `Rotates in ${until} days`, due: false };
  })();

  const saveRotationSettings = async () => {
    setSavingRot(true);
    try {
      const existingRule = pl.rule || {};
      await fetch(`${API}/playlists/${pl.id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:             pl.name,
          spotify_mode:     pl.spotify_playlist_id ? "existing" : "none",
          playlist_id:      pl.spotify_playlist_id || null,
          conditions:       existingRule.conditions || [],
          excludes:         existingRule.excludes   || [],
          sort_by:          existingRule.sort_by    || "saved_at",
          sort_order:       existingRule.sort_order || "desc",
          limit:            existingRule.limit      || 200,
          rotation_enabled:       pl.rotation_enabled,
          rotation_size:          rotSize,
          rotation_source:        rotSource,
          rotation_interval_days: rotInterval,
        }),
      });
      setShowRotSettings(false);
      if (onSaved) onSaved();
    } finally {
      setSavingRot(false);
    }
  };

  const SOURCE_OPTS = [
    { v: "library",  label: "Library",         sub: "Re-run your rule, pull fresh library tracks" },
    { v: "similar",  label: "Similar Artists", sub: "Last.fm neighbours from your library" },
    { v: "discover", label: "Discover",        sub: "ReccoBeats picks seeded from playlist" },
  ];
  const INTERVAL_OPTS = [
    { value: 1,  label: "Daily"        },
    { value: 3,  label: "Every 3 days" },
    { value: 7,  label: "Weekly"       },
    { value: 14, label: "Biweekly"     },
    { value: 30, label: "Monthly"      },
  ];

  return (
    <div className="lift" style={{ ...card(), border: `1.5px solid ${C.ink}`,
      boxShadow: "4px 4px 0 rgba(22,17,24,0.10)", position: "relative" }}>

      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", marginBottom: "10px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ fontFamily: FONT.display, fontSize: "15px",
              fontWeight: 800, color: C.ink }}>{pl.name}</div>
            {rotStatus && (
              <span style={{
                width: "7px", height: "7px", borderRadius: "50%", display: "inline-block",
                background: rotStatus.due ? C.amber : AC,
                flexShrink: 0,
              }} title={rotStatus.text} />
            )}
          </div>
          {pl.spotify_playlist_url && (
            <a href={pl.spotify_playlist_url} target="_blank" rel="noreferrer"
              style={{ fontFamily: FONT.mono, fontSize: "11px",
                color: AC, textDecoration: "none" }}>
              Open in Spotify ↗
            </a>
          )}
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button onClick={() => onEdit(pl)}
            style={btn("ghost", { fontSize: "11px", padding: "5px 10px" })}>Edit</button>
          {pl.spotify_playlist_id && (
            <>
              <button onClick={() => onSync(pl.id)} disabled={syncing === pl.id}
                style={btn("ghost", { fontSize: "11px", padding: "5px 10px",
                  opacity: syncing === pl.id ? 0.5 : 1 })}>
                {syncing === pl.id ? "Syncing..." : "Sync Now"}
              </button>
              <button onClick={() => onRotate(pl)} disabled={rotating === pl.id}
                style={btn(rotStatus?.due ? "primary" : "ghost", {
                  fontSize: "11px", padding: "5px 10px",
                  opacity: rotating === pl.id ? 0.5 : 1,
                  ...(rotStatus?.due ? { background: AC, color: C.white, borderColor: AC } : {}),
                })}>
                {rotating === pl.id ? "Rotating..." : `↻ Rotate${rotStatus?.due ? " (due)" : ""}`}
              </button>
            </>
          )}
          <button onClick={() => onDelete(pl.id)}
            style={btn("danger", { fontSize: "11px", padding: "5px 10px" })}>Delete</button>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "10px" }}>
        {conds.map((c, i) => (
          <span key={i} style={{ fontFamily: FONT.mono, fontSize: "10.5px",
            color: C.ink, background: AW,
            padding: "3px 9px", borderRadius: "3px",
            border: `1px solid ${AC}44` }}>
            {condLabel(c)}
          </span>
        ))}
        {excls.map((c, i) => (
          <span key={i} style={{ fontFamily: FONT.mono, fontSize: "10.5px",
            color: C.red, background: C.redBg,
            padding: "3px 9px", borderRadius: "3px",
            border: `1px solid ${C.red}44` }}>
            ✕ {condLabel(c)}
          </span>
        ))}
      </div>

      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "center" }}>
        {rotStatus ? (
          <span style={{ fontFamily: FONT.mono, fontSize: "11px",
            color: rotStatus.due ? C.amber : AC, fontWeight: 600 }}>
            ↻ {rotStatus.text}
          </span>
        ) : pl.rotation_enabled ? (
          <span style={{ fontFamily: FONT.mono, fontSize: "11px", color: AC }}>↻ Auto-rotation on</span>
        ) : null}
        {pl.last_synced_at && (
          <span style={{ fontFamily: FONT.mono, fontSize: "11px", color: C.muted }}>
            Synced {pl.last_synced_at}
          </span>
        )}
        {pl.last_rotated_at && (
          <span style={{ fontFamily: FONT.mono, fontSize: "11px", color: C.muted }}>
            Last rotated {pl.last_rotated_at}
          </span>
        )}
        <span style={{ fontFamily: FONT.mono, fontSize: "11px", color: C.label }}>
          Created {pl.created_at}
        </span>
        {pl.rotation_enabled && pl.spotify_playlist_id && (
          <button onClick={() => setShowRotSettings(v => !v)}
            style={{ background: "none", border: "none", cursor: "pointer",
              fontFamily: FONT.mono, fontSize: "11px", color: C.sub,
              marginLeft: "auto", padding: 0, textDecoration: "underline" }}>
            {showRotSettings ? "Hide settings" : "⚙ Rotation settings"}
          </button>
        )}
      </div>

      {showRotSettings && (
        <div style={{ marginTop: "14px", padding: "16px", borderRadius: "4px",
          background: C.card2, border: `1.5px solid ${C.border2}` }}>
          <div style={{ fontFamily: FONT.mono, fontSize: "11px", fontWeight: 600,
            color: C.label, textTransform: "uppercase", letterSpacing: "1px",
            marginBottom: "14px" }}>
            Auto-Rotation Settings
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
            gap: "12px", marginBottom: "14px" }}>

            <div>
              <div style={{ fontFamily: FONT.mono, fontSize: "11px",
                color: C.muted, marginBottom: "8px" }}>Swap out</div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input type="range" min={2} max={15} step={1} value={rotSize}
                  onChange={e => setRotSize(parseInt(e.target.value))}
                  style={{ flex: 1, accentColor: AC }} />
                <span style={{ fontFamily: FONT.display, fontSize: "14px",
                  fontWeight: 800, color: C.ink, minWidth: "20px" }}>
                  {rotSize}
                </span>
              </div>
              <div style={{ fontFamily: FONT.mono, fontSize: "11px",
                color: C.label, marginTop: "2px" }}>tracks per rotation</div>
            </div>

            <div>
              <div style={{ fontFamily: FONT.mono, fontSize: "11px",
                color: C.muted, marginBottom: "8px" }}>Pull from</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {SOURCE_OPTS.map(o => (
                  <button key={o.v} onClick={() => setRotSource(o.v)} style={{
                    background: rotSource === o.v ? AW : C.card2,
                    border: `1.5px solid ${rotSource === o.v ? AC : C.border2}`,
                    borderRadius: "4px", padding: "5px 8px",
                    cursor: "pointer", textAlign: "left",
                  }}>
                    <div style={{ fontFamily: FONT.ui, fontSize: "12px", fontWeight: 600,
                      color: rotSource === o.v ? AC : C.ink }}>{o.label}</div>
                    <div style={{ fontFamily: FONT.mono, fontSize: "10px",
                      color: C.muted }}>{o.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontFamily: FONT.mono, fontSize: "11px",
                color: C.muted, marginBottom: "8px" }}>How often</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {INTERVAL_OPTS.map(o => (
                  <button key={o.value} onClick={() => setRotInterval(o.value)} style={{
                    background: rotInterval === o.value ? AW : C.card2,
                    border: `1.5px solid ${rotInterval === o.value ? AC : C.border2}`,
                    borderRadius: "4px", padding: "5px 10px", cursor: "pointer",
                    textAlign: "left",
                    fontFamily: FONT.ui, fontSize: "12px",
                    fontWeight: rotInterval === o.value ? 700 : 400,
                    color: rotInterval === o.value ? AC : C.sub,
                  }}>{o.label}</button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button onClick={() => setShowRotSettings(false)}
              style={btn("ghost", { fontSize: "12px", padding: "6px 14px" })}>Cancel</button>
            <button onClick={saveRotationSettings} disabled={savingRot}
              style={btn("primary", { fontSize: "12px", padding: "6px 14px",
                background: AC, color: C.white, borderColor: AC,
                opacity: savingRot ? 0.5 : 1 })}>
              {savingRot ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Rotate modal ─────────────────────────────────────────────────────────────
function RotateModal({ playlist, onRotate, onClose, rotating, result }) {
  const [size,   setSize]   = useState(playlist.rotation_size   || 5);
  const [source, setSource] = useState(playlist.rotation_source || "library");

  const SOURCE_OPTS = [
    { v: "library",  label: "Library",         desc: "Re-runs your rule, pulls fresh library tracks not yet in the playlist" },
    { v: "similar",  label: "Similar Artists", desc: "Finds artists similar to what is in the playlist via Last.fm" },
    { v: "discover", label: "Discover",        desc: "ReccoBeats recommendations seeded from current playlist tracks" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0,
      background: "rgba(22,17,24,0.55)",
      zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ ...card(), width: "460px", maxWidth: "95vw",
        border: `1.5px solid ${C.ink}`,
        boxShadow: "6px 6px 0 rgba(22,17,24,0.18)" }}>

        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: "20px" }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: FONT.display,
              fontSize: "16px", fontWeight: 800, color: C.ink }}>
              Rotate "{playlist.name}"
            </h3>
            <div style={{ fontFamily: FONT.mono, fontSize: "12px",
              color: C.muted, marginTop: "3px" }}>
              Swaps lowest-fitting tracks for fresh ones that match the vibe
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: "none", border: "none", color: C.muted,
              cursor: "pointer", fontSize: "22px", lineHeight: 1 }}>×</button>
        </div>

        {result ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px",
              marginBottom: "16px" }}>
              <span style={{ fontSize: "20px" }}>✓</span>
              <span style={{ fontFamily: FONT.ui, color: AC,
                fontWeight: 700, fontSize: "15px" }}>
                Rotated {result.rotated} tracks
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr",
              gap: "16px", marginBottom: "16px" }}>
              <div>
                <div style={{ fontFamily: FONT.mono, fontSize: "11px", color: C.red,
                  fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px",
                  marginBottom: "8px" }}>Removed</div>
                {result.removed.map((n, i) => (
                  <div key={i} style={{ fontFamily: FONT.ui, fontSize: "12px",
                    color: C.sub, marginBottom: "5px" }}>
                    <span style={{ color: C.red }}>− </span>{n}
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontFamily: FONT.mono, fontSize: "11px", color: AC,
                  fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px",
                  marginBottom: "8px" }}>Added</div>
                {result.added.map((n, i) => (
                  <div key={i} style={{ fontFamily: FONT.ui, fontSize: "12px",
                    color: C.sub, marginBottom: "5px" }}>
                    <span style={{ color: AC }}>+ </span>{n}
                  </div>
                ))}
              </div>
            </div>
            <button onClick={onClose} style={{ ...btn("ghost"), width: "100%" }}>Done</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between",
                marginBottom: "8px" }}>
                <label style={{ fontFamily: FONT.mono, fontSize: "11px", color: C.label,
                  fontWeight: 600, textTransform: "uppercase",
                  letterSpacing: "1px" }}>Swap out</label>
                <span style={{ fontFamily: FONT.display, fontSize: "14px",
                  fontWeight: 800, color: C.ink }}>{size} tracks</span>
              </div>
              <input type="range" min={2} max={15} step={1} value={size}
                onChange={e => setSize(parseInt(e.target.value))}
                style={{ width: "100%", accentColor: AC }} />
              <div style={{ display: "flex", justifyContent: "space-between",
                fontFamily: FONT.mono, fontSize: "10px", color: C.label,
                marginTop: "3px" }}>
                <span>2</span><span>15</span>
              </div>
            </div>

            <div>
              <label style={{ fontFamily: FONT.mono, fontSize: "11px", color: C.label,
                fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px",
                display: "block", marginBottom: "10px" }}>Pull replacements from</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {SOURCE_OPTS.map(o => (
                  <button key={o.v} onClick={() => setSource(o.v)} style={{
                    background: source === o.v ? AW : C.card2,
                    border: `1.5px solid ${source === o.v ? AC : C.border2}`,
                    borderRadius: "4px", padding: "10px 14px",
                    cursor: "pointer", textAlign: "left", transition: "all 0.12s",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{
                        width: "12px", height: "12px", borderRadius: "2px",
                        border: `2px solid ${source === o.v ? AC : C.border2}`,
                        background: source === o.v ? AC : "transparent", flexShrink: 0,
                      }} />
                      <div>
                        <div style={{ fontFamily: FONT.ui, fontSize: "13px",
                          fontWeight: 700,
                          color: source === o.v ? AC : C.ink }}>{o.label}</div>
                        <div style={{ fontFamily: FONT.mono, fontSize: "11px",
                          color: C.muted, marginTop: "1px" }}>{o.desc}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={onClose} style={btn("ghost", { flex: 1 })}>Cancel</button>
              <button onClick={() => onRotate(size, source)} disabled={rotating}
                style={btn("primary", { flex: 2,
                  background: AC, color: C.white, borderColor: AC,
                  opacity: rotating ? 0.5 : 1 })}>
                {rotating ? "Rotating..." : `↻ Rotate ${size} tracks`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Playlists({ embedded = false }) {
  const isMobile = useMediaQuery(MOBILE_Q);
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

  // Swipe-to-build
  const [curateTarget, setCurateTarget] = useState(25);
  const [curating,     setCurating]     = useState(false);
  const [curateCards,  setCurateCards]  = useState(null);
  const [chosen,       setChosen]       = useState([]);
  const [creating,     setCreating]     = useState(false);

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
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(`${API}/playlists/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conditions: conds, excludes: excls,
          sort_by: sortBy, sort_order: sortOrder, limit }),
        signal: ctrl.signal,
      });
      const d = await r.json();
      if (d.error) { alert(d.error); return; }
      setTracks(d.tracks || []);
      setStats(d.stats || null);
    } catch (e) {
      console.error(e);
      if (e.name === "AbortError") {
        alert("Preview timed out. Check that the backend is running on " + API);
      } else {
        alert("Preview failed: " + e.message + "\nIs the backend running at " + API + "?");
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [conditions, excludes, sortBy, sortOrder, limit]);

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
        spotify_mode:     form.mode,
        playlist_name:     form.mode === "new" ? form.playlist_name : null,
        playlist_id:       form.mode === "existing" ? form.playlist_id : null,
        rotation_enabled:  form.mode !== "none" && form.rotation_enabled,
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
      if (d.sync_error) alert(`Rule saved, but Spotify sync failed: ${d.sync_error}`);
      setShowSave(false);
      setEditTarget(null);
      setTab("builder");
      alert("Playlist saved and synced to Spotify ✓");
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
      else { loadSaved(); alert(`✓ ${d.message || "Synced"} (${d.synced} tracks)`); }
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
    const r = await fetch(`${API}/playlists/${id}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    if (d.error) alert(d.error);
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
  // ── Swipe-to-build ─────────────────────────────────────────────────────────
  const startCurate = async () => {
    setCurating(true); setCurateCards(null); setChosen([]);
    try {
      const r = await fetch(`${API}/playlists/curate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conditions, excludes, target: Number(curateTarget) || 25 }),
      });
      const d = await r.json();
      setCurateCards((d.tracks || []).map((t) => ({
        key: t.id, id: t.id, title: t.name, sub: t.artist,
        meta: `${t.fit != null ? Math.round(t.fit * 100) + "% fit" : ""}${t.album ? " · " + t.album : ""}`,
      })));
    } catch {
      setCurateCards([]);
    }
  };

  const createFromChosen = async () => {
    if (!chosen.length) return;
    const name = prompt("Name your playlist:", "Fidolio Curated");
    if (!name) return;
    setCreating(true);
    try {
      const r = await fetch(`${API}/playlists/from-tracks`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, track_ids: chosen }),
      });
      const d = await r.json();
      if (d.success) { alert(`✓ Created "${name}" with ${d.track_count} songs on Spotify.`); setCurating(false); }
      else alert("Couldn't create: " + (d.error || "unknown error"));
    } catch (e) { alert("Failed: " + e.message); }
    setCreating(false);
  };

  const displayed = (tracks || []).filter(t =>
    !searchQ ||
    t.name.toLowerCase().includes(searchQ.toLowerCase()) ||
    t.artist.toLowerCase().includes(searchQ.toLowerCase())
  );

  // Hero tab toggle style (white-outline, for the saturated ultraviolet band)
  const heroTab = (active) => ({
    padding: "8px 15px", borderRadius: "3px", fontFamily: FONT.ui,
    fontSize: "12px", fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.05em", cursor: "pointer",
    border: "1.5px solid rgba(255,255,255,0.8)", transition: "all 0.15s",
    background: active ? "rgba(255,255,255,0.95)" : "transparent",
    color: active ? AC : C.white,
  });

  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>

      {/* ── Ultraviolet hero masthead ───────────────────────────────────────── */}
      {!embedded && (
        <div style={{ background: AC, position: "relative", overflow: "hidden" }}>
          <div style={{ maxWidth: 1080, margin: "0 auto",
            padding: "54px 24px 70px", position: "relative" }}>
            {/* Kicker row */}
            <div style={{ display: "flex", alignItems: "center", gap: 10,
              marginBottom: 18 }}>
              <span style={{ width: 15, height: 15, background: C.white,
                flexShrink: 0 }} />
              <div style={{ fontFamily: FONT.mono, fontSize: "11px", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "1.5px",
                color: C.white }}>
                N&#xBA; 05 · Playlists
              </div>
              <div style={{ flex: 1, height: 1,
                background: "rgba(255,255,255,0.45)", minWidth: 20 }} />
            </div>
            {/* Headline + tab toggles */}
            <div style={{ display: "flex", alignItems: "flex-end",
              justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
              <h1 style={{ ...TYPE.hero, color: C.white, margin: 0 }}>
                Smart Playlists
              </h1>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={heroTab(tab === "builder")}
                  onClick={() => setTab("builder")}>Builder</button>
                <button style={heroTab(tab === "saved")}
                  onClick={() => setTab("saved")}>Saved</button>
              </div>
            </div>
            <p style={{ fontFamily: FONT.body, fontSize: "15px", lineHeight: 1.55,
              color: "rgba(255,255,255,0.88)", marginTop: 18, maxWidth: 560 }}>
              Build rule-based playlists from your library. Auto-sync and rotate them.
            </p>
          </div>
        </div>
      )}

      <div style={embedded
        ? { width: "100%" }
        : { maxWidth: "1080px", margin: "0 auto", padding: "36px 24px 100px" }}>

        {/* Embedded-mode header (no hero band) */}
        {embedded && (
          <div style={{ display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: "20px",
            flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h1 style={{ margin: 0, fontFamily: FONT.display,
                fontSize: "22px", fontWeight: 800, color: C.ink }}>Smart Playlists</h1>
              <p style={{ margin: "4px 0 0", fontFamily: FONT.body,
                color: C.sub, fontSize: "13px" }}>
                Build rule-based playlists from your library. Auto-sync and rotate them.
              </p>
            </div>
          </div>
        )}

        {/* Tab switcher (compact, below-hero version for non-embedded) */}
        {!embedded && (
          <div style={{ display: "inline-flex", gap: 4, padding: 4,
            background: "transparent",
            border: `1.5px solid ${C.ink}`, borderRadius: "4px",
            marginBottom: "28px" }}>
            <button onClick={() => setTab("builder")}
              style={pill(tab === "builder",
                { fontFamily: FONT.ui, fontSize: "12.5px" })}>
              Builder
            </button>
            <button onClick={() => setTab("saved")}
              style={pill(tab === "saved",
                { fontFamily: FONT.ui, fontSize: "12.5px" })}>
              Saved
            </button>
          </div>
        )}

        {/* ── BUILDER TAB ────────────────────────────────────────────────────── */}
        {tab === "builder" && (
          <div style={{ display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "340px 1fr",
            gap: "16px", alignItems: "start" }}>

            {/* Left: rule builder */}
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

              {/* Conditions */}
              <div style={{ ...card(), border: `1.5px solid ${C.ink}` }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "center", marginBottom: "10px" }}>
                  <div style={{ fontFamily: FONT.mono, fontSize: "11px",
                    color: C.label, fontWeight: 600,
                    textTransform: "uppercase", letterSpacing: "1px" }}>
                    Conditions
                  </div>
                  {conditions.length > 0 && (
                    <button onClick={() => setConditions([])}
                      style={{ background: "none", border: "none", cursor: "pointer",
                        fontFamily: FONT.mono, fontSize: "11px", color: C.muted }}>
                      clear all
                    </button>
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
                    ...btn("ghost", { fontSize: "12px", padding: "6px 14px",
                      width: "100%" }) }}>
                  + Add condition
                </button>
              </div>

              {/* Excludes */}
              <div style={{ ...card(), border: `1.5px solid ${C.ink}` }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "center", marginBottom: "10px" }}>
                  <div style={{ fontFamily: FONT.mono, fontSize: "11px",
                    color: C.red, fontWeight: 600,
                    textTransform: "uppercase", letterSpacing: "1px" }}>
                    Exclude
                  </div>
                  {excludes.length > 0 && (
                    <button onClick={() => setExcludes([])}
                      style={{ background: "none", border: "none", cursor: "pointer",
                        fontFamily: FONT.mono, fontSize: "11px", color: C.muted }}>
                      clear
                    </button>
                  )}
                </div>
                {excludes.length === 0 && (
                  <p style={{ margin: "0 0 8px", fontFamily: FONT.body,
                    fontSize: "12px", color: C.muted }}>
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
                    ...btn("danger", { fontSize: "12px", padding: "6px 14px",
                      width: "100%" }) }}>
                  + Add exclusion
                </button>
              </div>

              {/* Sort + limit */}
              <div style={{ ...card(), border: `1.5px solid ${C.ink}` }}>
                <div style={{ fontFamily: FONT.mono, fontSize: "11px", color: C.label,
                  fontWeight: 600, textTransform: "uppercase",
                  letterSpacing: "1px", marginBottom: "10px" }}>
                  Sort & Limit
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                    style={{ ...input(), flex: 1, minWidth: "130px" }}>
                    <option value="cohesion">Best fit (cohesion)</option>
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
                  fontSize: "14px",
                  background: AC, color: C.white, borderColor: AC,
                  opacity: loading ? 0.6 : 1 })}>
                {loading ? "Searching..." : "Preview →"}
              </button>
            </div>

            {/* Right: results */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {tracks === null && (
                <div style={{ ...card(), textAlign: "center", padding: "48px",
                  border: `1.5px solid ${C.border2}` }}>
                  <div style={{ fontFamily: FONT.display, fontSize: "32px",
                    marginBottom: "10px", color: C.faint }}>♪</div>
                  <div style={{ fontFamily: FONT.ui, fontSize: "14px", color: C.ink }}>
                    Set conditions and hit <strong>Preview</strong>
                  </div>
                  <div style={{ fontFamily: FONT.body, fontSize: "12px",
                    color: C.sub, marginTop: "6px" }}>
                    Filter by mood, energy, BPM, language, decade, and more.
                  </div>
                </div>
              )}

              {tracks !== null && (
                <>
                  {/* Stats bar */}
                  {stats && (
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap",
                      padding: "12px 16px", background: C.card,
                      borderRadius: "4px",
                      border: `1.5px solid ${C.border2}` }}>
                      <span style={{ fontFamily: FONT.display, fontSize: "13px",
                        fontWeight: 700, color: C.ink }}>
                        {stats.count} tracks
                      </span>
                      {stats.avg_tempo && (
                        <span style={{ fontFamily: FONT.mono, fontSize: "12px",
                          color: C.sub }}>
                          {Math.round(stats.avg_tempo)} avg BPM
                        </span>
                      )}
                      {stats.avg_energy != null && (
                        <span style={{ fontFamily: FONT.mono, fontSize: "12px",
                          color: C.sub }}>
                          {Math.round(stats.avg_energy * 100)}% energy
                        </span>
                      )}
                      <span style={{ fontFamily: FONT.mono, fontSize: "12px",
                        color: AC }}>
                        {stats.happy_pct}% happy
                      </span>
                      <span style={{ fontFamily: FONT.mono, fontSize: "12px",
                        color: C.indigo }}>
                        {stats.dark_pct}% dark
                      </span>
                      <span style={{ fontFamily: FONT.mono, fontSize: "12px",
                        color: C.sub }}>
                        {stats.unique_artists} artists
                      </span>
                      {stats.languages && Object.entries(stats.languages)
                        .filter(([l]) => l !== "english")
                        .map(([l, n]) => (
                          <span key={l} style={{ fontFamily: FONT.mono,
                            fontSize: "12px", color: C.brown }}>
                            {n} {l}
                          </span>
                        ))}
                    </div>
                  )}

                  {/* Search within results */}
                  <div style={{ display: "flex", gap: "10px",
                    alignItems: "center", flexWrap: "wrap" }}>
                    <input value={searchQ} placeholder="Search within results..."
                      onChange={e => setSearchQ(e.target.value)}
                      style={{ ...input(), flex: 1, minWidth: "150px" }} />
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}
                      title="How many songs you want — you'll be shown 1.25× to swipe through">
                      <input type="number" min="5" max="100" value={curateTarget}
                        onChange={e => setCurateTarget(e.target.value)}
                        style={{ ...input(), width: "62px", textAlign: "center" }} />
                      <button onClick={startCurate} disabled={!tracks?.length}
                        style={btn("ghost", { whiteSpace: "nowrap",
                          opacity: tracks?.length ? 1 : 0.5 })}>
                        Curate by swipe
                      </button>
                    </div>
                    <button onClick={() => setShowSave(true)}
                      style={btn("primary", { whiteSpace: "nowrap",
                        background: AC, color: C.white, borderColor: AC })}>
                      Save as Playlist →
                    </button>
                  </div>

                  {/* Track list */}
                  <div style={{ ...card(), padding: "8px",
                    border: `1.5px solid ${C.border2}` }}>
                    {displayed.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "32px",
                        fontFamily: FONT.body, color: C.muted, fontSize: "13px" }}>
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
            <div style={{ ...card(), background: AW,
              border: `1.5px solid ${AC}` }}>
              <div style={{ display: "flex", justifyContent: "space-between",
                alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
                <div>
                  <div style={{ fontFamily: FONT.display, fontSize: "14px",
                    fontWeight: 700, color: C.ink, marginBottom: "4px" }}>
                    Language Detection
                  </div>
                  <div style={{ fontFamily: FONT.body, fontSize: "12px", color: C.sub }}>
                    Detects Bengali, Hindi, Arabic and more in your library.
                    Run setup once, then enrich for romanized tracks.
                  </div>
                  {languages.length > 0 && (
                    <div style={{ display: "flex", gap: "6px", marginTop: "8px",
                      flexWrap: "wrap" }}>
                      {languages.filter(l => l.language !== "english").map(l => (
                        <span key={l.language}
                          style={{ fontFamily: FONT.mono, fontSize: "11px",
                            color: C.brown, background: C.amberBg,
                            padding: "2px 8px", borderRadius: "3px",
                            border: `1px solid ${C.amber}55` }}>
                          {l.count} {l.language}
                        </span>
                      ))}
                    </div>
                  )}
                  {(setupMsg || enrichMsg) && (
                    <div style={{ fontFamily: FONT.mono, fontSize: "12px",
                      color: AC, marginTop: "8px" }}>
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
              <div style={{ textAlign: "center", padding: "40px",
                fontFamily: FONT.body, color: C.muted }}>
                Loading...
              </div>
            ) : saved.length === 0 ? (
              <div style={{ ...card(), textAlign: "center", padding: "48px",
                border: `1.5px solid ${C.border2}` }}>
                <div style={{ fontFamily: FONT.display, fontSize: "28px",
                  marginBottom: "10px", color: C.faint }}>♪</div>
                <div style={{ fontFamily: FONT.ui, fontSize: "14px",
                  color: C.ink }}>No saved playlists yet</div>
                <div style={{ fontFamily: FONT.body, fontSize: "12px",
                  color: C.sub, marginTop: "6px" }}>
                  Build one in the Builder tab
                </div>
                <button onClick={() => setTab("builder")}
                  style={{ ...btn("primary",
                    { background: AC, color: C.white, borderColor: AC }),
                    marginTop: "16px" }}>
                  Open Builder
                </button>
              </div>
            ) : (
              saved.map(pl => (
                <SavedCard key={pl.id} pl={pl}
                  syncing={syncing}
                  rotating={rotateTarget?.id === pl.id && rotating ? pl.id : null}
                  onSync={handleSync}
                  onRotate={(p) => { setRotateTarget(p); setRotateResult(null); }}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                  onSaved={loadSaved} />
              ))
            )}
          </div>
        )}

        {/* ── Modals ────────────────────────────────────────────────────────── */}
        {curating && (
          <div style={{ position: "fixed", inset: 0,
            background: C.bg, zIndex: 300,
            display: "flex", flexDirection: "column",
            padding: "24px 20px 28px",
            borderTop: `4px solid ${AC}` }}>
            <div style={{ display: "flex", justifyContent: "space-between",
              alignItems: "center", maxWidth: "480px", width: "100%",
              margin: "0 auto 10px" }}>
              <div>
                <div style={{ fontFamily: FONT.display, fontSize: "18px",
                  fontWeight: 800, color: C.ink }}>Curate by swipe</div>
                <div style={{ fontFamily: FONT.mono, fontSize: "12px",
                  color: C.sub, marginTop: "2px" }}>
                  <span style={{ color: AC, fontWeight: 700 }}>{chosen.length}</span>
                  {" "}of {curateTarget} chosen · best-fitting first
                </div>
              </div>
              <button onClick={() => setCurating(false)}
                style={{ background: "none", border: "none", color: C.muted,
                  fontSize: "22px", cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ flex: 1, display: "flex",
              alignItems: "center", justifyContent: "center" }}>
              {curateCards === null
                ? <div style={{ fontFamily: FONT.body, color: C.sub,
                    fontSize: "14px" }}>Finding the songs that fit best…</div>
                : curateCards.length === 0
                  ? <div style={{ fontFamily: FONT.body, color: C.sub,
                      fontSize: "14px", textAlign: "center" }}>
                      No tracks match this rule.<br />Loosen your conditions and try again.
                    </div>
                  : <SwipeDeck cards={curateCards}
                      onKeep={(c) => setChosen((p) => (p.includes(c.id) ? p : [...p, c.id]))}
                      onRemove={() => {}} />}
            </div>
            <div style={{ maxWidth: "480px", width: "100%", margin: "0 auto" }}>
              <button onClick={createFromChosen}
                disabled={!chosen.length || creating}
                style={btn("primary", {
                  width: "100%", padding: "13px",
                  background: AC, color: C.white, borderColor: AC,
                  opacity: (chosen.length && !creating) ? 1 : 0.5 })}>
                {creating ? "Creating…"
                  : `Create playlist (${chosen.length} song${chosen.length === 1 ? "" : "s"})`}
              </button>
            </div>
          </div>
        )}

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
    </div>
  );
}
