import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Normalize an unknown thrown/returned error value into a display string. */
export function formatAdminError(err: unknown): string {
  if (!err) return 'An unknown error occurred';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/** Streak badge display format: "N 🔥" if count > 0, else "0 😂". */
export function formatStreakBadge(count: number): string {
  return count > 0 ? `${count} 🔥` : '0 😂';
}
