/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google Analytics 4 の測定 ID（G-XXXXXXX）。未設定なら送信しない */
  readonly VITE_GA_ID?: string;
}
