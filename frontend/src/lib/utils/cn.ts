import { clsx as _clsx, type ClassValue } from 'clsx';

/**
 * Re-export clsx so the rest of the app imports from a single internal path.
 * Lets us swap implementation later without touching call sites.
 */
export function cn(...inputs: ClassValue[]): string {
  return _clsx(inputs);
}
