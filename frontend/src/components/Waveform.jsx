import { useRef, useEffect } from "react";

// Bar visualizer with a glitchy Y2K render layer. Two honest modes:
//
//  • active + analyser — a 30s preview plays IN the browser, so this is REAL FFT.
//    Log-spaced bins (balanced bass→treble), a gain-lift so quiet songs still move,
//    and per-bar smoothing so loud songs don't strobe.
//
//  • otherwise — a Spotify track is playing in the Spotify app, which the browser
//    cannot tap (and Spotify's audio-analysis API is retired). So this is a
//    feature-shaped "spectrum": the SHAPE comes from the track's real audio features
//    (energy / danceability / acousticness → how bass- vs treble-heavy it looks) and
//    the MOTION is a beat that travels across the bars at the track's BPM. It reads as
//    the song's character + groove rather than random unison bouncing.
export default function Waveform({ analyser, features, color = "#BCC2CC", height = 38, active = false, bars = 40 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const N = bars;
    const freq = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    const f = features || {};
    const e = clamp(f.energy ?? 0.5);
    const dance = clamp(f.danceability ?? 0.5);
    const acou = clamp(f.acousticness ?? 0.4);
    const tempo = Math.max(50, Math.min(200, f.tempo ?? 110));

    const rnd = (i) => { const a = Math.sin(i * 12.9898 + 7.13) * 43758.5453; return a - Math.floor(a); };
    const smooth = new Float32Array(N);
    let raf, start = performance.now();

    const resize = () => {
      const w = canvas.clientWidth || 200;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const draw = (now) => {
      const w = canvas.clientWidth || 200;
      const h = height;
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, w, h);

      // Attack/release: bars snap UP on a transient (a hit/beat) and fall back slowly.
      // This asymmetry is what makes a spectrum read as locked to the music.
      const shape = (i, target) => {
        const a = target > smooth[i] ? 0.7 : 0.16; // fast attack, slow release
        smooth[i] += (target - smooth[i]) * a;
      };

      if (active && analyser) {
        analyser.getByteFrequencyData(freq);
        const lo = 2, hi = Math.max(lo + 1, Math.floor(freq.length * 0.80));
        for (let i = 0; i < N; i++) {
          const idx = Math.floor(lo * Math.pow(hi / lo, i / (N - 1)));
          let v = (freq[idx] || 0) / 255;
          v = Math.pow(v, 0.72);                  // a touch more contrast so beats pop
          shape(i, v);
        }
      } else {
        const beats = t * (tempo / 60);
        for (let i = 0; i < N; i++) {
          const fb = i / (N - 1);                 // 0 = bass (left) … 1 = treble (right)
          // spectral envelope from the song's character
          const env = 0.18 + e * 0.34 + dance * (1 - fb) * 0.5 + (1 - acou) * fb * 0.55;
          // a beat pulse that travels across the bars (bass leads, treble trails)
          const phase = beats - fb * 1.4;
          const pulse = Math.pow(Math.max(0, Math.cos((phase - Math.floor(phase)) * Math.PI * 2)), 3) * (0.4 + e * 0.6);
          // per-bar shimmer so neighbours never move identically
          const osc = 0.5 + 0.5 * Math.sin(i * 0.7 + t * (1.4 + e * 3) + rnd(i) * 6.28);
          const target = Math.min(1, env * (0.4 + 0.5 * osc) + pulse * (1 - fb * 0.45));
          shape(i, target);
        }
      }

      // occasional brief glitch (a few short bursts, not constant noise)
      const g = Math.sin(t * 1.7) * Math.sin(t * 0.9 + 1.3) * Math.sin(t * 3.1);
      const glitch = g > 0.82;
      const shear = glitch ? (rnd(Math.floor(t * 20)) - 0.5) * 6 : 0;

      const bw = w / N;
      const paint = (col, dx, alphaMul) => {
        for (let i = 0; i < N; i++) {
          const bh = Math.max(1, smooth[i] * h * 0.92);
          ctx.fillStyle = col;
          ctx.globalAlpha = (0.42 + smooth[i] * 0.58) * alphaMul;
          ctx.fillRect(i * bw + bw * 0.16 + dx, h - bh, bw * 0.68, bh);
        }
      };
      // RGB-split ghosts during a glitch frame (cyan/magenta) under the main bars
      if (glitch) {
        paint("#23E0FF", -2.5 + shear, 0.5);
        paint("#FF2E9C", 2.5 + shear, 0.5);
      }
      paint(color, shear * 0.4, 1);

      // scanlines — thin dark rows, a little stronger during a glitch
      ctx.globalAlpha = glitch ? 0.45 : 0.2;
      ctx.fillStyle = "rgba(0,0,0,1)";
      for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [analyser, active, color, height, bars, features]);

  return <canvas ref={ref} style={{ width: "100%", height, display: "block" }} />;
}

function clamp(x) { return Math.max(0, Math.min(1, x)); }
