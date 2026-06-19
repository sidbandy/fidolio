import { C, TYPE } from "../theme";
import Reveal from "./Reveal";

// Editorial masthead: kicker label + hero title + lede + optional actions.
export default function PageHeader({ kicker, title, lede, actions, accent = C.green }) {
  return (
    <Reveal>
      <header style={{ marginBottom: 44 }}>
        {kicker && (
          <div style={{ ...TYPE.micro, color: accent, marginBottom: 14 }}>{kicker}</div>
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
          <h1 style={{ ...TYPE.hero, color: "#fff", margin: 0 }}>{title}</h1>
          {actions && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>
          )}
        </div>
        {lede && <p style={{ ...TYPE.body, marginTop: 18, maxWidth: 640 }}>{lede}</p>}
      </header>
    </Reveal>
  );
}
