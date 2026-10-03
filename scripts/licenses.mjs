// §10.8 Dependencies: licences are checked against an allowed list. Read from the lockfile, which records each
// package's licence and whether it is dev-only, so no extra dependency (and no extra attack surface) is needed.
// Only what ships to the browser is checked: dev tools never reach a user.

/** Licences the shipped code may carry (SPDX ids). */
export const ALLOWED_LICENSES = new Set(['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'BlueOak-1.0.0', 'CC0-1.0']);

/** True when an SPDX expression is covered: every AND side, and at least one OR side, is allowed. */
export function licenseAllowed(expression, allowed = ALLOWED_LICENSES) {
  const orSides = expression.replace(/[()]/g, ' ').split(/\s+OR\s+/i);
  return orSides.some((side) => side.split(/\s+AND\s+/i).every((id) => allowed.has(id.trim())));
}

/** `package@licence` lines for every production package in the lockfile whose licence is missing or not allowed. */
export function disallowedLicenses(lockfile, allowed = ALLOWED_LICENSES) {
  const problems = [];
  for (const [path, entry] of Object.entries(lockfile.packages ?? {})) {
    if (!path || entry.dev) continue;
    const name = path.replace(/^.*node_modules\//, '');
    const license = typeof entry.license === 'string' ? entry.license : undefined;
    if (!license) problems.push(`${name}: no licence recorded`);
    else if (!licenseAllowed(license, allowed)) problems.push(`${name}: ${license}`);
  }
  return problems;
}
