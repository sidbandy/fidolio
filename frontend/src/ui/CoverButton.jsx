import { C } from "../theme";

// Album cover that doubles as the play/pause control.
//  • default (e.g. a track row): hover darkens the cover and reveals the icon.
//  • persistent (e.g. the preview dock): cover stays bright, the icon button is always
//    visible (just dimmer) and brightens + glows on hover.
export default function CoverButton({ art, state = "idle", onClick, size, radius = 6, iconScale = 0.34, persistent = false }) {
  const playing = state === "playing";
  return (
    <button
      onClick={onClick}
      aria-label={playing ? "Stop preview" : "Play preview"}
      className={`cover-btn${playing ? " cover-btn--playing" : ""}${persistent ? " cover-btn--persistent" : ""}`}
      style={{
        position: "relative", padding: 0, border: `1px solid ${C.border2}`, borderRadius: radius,
        overflow: "hidden", cursor: "pointer", background: C.card2,
        width: size || "100%", height: size, aspectRatio: size ? undefined : "1 / 1", display: "block",
        boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
      }}
    >
      {art
        ? <img src={art} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        : <div style={{ width: "100%", height: "100%", background: C.card2 }} />}
      <span className="cover-btn__veil">
        <span className="cover-btn__icon" style={{
          width: `${iconScale * 100}%`, maxWidth: 60, minWidth: 22, aspectRatio: "1 / 1",
          fontSize: "clamp(10px, 36%, 22px)", paddingLeft: playing ? 0 : "8%",
        }}>{playing ? "❚❚" : "▶"}</span>
      </span>
    </button>
  );
}
