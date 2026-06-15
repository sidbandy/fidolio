import { useState, useRef } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function usePreview() {
  const [playing, setPlaying] = useState(null);
  const audioRef = useRef(null);

  const play = async (trackId, trackName, artist) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (playing === trackId) {
      setPlaying(null);
      return;
    }
    try {
      const res = await fetch(
        `${API}/nowplaying/deezer-preview?track_name=${encodeURIComponent(trackName)}&artist=${encodeURIComponent(artist)}`
      );
      const data = await res.json();
      if (data.found && data.preview_url) {
        const audio = new Audio(data.preview_url);
        audio.volume = 0.8;
        audio.play();
        audio.onended = () => setPlaying(null);
        audioRef.current = audio;
        setPlaying(trackId);
      } else {
        window.open(`https://open.spotify.com/track/${trackId}`, "_blank");
      }
    } catch {
      window.open(`https://open.spotify.com/track/${trackId}`, "_blank");
    }
  };

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlaying(null);
  };

  return { playing, play, stop };
}