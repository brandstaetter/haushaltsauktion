/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO_LOGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
