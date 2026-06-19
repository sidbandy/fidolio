import { C, TYPE } from "../theme";

export default function EmptyState({ title, hint, icon }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted }}>
      {icon && <div style={{ fontSize: 28, marginBottom: 12 }}>{icon}</div>}
      <div style={{ ...TYPE.section, color: C.sub }}>{title}</div>
      {hint && (
        <p
          style={{
            ...TYPE.body,
            marginTop: 8,
            maxWidth: 400,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
