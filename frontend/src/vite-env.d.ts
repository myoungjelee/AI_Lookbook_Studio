/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_FEATURE_TIPS: string;
  readonly VITE_FEATURE_EVALUATE: string;
  readonly VITE_FEATURE_SHARE: string;
  readonly VITE_FEATURE_VIDEO: string;
  readonly VITE_VIDEO_PROMPT: string;
  readonly VITE_VIDEO_ASPECT: string;
  readonly VITE_VIDEO_DURATION: string;
  readonly VITE_VIDEO_RESOLUTION: string;
  readonly VITE_VIDEO_PROMPT_LOCK: string;
  // 다른 환경 변수들도 여기에 추가할 수 있습니다
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
