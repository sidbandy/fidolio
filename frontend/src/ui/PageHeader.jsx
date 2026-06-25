import { C, TYPE } from "../theme";
import Reveal from "./Reveal";

// Editorial masthead: an accent-block kicker on a rule, then the hero title.
export default function PageHeader({ kicker, title, lede, actions, accent = C.green }) {
  return (
    <Reveal>
      <header style={{ marginBottom: 44 }}>
        {kicker && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span style={{ width: 15, height: 15, background: accent, flexShrink: 0 }} />
            <div style={{ ...TYPE.micro, color: C.ink }}>{kicker}</div>
            <div style={{ flex: 1, height: 1, background: C.border2, minWidth: 20 }} />
          </div>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <h1 style={{ ...TYPE.hero, margin: 0 }}>{title}</h1>
          {actions && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>
          )}
        </div>
        {lede && <p style={{ ...TYPE.body, marginTop: 18, maxWidth: 640 }}>{lede}</p>}
      </header>
    </Reveal>
  );
}
