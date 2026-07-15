/**
 * lib/security.ts — Common security utility helpers.
 *
 * Implements a pure Javascript, Edge-runtime-compatible, timing-safe string comparison
 * function to defend against timing side-channel attacks on API tokens and PINs.
 */

/**
 * Perform a timing-safe comparison of two strings.
 * Returns true if they are exactly equal, false otherwise.
 */
export function safeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
