import { useEffect, useRef } from "react";
import { C, moodColor } from "../theme";

// Circular audio visualizer — a glowing ring that genuinely reacts to the music.
// Design notes (what makes it feel professional, not janky):
//  • FREQUENCY data (not raw time-domain) → reliable, musical movement.
//  • The spectrum is MIRRORED around the ring → symmetric, smooth, seamless loop.
//  • Per-point easing + a smoothed overall level → fluid, never jittery.
//  • A tempo-synced "breath" + a gain that lifts quiet songs → it moves even on
//    soft, slow tracks, and faster/louder songs visibly pulse harder.
//  • Rotation speed scales with tempo; hue follows mood (valence). So the motion
//    matches the song sonically.
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
  const smoothRef = useRef(null);   // eased per-point amplitudes (across frames)
  const levelRef = useRef(0);       // eased overall loudness

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr; canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const f = features || {};
    const energy = clamp01(f.energy ?? 0.5);
    const tempo = f.tempo || 110;
    const color = valence != null ? moodColor(valence) : C.green;
    const cx = size / 2, cy = size / 2;
    const baseR = size * 0.27;
    const maxAmp = size * 0.18;
    const lineW = Math.max(1.4, size * 0.04);

    let POINTS = Math.max(64, Math.floor(size * 1.5));
    if (POINTS % 2) POINTS++;
    const HALF = POINTS / 2;

    const rand = makeRng(seed + "|" + Math.round(energy * 100));
    const idle = Array.from({ length: HALF + 1 }, () => 0.35 + 0.65 * rand());
    if (!smoothRef.current || smoothRef.current.length !== POINTS) smoothRef.current = new Float32Array(POINTS);
    const sm = smoothRef.current;

    const freq = active && analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const beatHz = tempo / 60;
    let startT = null;

    const render = (tms) => {
      if (startT === null) startT = tms;
      const t = (tms - startT) / 1000;
      ctx.clearRect(0, 0, size, size);

      // overall loudness → a breathing pulse (so even soft songs visibly move)
      let level = 0;
      if (active && freq) {
        analyser.getByteFrequencyData(freq);
        const lim = Math.floor(freq.length * 0.7);
        let s = 0; for (let i = 0; i < lim; i++) s += freq[i];
        level = s / lim / 255;
      }
      levelRef.current += (level - levelRef.current) * 0.14;
      const lvl = levelRef.current;

      // half-spectrum target, log-spaced so bass/mids read; gain lifts quiet songs
      const gain = 0.55 + energy * 0.5;
      const half = new Float32Array(HALF + 1);
      for (let i = 0; i <= HALF; i++) {
        if (active && freq) {
          const bin = Math.floor(Math.pow(i / HALF, 1.7) * (freq.length * 0.62));
          half[i] = (freq[Math.min(bin, freq.length - 1)] / 255) * gain;
        } else {
          half[i] = (0.12 + energy * 0.16) * idle[i] * (0.7 + 0.3 * Math.sin(t * 1.1 + i * 0.35));
        }
      }
      // mirror around the ring + ease each point toward target (fluid)
      for (let p = 0; p < POINTS; p++) {
        const target = half[p <= HALF ? p : POINTS - p];
        sm[p] += (target - sm[p]) * 0.22;
      }

      const breath = active
        ? lvl * 0.55 + 0.12 * Math.sin(t * beatHz * Math.PI) * (0.4 + energy * 0.6)
        : (0.05 + energy * 0.07) * (0.6 + 0.4 * Math.sin(t * 1.0));
      const rot = t * (active ? 0.18 + tempo / 900 : 0.12);

      ctx.lineWidth = lineW;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.strokeStyle = color;
      if (glow) { ctx.shadowColor = color; ctx.shadowBlur = active ? 12 : 5; }
      ctx.beginPath();
      for (let p = 0; p <= POINTS; p++) {
        const idx = p % POINTS;
        const ang = (idx / POINTS) * Math.PI * 2 + rot;
        const r = baseR + sm[idx] * maxAmp + breath * maxAmp;
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r;
        (p === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, x, y);
      }
      ctx.closePath();
      ctx.stroke();

      ctx.globalAlpha = 0.13;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * 0.6 + breath * maxAmp * 0.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [size, active, analyser, features, seed, valence, glow]);

  return <canvas ref={canvasRef} style={{ width: size, height: size, display: "block" }} />;
}
