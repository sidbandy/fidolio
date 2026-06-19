import { useState } from "react";
import { C, MOOD } from "../theme";
import { PageHeader, Pill } from "../ui";
import Playlists from "./Playlists";
import CollabPage from "./Collab";

// Section 05 — Smart Playlists + Collab rooms, under one roof.
export default function Studio() {
  const [mode, setMode] = useState("smart");
  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      <div style={{ background: MOOD.happy.tint, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "52px 24px 36px" }}>
          <PageHeader
            kicker="Nº 05 · Playlists"
            title="Playlists"
            lede="Build rule-based playlists from your library — or start a collab room where everyone adds songs and votes."
            actions={
              <div style={{ display: "flex", gap: 8 }}>
                <Pill active={mode === "smart"} onClick={() => setMode("smart")}>Smart Playlists</Pill>
                <Pill active={mode === "collab"} onClick={() => setMode("collab")}>Collab Rooms</Pill>
              </div>
            }
          />
        </div>
      </div>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 24px 64px" }}>
        {mode === "smart" ? <Playlists embedded /> : <CollabPage embedded />}
      </div>
    </div>
  );
}
