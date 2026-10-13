/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev server only; see src/auth/tokenStore.ts. Never set in CI or a deploy. */
  readonly VITE_DEV_TOKEN?: string;
}

/** Package version and short commit, injected at build time (vite.config.ts); shown in Settings → About. */
declare const __BUILD_VERSION__: string;

/** The brand pack's logo as a served, hashed URL (brandColoursPlugin). */
declare module 'virtual:brand-assets' {
  export const logoUrl: string;
}

/** The prompt templates (§9.12): the brand pack's where it names one, the core's defaults otherwise (brandColoursPlugin). */
declare module 'virtual:brand-prompts' {
  const templates: Record<import('./prompts/template').PromptKind, string>;
  export default templates;
}
