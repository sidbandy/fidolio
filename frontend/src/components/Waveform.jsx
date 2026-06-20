import { useEffect, useRef } from "react";
import { C, moodColor } from "../theme";

// Circular audio visualizer — the "old YouTube disco" ring: the whole ring PULSES
// on the beat (bass-driven) while frequency peaks spike outward around it.
//  • Bass (low bins) drives a snappy ring expansion → it beats, not just vibrates.
//  • Spectrum peaks (power-curved, mirrored for symmetry) radiate as spikes.
//  • Hue follows mood (valence); rotation + pulse speed follow tempo.
//  • Idle = a still song-signature ring that breathes gently.
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
  features = null, seed = "x", valence = null, glow = true, color: colorProp = null,
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const smoothRef = useRef(null);
  const bassRef = useRef(0);

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
    const color = colorProp || (valence != null ? moodColor(valence) : C.green);
    const cx = size / 2, cy = size / 2;
    const baseR = size * 0.23;          // resting radius (room to pulse + spike)
    const maxAmp = size * 0.24;         // spike height
    const lineW = Math.max(1.4, size * 0.045);

    let POINTS = Math.max(72, Math.floor(size * 1.7));
    if (POINTS % 2) POINTS++;
    const HALF = POINTS / 2;

    const rand = makeRng(seed + "|" + Math.round(energy * 100));
    const idle = Array.from({ length: HALF + 1 }, () => Math.pow(rand(), 1.5));
    if (!smoothRef.current || smoothRef.current.length !== POINTS) smoothRef.current = new Float32Array(POINTS);
    const sm = smoothRef.current;

    const freq = active && analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    let startT = null;

    const render = (tms) => {
      if (startT === null) startT = tms;
      const t = (tms - startT) / 1000;
      ctx.clearRect(0, 0, size, size);

      // bass → beat pulse (the whole ring breathes on the kick)
      let bass = 0;
      const half = new Float32Array(HALF + 1);
      if (active && freq) {
        analyser.getByteFrequencyData(freq);
        let b = 0; for (let i = 0; i < 6; i++) b += freq[i]; bass = b / 6 / 255;
        for (let i = 0; i <= HALF; i++) {
          const bin = Math.floor(Math.pow(i / HALF, 1.5) * (freq.length * 0.62));
          const v = freq[Math.min(bin, freq.length - 1)] / 255;
          half[i] = Math.pow(v, 0.72) * (0.9 + energy * 0.6);   // emphasized peaks
        }
      } else {
        for (let i = 0; i <= HALF; i++) {
          half[i] = idle[i] * (0.45 + energy * 0.55) * (0.75 + 0.25 * Math.sin(t * 1.1 + i * 0.5));
        }
      }
      bassRef.current += (bass - bassRef.current) * 0.3;        // snappy beat
      const pulse = active ? bassRef.current * 0.6 : 0.06 + 0.05 * Math.sin(t * 1.3);
      const effBase = baseR * (1 + pulse);

      // ease each (mirrored) point toward its target — fast enough to feel live
      for (let p = 0; p < POINTS; p++) {
        const target = half[p <= HALF ? p : POINTS - p];
        sm[p] += (target - sm[p]) * (active ? 0.4 : 0.12);
      }

      const rot = t * (active ? 0.2 + tempo / 700 : 0.1);

      ctx.lineWidth = lineW;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.strokeStyle = color;
      if (glow) { ctx.shadowColor = color; ctx.shadowBlur = active ? 11 + bassRef.current * 14 : 5; }
      ctx.beginPath();
      for (let p = 0; p <= POINTS; p++) {
        const idx = p % POINTS;
        const ang = (idx / POINTS) * Math.PI * 2 + rot;
        const r = effBase + sm[idx] * maxAmp;
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r;
        (p === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, x, y);
      }
      ctx.closePath();
      ctx.stroke();

      // bright pulsing core ring
      ctx.globalAlpha = 0.18 + (active ? bassRef.current * 0.3 : 0);
      ctx.beginPath();
      ctx.arc(cx, cy, effBase * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [size, active, analyser, features, seed, valence, glow, colorProp]);

  return <canvas ref={canvasRef} style={{ width: size, height: size, display: "block" }} />;
}
