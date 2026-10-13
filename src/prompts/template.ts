/** The slots a prompt template can name (§9.12): each is replaced by one Markdown block when the prompt is copied. */
export const SLOT_NAMES = ['initiative', 'timeline', 'costs', 'plan', 'gate', 'attention', 'terms', 'today', 'product'] as const;
export type SlotName = (typeof SLOT_NAMES)[number];

/** The prompts a brand pack can replace (§2, §9.12), each with the file the core ships as its default. */
export const PROMPT_KINDS = { copyForAi: 'copy-for-ai.md' } as const;
export type PromptKind = keyof typeof PROMPT_KINDS;

// `{{` and `}}` around a word: the one piece of syntax a template has; there are no conditions, loops or expressions.
const SLOT = /\{\{(\w+)\}\}/g;

/** Each `{{…}}` in a template that is not exactly a slot's name, once each, so the build can refuse it (§9.12): `{{ costs }}` too, which would otherwise be copied as written. */
export function unknownSlots(template: string): string[] {
  const known: readonly string[] = SLOT_NAMES;
  return [...new Set([...template.matchAll(/\{\{([^{}]*)\}\}/g)].map((m) => m[1]).filter((name) => !known.includes(name)))];
}

/**
 * The template with each slot replaced by its block, in one pass over the template only: text inside a block is never
 * read for slots, so a description holding `{{costs}}` is copied as typed (§9.12 Data, not instructions).
 */
export function fillTemplate(template: string, blocks: Record<SlotName, string>): string {
  return template.replace(SLOT, (match, name: string) => (Object.hasOwn(blocks, name) ? blocks[name as SlotName] : match));
}
