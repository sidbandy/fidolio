import { btn } from "../theme";

export default function Button({ variant = "primary", style, children, ...rest }) {
  return (
    <button style={btn(variant, style)} {...rest}>
      {children}
    </button>
  );
}
