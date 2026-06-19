import { C, TYPE } from "../theme";
import CountUp from "./CountUp";

// Big editorial stat: hairline top rule, oversized display number, kerned label.
// Numeric values count up; string values render as-is.
export default function StatBlock({
  value,
  label,
  accent = C.green,
  sub,
  animate = true,
  format,
}) {
  const numeric = typeof value === "number" && isFinite(value);
  return (
    <div style={{ borderTop: `1px solid ${C.border2}`, paddingTop: 14 }}>
      <div style={{ ...TYPE.stat, color: accent }}>
        {numeric && animate ? (
          <CountUp value={value} format={format} />
        ) : (
          value ?? "—"
        )}
      </div>
      <div style={{ ...TYPE.micro, marginTop: 10 }}>{label}</div>
      {sub && (
        <div style={{ ...TYPE.body, fontSize: 12, marginTop: 6 }}>{sub}</div>
      )}
    </div>
  );
}
