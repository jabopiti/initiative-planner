import { createContext, useContext } from 'react';

/**
 * What the signed-in session offers below `App` (§5.9 Connection): who the token belongs to and how to end the
 * session. `App` owns the token, so Settings reaches it through here instead of a prop through every screen.
 */
export interface Session {
  /** The GitHub login the token belongs to; null until known. */
  login: string | null;
  rememberLogin: (login: string) => void;
  /** Removes the token from the browser and shows the Connect screen; the cache stays (§10.4). */
  disconnect: () => void;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used within a session');
  return session;
}
