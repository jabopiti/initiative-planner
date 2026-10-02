/** A commit message split into its plain-words subject and the `Entity:` trailer lines that end it (§10.3). */
export function splitMessage(message: string): { subject: string; trailers: string[] } {
  const [subject, ...rest] = message.split('\n\n');
  return { subject, trailers: rest.join('\n\n').split('\n').filter(Boolean) };
}

/** The subject alone, for tests about the wording. */
export const subjectOf = (message: string): string => splitMessage(message).subject;
