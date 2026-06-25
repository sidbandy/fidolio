import { useState } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { C, FONT, TYPE } from "../theme";
import { usePreviewContext } from "../context/PreviewProvider";

// Dating-app style triage deck. Drag left = remove (✕), right = keep (♥).
// `cards`: [{ key, id, title, sub, meta }]. onRemove(card) / onKeep(card) fire on decide.
function CardFace({ card, drag }) {
  const { playing, play } = usePreviewContext();
  const isPlaying = playing === card.id;
  const x = drag;
  const removeOp = useTransform(x, [-120, -30], [1, 0]);
  const keepOp = useTransform(x, [30, 120], [0, 1]);
  const tint = useTransform(x, [-160, 0, 160], ["rgba(224,98,60,0.16)", "rgba(255,255,255,0)", "rgba(255,178,61,0.18)"]);
  return (
    <motion.div style={{ position: "absolute", inset: 0, background: C.card, border: `1.5px solid ${C.ink}`, borderRadius: 6, padding: 24, display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "6px 6px 0 rgba(22,17,24,0.18)", overflow: "hidden" }}>
      <motion.div style={{ position: "absolute", inset: 0, background: tint, pointerEvents: "none" }} />
      {/* drag stamps — bold filled stickers */}
      <motion.div style={{ opacity: removeOp, position: "absolute", top: 20, right: 20, color: "#fff", background: C.red, border: `2.5px solid ${C.ink}`, borderRadius: 4, padding: "4px 12px", fontFamily: FONT.display, fontWeight: 800, fontSize: 18, transform: "rotate(11deg)", letterSpacing: "1px" }}>REMOVE</motion.div>
      <motion.div style={{ opacity: keepOp, position: "absolute", top: 20, left: 20, color: C.ink2, background: C.green, border: `2.5px solid ${C.ink2}`, borderRadius: 4, padding: "4px 12px", fontFamily: FONT.display, fontWeight: 800, fontSize: 18, transform: "rotate(-11deg)", letterSpacing: "1px" }}>KEEP</motion.div>

      <div style={{ position: "relative", display: "flex", justifyContent: "center", padding: "8px 0 4px" }}>
        <button onClick={(e) => { e.stopPropagation(); play(card.id, card.title, card.sub); }}
          style={{ width: 72, height: 72, borderRadius: "50%", border: `1.5px solid ${C.ink}`, background: isPlaying ? C.green : "transparent", color: C.ink, cursor: "pointer", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
          {isPlaying ? "■" : "▶"}
        </button>
      </div>

      <div style={{ position: "relative", textAlign: "center" }}>
        <div style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 700, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.title}</div>
        <div style={{ fontFamily: FONT.ui, fontSize: 14, color: C.sub, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.sub}</div>
        {card.meta && <div style={{ ...TYPE.micro, color: C.muted, marginTop: 12 }}>{card.meta}</div>}
      </div>

      <div style={{ ...TYPE.micro, color: C.muted, textAlign: "center" }}>drag ← remove · keep →</div>
    </motion.div>
  );
}

export default function SwipeDeck({ cards, onRemove, onKeep }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(0);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 220], [-16, 16]);
  const top = cards[i];

  const decide = (keep) => {
    const card = cards[i];
    if (!card) return;
    setDir(keep ? 1 : -1);
    (keep ? onKeep : onRemove)?.(card);
    x.set(0);
    setI((n) => n + 1);
  };

  if (!top) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: C.sub }}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>✓</div>
        <div style={{ ...TYPE.section }}>All triaged</div>
        <div style={{ ...TYPE.body, marginTop: 6 }}>You went through every card.</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 380, margin: "0 auto" }}>
      <div style={{ ...TYPE.micro, color: C.muted, textAlign: "center", marginBottom: 16 }}>{i + 1} of {cards.length}</div>
      <div style={{ position: "relative", height: 300 }}>
        {cards[i + 1] && (
          <div style={{ position: "absolute", inset: 0, transform: "scale(0.94) translateY(12px)", opacity: 0.5 }}>
            <div style={{ position: "absolute", inset: 0, background: C.card, border: `1.5px solid ${C.line}`, borderRadius: 6 }} />
          </div>
        )}
        <motion.div
          key={top.key}
          drag="x"
          dragSnapToOrigin
          style={{ x, rotate, position: "absolute", inset: 0, cursor: "grab" }}
          whileTap={{ cursor: "grabbing" }}
          initial={{ x: dir * 480, opacity: 0, rotate: dir * 14 }}
          animate={{ x: 0, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          onDragEnd={(e, info) => {
            if (info.offset.x < -110) decide(false);
            else if (info.offset.x > 110) decide(true);
          }}
        >
          <CardFace card={top} drag={x} />
        </motion.div>
      </div>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 22 }}>
        <button onClick={() => decide(false)} style={{ flex: 1, maxWidth: 160, padding: "12px", borderRadius: 4, border: `1.5px solid ${C.red}`, background: C.redBg, color: C.red, fontFamily: FONT.ui, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>✕ Remove</button>
        <button onClick={() => decide(true)} style={{ flex: 1, maxWidth: 160, padding: "12px", borderRadius: 4, border: `1.5px solid ${C.ink}`, background: C.greenBg, color: C.ink, fontFamily: FONT.ui, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>♥ Keep</button>
      </div>
    </div>
  );
}
