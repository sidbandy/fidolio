import { useState } from "react";
import { C, FONT, SECTION, PAGE_BG } from "../theme";
import Masthead from "../ui/Masthead";
import Playlists from "./Playlists";
import CollabPage from "./Collab";

const AC = SECTION[5].color;  // royal purple — the Playlists department color
const AW = SECTION[5].wash;
const AON = SECTION[5].on;

// Section 05 — Smart Playlists + Collab rooms, under one roof.
export default function Studio() {
  const [mode, setMode] = useState("smart");
  const tag = (active) => ({
    padding: "8px 15px", borderRadius: 4, fontFamily: FONT.ui, fontSize: 12, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.05em", cursor: "pointer",
    border: `1px solid ${active ? AC : C.border2}`, transition: "all 0.15s",
    background: active ? AC : "transparent", color: active ? AON : C.ink,
  });
  return (
    <div style={{ background: PAGE_BG, minHeight: "100vh", "--accent": AC, "--accent-ink": AON, "--accent-wash": AW }}>
      <Masthead
        no="05" section="Playlists" title="Playlists"
        actions={<>
          <button style={tag(mode === "smart")} onClick={() => setMode("smart")}>Smart Playlists</button>
          <button style={tag(mode === "collab")} onClick={() => setMode("collab")}>Collab Rooms</button>
        </>}
        lede="Make niche playlists or create a collab room with friends"
      />
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "30px 24px 64px" }}>
        {mode === "smart" ? <Playlists embedded /> : <CollabPage embedded />}
      </div>
    </div>
  );
}
