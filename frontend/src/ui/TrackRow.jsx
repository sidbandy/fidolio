import { C, FONT, moodColor, moodKey } from "../theme";

export function Badge({ children, color = C.muted }) {
  return (
    <span
      style={{
        fontSize: 11,
        color,
        background: "#151515",
        padding: "3px 8px",
        borderRadius: 10,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

// The most-repeated element in the app. Editorial ranked variant.
// Keeps the usePreview contract: onPlay(track.id, track.name, track.artist).
export default function TrackRow({ track, playing, onPlay, rank }) {
  const isPlaying = playing === track.id;
  const mc = moodColor(track.valence);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 10,
        background: isPlaying ? C.greenBg : "transparent",
        border: `1px solid ${isPlaying ? C.greenBd : "transparent"}`,
        transition: "all 0.15s",
      }}
    >
      {rank != null && (
        <span
          style={{
            fontFamily: FONT.display,
            fontSize: 15,
            fontWeight: 700,
            color: isPlaying ? C.green : C.faint,
            width: 26,
            textAlign: "right",
            flexShrink: 0,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {String(rank).padStart(2, "0")}
        </span>
      )}

      <button
        onClick={() => onPlay(track.id, track.name, track.artist)}
        aria-label={isPlaying ? "Stop preview" : "Play preview"}
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "none",
          cursor: "pointer",
          flexShrink: 0,
          fontSize: 11,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isPlaying ? C.green : "#1a1a1a",
          color: isPlaying ? "#000" : C.muted,
        }}
      >
        {isPlaying ? "■" : "▶"}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#fff",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {track.name}
        </div>
        <div
          style={{
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
        {track.release_year && <Badge>{track.release_year}</Badge>}
        {track.energy != null && <Badge>E {Math.round(track.energy * 100)}%</Badge>}
        {track.valence != null && (
          <Badge color={mc}>● {moodKey(track.valence)}</Badge>
        )}
        {track.language && track.language !== "english" && (
          <Badge>{track.language}</Badge>
        )}
        {track.spotify_url && (
          <a
            href={track.spotify_url}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12, color: C.green, textDecoration: "none" }}
          >
            ↗
          </a>
        )}
      </div>
    </div>
  );
}
