import { pill } from "../theme";

export default function Pill({ active, style, children, ...rest }) {
  return (
    <button style={pill(active, style)} {...rest}>
      {children}
    </button>
  );
}
