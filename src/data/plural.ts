/** "1 team", "3 teams": a count with its noun. */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
