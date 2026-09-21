# Future Architecture: Multi-User Collaborative Planner

This document outlines the architectural direction for the next major iteration of the Initiative Planner. It formalizes the shift from a single-user, vanilla JS tool to a modern, multi-user collaborative application.

## 1. Scope Evolution & Retired Constraints

To support team collaboration and complex UI requirements, several foundational constraints from the original `SPEC.md` and `DESIGN.md` are officially retired for this future iteration:

*   **RETIRED: Single-User Limitation.** The tool will support multiple concurrent users reading and writing to the same data.
*   **RETIRED: "Zero Dependencies / 10-Year No-Rot."** While a lightweight footprint remains a priority, the project will accept necessary dependencies for data synchronization and authentication logic (e.g., CRDTs).
*   **DEFERRED, NOT RETIRED: "Vanilla JavaScript Only."** Adopting a frontend framework is not part of the current direction — vanilla JS continues to govern application and UI code. This may be revisited later, but it is not being pursued now.

## 2. Modernizing the Frontend Stack

**Status: deferred, not part of the current direction.** Vanilla JS
continues to govern application and UI code (see §1). This section is
kept as a record of the option considered, not a plan being executed.

**Problem Statement:**
As the application grows, managing complex, highly interactive UI features (such as data grids, cross-entity capacity calculations, and popovers) via manual DOM manipulation has become a development bottleneck. 

**Architectural Direction (if revisited later):**
The frontend could be rebuilt or migrated to a modern declarative UI framework. This would provide an automated way to keep the user interface in sync with the underlying data state, eliminating manual DOM-updating bugs while remaining compatible with static hosting on GitHub Pages.

**To Be Defined (TBD), if this is ever picked back up:**
*   The specific JavaScript framework to adopt (e.g., Svelte, React, Lit, Solid).
*   The migration strategy (e.g., an incremental rollout vs. a complete rewrite).
*   Selection of specific headless UI libraries for complex components.

## 3. Multi-User Collaboration & Synchronization

**Problem Statement:**
We need a secure, robust way to read, write, and synchronize data across different team members and devices without provisioning a traditional backend server, while keeping access restricted to authorized enterprise personnel.

**Architectural Direction:**
*   **Zero Custom Backend / GitHub API Storage:** The application will remain statically hosted on GitHub Pages. Data will be persisted in a private GitHub Enterprise repository. The frontend will communicate directly with the GitHub REST API to read and write state, leveraging the enterprise ecosystem's built-in access controls.
*   **Conflict Resolution:** To handle concurrent edits and prevent race conditions (where one user overwrites another's save), the system will integrate a Conflict-Free Replicated Data Type (CRDT) library (such as Yjs or Automerge). This allows merging logic to execute entirely within the user's browser.

**To Be Defined (TBD) upon implementation:**
*   **Authorization Mechanism:** How the frontend authenticates with the GitHub API. Options include users authenticating via a GitHub OAuth flow, users supplying their own Personal Access Tokens (PAT) in the app settings, or a shared PAT.
