import { useEffect, useRef } from "react";
import { C, moodColor } from "../theme";

// Clean LINE waveform — no dots. Idle: a still, song-specific signature line
// (shaped by the track's features). Playing: a live oscilloscope from the real
// audio (time-domain) — a single glowing line that ripples with the music.
// Themed via tokens (reskin-ready). Perf: idle draws one frame; only the active
// track animates.
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
  size = 44, width, height, active = false, analyser = null,
  features = null, seed = "x", valence = null, glow = true,
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const W = width || size;
  const H = height || size;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const f = features || {};
    const energy = clamp01(f.energy ?? 0.5);
    const color = valence != null ? moodColor(valence) : C.green;
    const mid = H / 2;
    const lineW = Math.max(1.5, Math.min(2.6, H * 0.05));

    // Idle signature: a fixed amplitude profile from the seed, scaled by energy.
    const rand = makeRng(seed + "|" + Math.round(energy * 100));
    const N = Math.max(20, Math.floor(W / 4));
    const prof = [];
    for (let i = 0; i <= N; i++) prof.push(0.25 + 0.75 * rand());
    const td = active && analyser ? new Uint8Array(analyser.fftSize) : null;

    const drawLine = (pts) => {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) (i === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, pts[i][0], pts[i][1]);
      ctx.stroke();
    };

    const render = (tms) => {
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = lineW;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.strokeStyle = color;
      if (glow) { ctx.shadowColor = color; ctx.shadowBlur = active ? 9 : 4; }

      const pts = [];
      if (active && analyser && td) {
        analyser.getByteTimeDomainData(td);
        const step = td.length / W;
        for (let x = 0; x <= W; x++) {
          const v = (td[Math.floor(x * step)] - 128) / 128;   // -1..1
          pts.push([x, mid + v * (H * 0.42)]);
        }
      } else {
        // still, song-specific waveform line
        for (let i = 0; i <= N; i++) {
          const x = (i / N) * W;
          const amp = (0.18 + energy * 0.55) * (H * 0.42) * prof[i];
          pts.push([x, mid + Math.sin(i * 0.9) * amp]);
        }
      }
      drawLine(pts);

      // faint mirror underline for a touch of depth
      ctx.globalAlpha = 0.22;
      drawLine(pts.map(([x, y]) => [x, mid - (y - mid)]));
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      if (active) rafRef.current = requestAnimationFrame(render);
    };

    if (active) rafRef.current = requestAnimationFrame(render);
    else render(0);
    return () => cancelAnimationFrame(rafRef.current);
  }, [W, H, active, analyser, features, seed, valence, glow]);

  return <canvas ref={canvasRef} style={{ width: W, height: H, display: "block" }} />;
}
