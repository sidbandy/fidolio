import { forwardRef } from "react";
import { input } from "../theme";

const Input = forwardRef(function Input({ style, ...rest }, ref) {
  return <input ref={ref} style={input(style)} {...rest} />;
});

export default Input;
