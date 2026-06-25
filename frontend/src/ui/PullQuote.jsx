import { C, TYPE } from "../theme";

// Editorial pull-quote — used for taste narratives / era descriptions.
export function PullQuote({ children, accent = C.green, cite }) {
  return (
    <blockquote style={{ margin: 0, borderLeft: `4px solid ${accent}`, paddingLeft: 22 }}>
      <p style={{ ...TYPE.quote, margin: 0 }}>{children}</p>
      {cite && <footer style={{ ...TYPE.micro, marginTop: 14 }}>{cite}</footer>}
    </blockquote>
  );
}

export default PullQuote;
