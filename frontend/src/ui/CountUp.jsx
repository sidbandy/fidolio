import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

// Animated number that counts up when scrolled into view.
// Static (no animation) under prefers-reduced-motion.
export default function CountUp({
  value,
  format = (n) => Math.round(n).toLocaleString(),
  duration = 1.1,
  style,
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);

  useEffect(() => {
    if (!inView || reduce) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [inView, value, reduce, duration]);

  return <span ref={ref} style={style}>{format(display)}</span>;
}
