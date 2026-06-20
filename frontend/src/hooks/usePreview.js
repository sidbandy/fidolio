import { usePreviewContext } from "../context/PreviewProvider";

// Thin reader over the shared PreviewProvider. Same contract as before
// ({ playing, play, stop }) so every existing caller keeps working — now they
// all share one AudioContext/analyser instead of each spawning its own Audio.
export default function usePreview() {
  const { playing, play, stop } = usePreviewContext();
  return { playing, play, stop };
}
