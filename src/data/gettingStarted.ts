import type { DatasetFlags, Initiative, Membership, Person, Team } from './types';

export interface GettingStartedStep {
  id: 'rates' | 'team' | 'people' | 'initiative';
  label: string;
  href: string;
  /** Whether `href` leads to the place the step is done, rather than to Teams for want of an active team. */
  arrives: boolean;
  done: boolean;
}

interface GettingStartedData {
  datasetFlags: DatasetFlags | null;
  teams: Team[];
  people: Person[];
  memberships: Membership[];
  initiatives: Initiative[];
}

/**
 * The Getting started strip's four steps (§5.2), derived from the dataset so every user sees the same ones. With no
 * active team, the steps that need one link to Teams, as the New initiative button does (§9.4).
 */
export function gettingStartedSteps({ datasetFlags, teams, people, memberships, initiatives }: GettingStartedData): GettingStartedStep[] {
  const activeTeams = teams.filter((t) => t.active);
  const activePeople = new Set(people.filter((p) => p.active).map((p) => p.id));
  const hasMember = (teamId: string) => memberships.some((m) => m.teamId === teamId && m.active && activePeople.has(m.personId));
  const firstActive = activeTeams[0];
  return [
    { id: 'rates', label: 'Review rates', href: '#/settings/countries', arrives: true, done: datasetFlags?.ratesReviewed === true },
    { id: 'team', label: 'Create a team', href: '#/teams', arrives: true, done: teams.length > 0 },
    {
      id: 'people',
      label: 'Add people to the team',
      href: firstActive ? `#/teams/${firstActive.id}` : '#/teams',
      arrives: !!firstActive,
      done: activeTeams.some((t) => hasMember(t.id)),
    },
    {
      id: 'initiative',
      label: 'Create your first initiative',
      href: firstActive ? '#/initiatives/new' : '#/teams',
      arrives: !!firstActive,
      done: initiatives.length > 0,
    },
  ];
}

/** The Portfolio greets a dataset with no team and no initiative with the welcome card, its only Create a team (§9.4). */
export const showsWelcome = ({ teams, initiatives }: Pick<GettingStartedData, 'teams' | 'initiatives'>): boolean =>
  teams.length === 0 && initiatives.length === 0;
