import { C } from "../theme";

export default function Card({ children, style, tint, ...rest }) {
  return (
    <div
      style={{
        background: tint || C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: "20px 22px",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
