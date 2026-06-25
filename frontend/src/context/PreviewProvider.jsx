import { createContext, useContext, useRef, useState, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const Ctx = createContext(null);

// One shared preview player for the whole app: a single AudioContext + AnalyserNode
// so the waveform (in the play button AND the Now Playing dock) can react to the
// real Deezer preview audio. Deezer sends `access-control-allow-origin: *`, so with
// crossOrigin="anonymous" the analyser can read the samples.
// Preserves the original usePreview contract: { playing, play, stop }.
export function PreviewProvider({ children }) {
  const [playing, setPlaying] = useState(null);   // trackId currently previewing
  const [current, setCurrent] = useState(null);    // { id, name, artist, features }
  const [, force] = useState(0);                    // re-render once analyser exists

  const audioRef = useRef(null);
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const srcRef = useRef(null);

  const ensureGraph = (audio) => {
    try {
      if (!ctxRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctxRef.current = new AC();
        analyserRef.current = ctxRef.current.createAnalyser();
        analyserRef.current.fftSize = 512;             // more bins → finer detail across the spectrum
        analyserRef.current.smoothingTimeConstant = 0.35; // low internal smoothing → raw transients; attack/release shapes the punch
        analyserRef.current.connect(ctxRef.current.destination);
      }
      if (ctxRef.current.state === "suspended") ctxRef.current.resume();
      const src = ctxRef.current.createMediaElementSource(audio);
      src.connect(analyserRef.current);
      srcRef.current = src;
    } catch {
      /* analyser unavailable (older browser / tainted) — audio still plays */
    }
  };

  const teardown = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (srcRef.current) { try { srcRef.current.disconnect(); } catch {} srcRef.current = null; }
  };

  const stop = useCallback(() => { teardown(); setPlaying(null); setCurrent(null); }, []);

  const play = useCallback(async (trackId, trackName, artist, features = null) => {
    if (playing === trackId) { stop(); return; }
    teardown();
    try {
      const res = await fetch(
        `${API}/nowplaying/deezer-preview?track_name=${encodeURIComponent(trackName)}&artist=${encodeURIComponent(artist)}`
      );
      const data = await res.json();
      if (data.found && data.preview_url) {
        const audio = new Audio();
        audio.crossOrigin = "anonymous";
        audio.src = data.preview_url;
        audio.volume = 0.85;
        ensureGraph(audio);
        audio.onended = () => stop();
        audio.play().catch(() => {});
        audioRef.current = audio;
        setPlaying(trackId);
        setCurrent({ id: trackId, name: trackName, artist, features, album_art: data.album_art });
        force((n) => n + 1);   // expose the now-created analyser to consumers
      } else {
        window.open(`https://open.spotify.com/track/${trackId}`, "_blank");
      }
    } catch {
      window.open(`https://open.spotify.com/track/${trackId}`, "_blank");
    }
  }, [playing, stop]);

  return (
    <Ctx.Provider value={{ playing, current, play, stop, analyser: analyserRef.current }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePreviewContext() {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePreviewContext must be used within <PreviewProvider>");
  return v;
}
