import { C } from "../theme";

export default function Modal({ open, onClose, children, width = 420 }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.card,
          border: `1.5px solid ${C.ink}`,
          borderRadius: 8,
          padding: 24,
          width,
          maxWidth: "100%",
          boxShadow: "6px 6px 0 rgba(22,17,24,0.16)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
