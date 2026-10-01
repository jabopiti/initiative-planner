/** "A", "A and B", "A, B and C" (§9.2): a list in running copy. */
export function joinList(items: string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
