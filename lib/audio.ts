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
const activeSounds: Record<string, HTMLAudioElement> = {};

export function playAudio(filename: string): void {
  if (typeof window === 'undefined') return;

  try {
    // If the sound is already playing, skip to prevent overlapping loops
    if (activeSounds[filename]) {
      const existing = activeSounds[filename];
      if (!existing.paused && !existing.ended) {
        console.log(`[playAudio] Sound "${filename}" is already active. Skipping duplicate overlap.`);
        return;
      }
    }

    let audio = audioCache[filename];
    if (!audio) {
      audio = new Audio(`/sounds/${filename}`);
      audio.preload = 'auto';
      audioCache[filename] = audio;
    }

    const soundToPlay = audio.cloneNode(true) as HTMLAudioElement;
    activeSounds[filename] = soundToPlay;

    soundToPlay.play().catch((err) => {
      console.warn(`[playAudio] Playback blocked or interrupted for ${filename}:`, err.message);
    });

    soundToPlay.onended = () => {
      if (activeSounds[filename] === soundToPlay) {
        delete activeSounds[filename];
      }
    };
  } catch (err) {
    console.error(`[playAudio] Failed to play audio file ${filename}:`, err);
  }
}
