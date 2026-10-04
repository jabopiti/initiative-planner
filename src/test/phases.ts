import { screen, within } from '@testing-library/react';

/** The initiative page's Phases section, so a phase row isn't confused with the same phase elsewhere (the time strip, the stepper). */
export const phases = () => within(screen.getByRole('region', { name: 'Phases' }));
export const findPhases = async () => within(await screen.findByRole('region', { name: 'Phases' }));
