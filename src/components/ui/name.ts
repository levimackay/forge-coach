/**
 * Names (a day, a lift, a section) end in a period. Labels, dates and values never do.
 * Text that already ends in a period, question mark or exclamation mark is left alone.
 */
export function named(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
