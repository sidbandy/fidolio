import { C } from "../theme";

// Full-bleed, mood-tinted "chapter" band. Place at page root (not inside a
// max-width wrapper) so the tint spans edge to edge; content stays centered.
export default function ChapterSection({
  tint,
  children,
  style,
  maxWidth = 1100,
  pad = "56px 24px",
}) {
  return (
    <section
      style={{
        background: tint || "transparent",
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        ...style,
      }}
    >
      <div style={{ maxWidth, margin: "0 auto", padding: pad }}>{children}</div>
    </section>
  );
}
