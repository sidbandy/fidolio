import { C, FONT, moodColor, moodKey } from "../theme";
import OrbitingWaveform from "../components/OrbitingWaveform";
import { usePreviewContext } from "../context/PreviewProvider";

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
// `note` is an optional accent badge (e.g. "92% match", "NEW") for contexts like
// the discovery studio — shown ahead of the metadata badges.
export default function TrackRow({ track, playing, onPlay, rank, note }) {
  const isPlaying = playing === track.id;
  const mc = moodColor(track.valence);
  const { analyser } = usePreviewContext();

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
          position: "relative",
          width: 46,
          height: 46,
          borderRadius: "50%",
          border: `1px solid ${isPlaying ? "transparent" : C.border}`,
          cursor: "pointer",
          flexShrink: 0,
          padding: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isPlaying ? "rgba(29,185,84,0.08)" : "#101010",
          boxShadow: isPlaying ? `0 0 16px ${mc}55` : "none",
          transform: isPlaying ? "scale(1.04)" : "none",
          transition: "box-shadow 0.2s, transform 0.2s",
        }}
      >
        <OrbitingWaveform
          size={46}
          active={isPlaying}
          analyser={isPlaying ? analyser : null}
          features={track}
          valence={track.valence}
          seed={track.id || track.name || "x"}
        />
        <span
          style={{
            position: "absolute",
            fontSize: 10,
            color: isPlaying ? "#fff" : C.sub,
            textShadow: "0 1px 3px rgba(0,0,0,0.7)",
            pointerEvents: "none",
          }}
        >
          {isPlaying ? "■" : "▶"}
        </span>
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
        {note && <Badge color={C.green}>{note}</Badge>}
        {track.release_year && <Badge>{track.release_year}</Badge>}
        {track.energy != null && <Badge>E {Math.round(track.energy * 100)}%</Badge>}
        {track.moods?.length
          ? track.moods.slice(0, 2).map((m) => <Badge key={m} color={mc}>● {m}</Badge>)
          : track.valence != null && <Badge color={mc}>● {moodKey(track.valence)}</Badge>}
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
