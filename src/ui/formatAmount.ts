const whole = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

/** A full amount for tables and editors (§9.11): rounded only here, for display — never in the stored figure or the maths. */
export function formatAmount(value: number, currencySymbol: string): string {
  return `${currencySymbol}${whole.format(value)}`;
}

/**
 * A compact amount for cards and board headers (§9.11): under 1,000 in full, thousands as "k" with no decimals,
 * millions as "M" with one decimal. Rounds the exact value, and a figure that would round up to 1,000 k reads as
 * "1.0 M" instead. Display only; the full amount goes in the tooltip.
 */
export function formatCompactAmount(value: number, currencySymbol: string): string {
  const abs = Math.abs(value);
  if (abs >= 999_500) return `${currencySymbol}${(value / 1_000_000).toFixed(1)} M`;
  if (abs >= 1_000) return `${currencySymbol}${Math.round(value / 1_000)} k`;
  return formatAmount(value, currencySymbol);
}

const sign = (value: number) => (value > 0 ? '+' : value < 0 ? '−' : '');

/** `+€9,200` / `−€1,300` / `€0`: a difference or deviation reads its sign, an amount on its own never does (§9.11). */
export function formatSignedAmount(value: number, currencySymbol: string): string {
  return `${sign(value)}${formatAmount(Math.abs(value), currencySymbol)}`;
}

/** The compact form of {@link formatSignedAmount}: `+€4 k` / `−€3 k` / `€0`. */
export function formatCompactSignedAmount(value: number, currencySymbol: string): string {
  return `${sign(value)}${formatCompactAmount(Math.abs(value), currencySymbol)}`;
}
