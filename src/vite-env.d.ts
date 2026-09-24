/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev server only; see src/auth/tokenStore.ts. Never set in CI or a deploy. */
  readonly VITE_DEV_TOKEN?: string;
}
