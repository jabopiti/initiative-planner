/** `item` put back at `index` (or last, when the list has since shrunk): where an Undo restores a removed list item. */
export function insertAt<T>(list: T[], item: T, index: number): T[] {
  const next = [...list];
  next.splice(Math.min(index, next.length), 0, item);
  return next;
}
