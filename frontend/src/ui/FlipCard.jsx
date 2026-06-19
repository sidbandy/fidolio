// A flashcard that flips on click. Faces are absolutely positioned, so the card
// needs a fixed height. Front/back are full-height nodes (style them as cards).
export default function FlipCard({ flipped, onFlip, front, back, height = 300 }) {
  return (
    <div style={{ perspective: 1200, height }}>
      <div
        onClick={onFlip}
        style={{
          position: "relative", width: "100%", height: "100%",
          transformStyle: "preserve-3d", cursor: "pointer",
          transition: "transform 0.55s cubic-bezier(0.22,1,0.36,1)",
          transform: flipped ? "rotateY(180deg)" : "none",
        }}
      >
        <div style={faceStyle}>{front}</div>
        <div style={{ ...faceStyle, transform: "rotateY(180deg)" }}>{back}</div>
      </div>
    </div>
  );
}

const faceStyle = {
  position: "absolute", inset: 0,
  backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
};
