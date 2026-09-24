const whole = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

/** A full amount for tables and editors (§9.11): rounded only here, for display — never in the stored figure or the maths. */
export function formatAmount(value: number, currencySymbol: string): string {
  return `${currencySymbol}${whole.format(value)}`;
}
