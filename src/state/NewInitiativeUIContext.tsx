import { createContext, useContext, useState, type ReactNode } from 'react';

interface NewInitiativeUI {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const Ctx = createContext<NewInitiativeUI | null>(null);

/**
 * Shared open/closed state for the New initiative form (§5.1), so an empty
 * state elsewhere on the page (§9.4: "creating an initiative when no team
 * exists points to creating a team" and its Portfolio counterpart) can open
 * the same control the top bar owns, instead of duplicating the form.
 */
export function NewInitiativeUIProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <Ctx.Provider value={{ open, setOpen }}>{children}</Ctx.Provider>;
}

export function useNewInitiativeUI(): NewInitiativeUI {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNewInitiativeUI must be used within a NewInitiativeUIProvider');
  return ctx;
}
