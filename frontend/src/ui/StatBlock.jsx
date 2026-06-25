import { C, TYPE } from "../theme";
import CountUp from "./CountUp";
import InfoTip from "./InfoTip";

// Big editorial stat: a bold ink top rule, oversized display number, mono label.
// Numeric values count up; string values render as-is. `info` adds an ⓘ explainer.
export default function StatBlock({
  value,
  label,
  accent = C.ink,
  sub,
  animate = true,
  format,
  valueStyle,
  info,
}) {
  const numeric = typeof value === "number" && isFinite(value);
  return (
    <div style={{ borderTop: `2px solid ${C.ink}`, paddingTop: 14, minWidth: 0 }}>
      <div style={{ ...TYPE.stat, color: accent, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...valueStyle }}>
        {numeric && animate ? (
          <CountUp value={value} format={format} />
        ) : (
          value ?? "—"
        )}
      </div>
      <div style={{ ...TYPE.micro, marginTop: 10, display: "flex", alignItems: "center", gap: 7 }}>
        {label}
        {info && <InfoTip title={label}>{info}</InfoTip>}
      </div>
      {sub && (
        <div style={{ ...TYPE.body, fontSize: 12, marginTop: 6 }}>{sub}</div>
      )}
    </div>
  );
}
