import { Component } from "react";
import { C, TYPE } from "../theme";

// Catches render crashes in a route so one bad page can't blank the whole app.
// App keys this by pathname, so navigating away clears the error automatically.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("[Fidolio] page crashed:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ maxWidth: 560, margin: "100px auto", padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <div style={{ ...TYPE.title, marginBottom: 10 }}>This page hit a snag</div>
          <p style={{ ...TYPE.body, marginBottom: 18 }}>
            {String(this.state.error?.message || this.state.error)}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ padding: "11px 22px", borderRadius: 4, border: `1.5px solid ${C.ink}`, background: C.green, color: C.ink, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
