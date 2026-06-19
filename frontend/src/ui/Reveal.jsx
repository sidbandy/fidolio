import { motion, useReducedMotion } from "framer-motion";

// Scroll-reveal wrapper. No-op (renders plain div) under prefers-reduced-motion.
export default function Reveal({ children, delay = 0, y = 18, style, ...rest }) {
  const reduce = useReducedMotion();
  if (reduce) return <div style={style} {...rest}>{children}</div>;
  return (
    <motion.div
      style={style}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
