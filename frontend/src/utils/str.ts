/**
 * Safe string operations that never throw on non-string values.
 * Handles numbers, objects, null, undefined, booleans gracefully.
 */

/** Safely convert any value to uppercase string */
export function upper(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).toUpperCase();
}

/** Safely convert any value to lowercase string */
export function lower(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).toLowerCase();
}

/** Safely convert any value to a string (never throws) */
export function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}
