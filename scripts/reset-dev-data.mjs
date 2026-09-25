// Resets the development dataset: empties teams, people and memberships and deletes every
// initiative file on the data branch, keeping roles, countries and dataset.json.
// Run with `npm run dev:reset-data`. See scripts/dev-data.mjs for the target and token handling.
import { resetDevData, target } from './dev-data.mjs';

console.log(`Resetting ${target}`);
await resetDevData();
console.log('Done.');
