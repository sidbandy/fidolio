import { useState } from "react";
import { C, FONT, moodColor, moodKey } from "../theme";
import CoverThumb from "../components/CoverThumb";

// Editorial micro-tag: mono, uppercase, ink outline (or solid for emphasis). No pills.
export function Badge({ children, color = C.ink, solid = false }) {
  return (
    <span
      style={{
        fontFamily: FONT.mono,
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        whiteSpace: "nowrap",
        padding: "2px 6px",
        borderRadius: 3,
        color: solid ? "#fff" : color,
        background: solid ? color : "transparent",
        border: `1px solid ${solid ? color : C.border2}`,
      }}
    >
      {children}
    </span>
  );
}

// Clickable mood chip → a popover explaining WHY this track earned the mood,
// from its real feature values. No filler — the numbers are the insight.
function MoodBadge({ mood, track, color }) {
  const [open, setOpen] = useState(false);
  const pct = (x) => (x != null ? `${Math.round(x * 100)}%` : "—");
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.ink, background: "transparent", padding: "2px 7px", borderRadius: 3, whiteSpace: "nowrap", border: `1px solid ${C.border2}`, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}
      >
        <span style={{ color, fontSize: 12, lineHeight: 1 }}>●</span>{mood}
      </button>
      {open && (
        <>
          <div onClick={(e) => { e.stopPropagation(); setOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 1199 }} />
          <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 1200, width: 212, background: C.card, border: `1.5px solid ${C.ink}`, borderRadius: 6, padding: "11px 13px", boxShadow: "3px 3px 0 rgba(22,17,24,0.18)", textAlign: "left" }}>
            <div style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase", color, marginBottom: 7 }}>{mood} — why</div>
            <div style={{ fontFamily: FONT.body, fontSize: 11.5, color: C.sub, lineHeight: 1.7 }}>
              Mood <b style={{ color: C.ink }}>{pct(track.valence)}</b> · Energy <b style={{ color: C.ink }}>{pct(track.energy)}</b><br />
              {track.tempo ? <>Tempo <b style={{ color: C.ink }}>{Math.round(track.tempo)} BPM</b> · </> : null}
              Acoustic <b style={{ color: C.ink }}>{pct(track.acousticness)}</b> · Dance <b style={{ color: C.ink }}>{pct(track.danceability)}</b>
            </div>
          </div>
        </>
      )}
    </span>
  );
}

// The most-repeated element in the app. Editorial ranked variant.
// Keeps the usePreview contract: onPlay(track.id, track.name, track.artist).
// `note` is an optional accent badge (e.g. "92% match", "NEW") for contexts like
// the discovery studio — shown ahead of the metadata badges.
export default function TrackRow({ track, playing, onPlay, rank, note }) {
  const isPlaying = playing === track.id;
  const mc = moodColor(track.valence);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 5,
        background: isPlaying ? C.accentWash : "transparent",
        border: `1px solid ${isPlaying ? C.accent : "transparent"}`,
        transition: "all 0.15s",
      }}
    >
      {rank != null && (
        <span
          style={{
            fontFamily: FONT.display,
            fontSize: 16,
            fontWeight: 700,
            color: isPlaying ? C.ink : C.faint,
            width: 26,
            textAlign: "right",
            flexShrink: 0,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {String(rank).padStart(2, "0")}
        </span>
      )}

      <CoverThumb
        album={track.album}
        artist={track.artist}
        size={42}
        playing={isPlaying}
        onClick={() => onPlay(track.id, track.name, track.artist, track)}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: FONT.ui,
            fontSize: 14,
            fontWeight: 600,
            color: C.ink,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {track.name}
        </div>
        <div
          style={{
            fontFamily: FONT.ui,
            fontSize: 12,
            color: C.sub,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {track.artist}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          flexShrink: 0,
          flexWrap: "wrap",
          justifyContent: "flex-end",
          alignItems: "center",
        }}
      >
        {note && (
          <span style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.accentInk, background: C.accent, padding: "2px 6px", borderRadius: 3, whiteSpace: "nowrap" }}>{note}</span>
        )}
        {track.release_year && <Badge>{track.release_year}</Badge>}
        {track.energy != null && <Badge>E {Math.round(track.energy * 100)}%</Badge>}
        {track.moods?.length
          ? track.moods.slice(0, 2).map((m) => <MoodBadge key={m} mood={m} track={track} color={mc} />)
          : track.valence != null && (
            <span style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.ink, border: `1px solid ${C.border2}`, padding: "2px 7px", borderRadius: 3, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ color: mc, fontSize: 12, lineHeight: 1 }}>●</span>{moodKey(track.valence)}
            </span>
          )}
        {track.language && track.language !== "english" && (
          <Badge>{track.language}</Badge>
        )}
        {track.spotify_url && (
          <a
            href={track.spotify_url}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 14, color: C.ink, textDecoration: "none", fontWeight: 700 }}
          >
            ↗
          </a>
        )}
      </div>
    </div>
  );
}
