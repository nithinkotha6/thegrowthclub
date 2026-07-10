/**
 * Reusable client-side audio player utility.
 * Handles preloading, eager caching, and cloning nodes for zero latency playback.
 */

// Cache of preloaded HTML5 Audio objects
const audioCache: Record<string, HTMLAudioElement> = {};

const SOUND_FILES = [
  'signup-process.mp3',
  'name.mp3',
  'who-are-you.mp3',
  'thanks-a-lot.mp3',
  'login.mp3',
  'error.mp3'
];

/**
 * Eagerly preloads and caches all registered audio assets.
 * Call this early (e.g. in useEffect on mount) to prevent play latency.
 */
export function preloadAllSounds(): void {
  if (typeof window === 'undefined') return;

  SOUND_FILES.forEach((file) => {
    if (!audioCache[file]) {
      try {
        const audio = new Audio(`/sounds/${file}`);
        audio.preload = 'auto';
        audio.load(); // Eagerly trigger network load
        audioCache[file] = audio;
      } catch (err) {
        console.error(`[preloadAllSounds] Failed to preload sound file ${file}:`, err);
      }
    }
  });
}

/**
 * Plays a preloaded audio file with zero latency using cloning.
 */
export function playAudio(filename: string): void {
  if (typeof window === 'undefined') return;

  try {
    let audio = audioCache[filename];
    if (!audio) {
      // Fallback in case preload hasn't completed or wasn't run
      audio = new Audio(`/sounds/${filename}`);
      audio.preload = 'auto';
      audioCache[filename] = audio;
    }

    // Clone the cached audio node so multiple triggers don't interrupt each other
    // and play instantly with 0ms delay.
    const soundToPlay = audio.cloneNode(true) as HTMLAudioElement;
    soundToPlay.play().catch((err) => {
      console.warn(`[playAudio] Playback blocked or interrupted for ${filename}:`, err.message);
    });
  } catch (err) {
    console.error(`[playAudio] Failed to play audio file ${filename}:`, err);
  }
}
