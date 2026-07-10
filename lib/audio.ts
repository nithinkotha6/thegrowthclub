/**
 * Reusable client-side audio player utility.
 * Safe to call from client components. Does nothing during Server-Side Rendering (SSR).
 */
export function playAudio(filename: string): void {
  if (typeof window === 'undefined') return;

  try {
    const audio = new Audio(`/sounds/${filename}`);
    // Play audio safely; catch potential autoplay blocks gracefully
    audio.play().catch((err) => {
      console.warn(`[playAudio] Browser blocked autoplay for ${filename}:`, err.message);
    });
  } catch (err) {
    console.error(`[playAudio] Failed to initialize Audio object for ${filename}:`, err);
  }
}
