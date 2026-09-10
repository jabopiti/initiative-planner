/**
 * Formatting and parsing of typed values: money, dates, months, and numbers.
 * English only (D6).
 */
import { PROCESS } from './process.js';

const EN = 'en-GB';

/** Format a number as currency for display. */
export function money(amount) {
  const rounded = Math.round(amount ?? 0);
  return `${PROCESS.currency}${rounded.toLocaleString(EN)}`;
}

/** 
 * Format a month ISO string (YYYY-MM) as English (e.g. "Jan 2026").
 * Falls back to the raw string if unparseable.
 */
export function month(isoMonth) {
  if (!isoMonth) return '';
  const parts = isoMonth.split('-');
  if (parts.length !== 2) return isoMonth;
  const date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, 1));
  if (isNaN(date.valueOf())) return isoMonth;
  return date.toLocaleDateString(EN, { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Format a full date ISO string (YYYY-MM-DD) as English (e.g. "1 Jan 2026").
 * Falls back to the raw string if unparseable.
 */
export function date(isoDate) {
  if (!isoDate) return '';
  const dateObj = new Date(isoDate);
  if (isNaN(dateObj.valueOf())) return isoDate;
  // Use UTC to prevent local timezone from shifting the day
  return dateObj.toLocaleDateString(EN, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** 
 * Parse a numeric field. Rejects unparseable input (e.g. text or multiple commas)
 * by returning the fallback rather than stripping valid separators and misparsing.
 */
export function readNumber(input, fallback = 0) {
  const str = String(input).trim();
  if (str === '') return fallback;
  
  const isExpectedFormat = /^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(str) || /^-?\d+(\.\d+)?$/.test(str);
  if (!isExpectedFormat) return fallback;
  
  const parsed = Number(str.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}
