import type { PhaseDef } from '../brand/types';
import type { Initiative } from './types';

/**
 * An initiative's current phase (§6: "Derived — position in the process").
 * Slice 003 has no gate records yet (passing a gate is slice 008), so every
 * initiative is in the process's first phase — this needs to read gate
 * records once that exists.
 */
export function currentPhaseId(_initiative: Initiative, process: PhaseDef[]): string {
  return process[0].id;
}
