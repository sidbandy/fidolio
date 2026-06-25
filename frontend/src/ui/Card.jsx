import { card as cardBase } from "../theme";

// Clean dark card with a glowing accent edge (see theme.card). `tint` overrides the
// background; `style` overrides anything.
export default function Card({ children, style, tint, ...rest }) {
  return (
    <div
      style={{ ...cardBase(), ...(tint ? { background: tint } : {}), ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}
