/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_DEMO_LOGIN?: string;
  /** Baked in at Docker build time (see apps/web/Dockerfile) — defaults to 'dev'. */
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
