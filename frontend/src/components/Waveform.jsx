import { useEffect, useRef } from "react";
import { C, moodColor } from "../theme";

// Circular waveform — the "old YouTube intro" ring. A single glowing loop whose
// radius is modulated by the audio: a live oscilloscope wrapped around a circle
// when playing, a still song-signature ring when idle. Themed via tokens
// (reskin-ready). Perf: idle draws one frame; only the active track animates.
function makeRng(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6d2b79f5; let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp01 = (x) => Math.max(0, Math.min(1, x || 0));

export default function Waveform({
  size = 44, active = false, analyser = null,
  features = null, seed = "x", valence = null, glow = true,
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr; canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const f = features || {};
    const energy = clamp01(f.energy ?? 0.5);
    const color = valence != null ? moodColor(valence) : C.green;
    const cx = size / 2, cy = size / 2;
    const baseR = size * 0.30;
    const maxAmp = size * 0.14;
    const lineW = Math.max(1.3, size * 0.035);
    const N = Math.max(56, Math.floor(size * 1.6));   // points around the ring

    const rand = makeRng(seed + "|" + Math.round(energy * 100));
    const prof = [];
    for (let i = 0; i < N; i++) prof.push(rand() - 0.5);
    const td = active && analyser ? new Uint8Array(analyser.fftSize) : null;

    const render = (tms) => {
      ctx.clearRect(0, 0, size, size);
      ctx.lineWidth = lineW;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.strokeStyle = color;
      if (glow) { ctx.shadowColor = color; ctx.shadowBlur = active ? 10 : 5; }

      const spin = active ? tms * 0.0004 : 0;   // slow rotation while playing
      if (active && analyser && td) analyser.getByteTimeDomainData(td);

      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const idx = i % N;
        const ang = (idx / N) * Math.PI * 2 + spin;
        let amp;
        if (active && td) {
          amp = ((td[Math.floor((idx / N) * td.length)] - 128) / 128) * maxAmp;
        } else {
          amp = prof[idx] * 2 * maxAmp * (0.35 + energy * 0.65);
        }
        const r = baseR + amp;
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r;
        (i === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, x, y);
      }
      ctx.closePath();
      ctx.stroke();

      // faint inner guide ring for depth
      ctx.globalAlpha = 0.16;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * 0.66, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      if (active) rafRef.current = requestAnimationFrame(render);
    };

    if (active) rafRef.current = requestAnimationFrame(render);
    else render(0);
    return () => cancelAnimationFrame(rafRef.current);
  }, [size, active, analyser, features, seed, valence, glow]);

  return <canvas ref={canvasRef} style={{ width: size, height: size, display: "block" }} />;
}
