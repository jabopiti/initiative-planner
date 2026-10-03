/** Why adding a person is off while Settings has no active country or role: links to the prerequisite instead of dead-ending (§9.4). */
export function MissingDefaultsNote({ verb, className = '' }: { verb: 'adding' | 'creating'; className?: string }) {
  return (
    <p className={`m-0 text-caption text-text-secondary ${className}`}>
      Add a country and a role in <a href="#/settings">Settings</a> before {verb} people.
    </p>
  );
}
