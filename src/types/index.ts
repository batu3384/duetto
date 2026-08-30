export interface SubtitleCue {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  translation?: string;
}

export type SubtitleLayoutMode = 'dual' | 'target_only' | 'source_only';
export type SubtitleOrder = 'source_top' | 'target_top';
export type SubtitleEdgeStyle = 'none' | 'outline' | 'dropshadow' | 'raised' | 'depressed';
export type SubtitleAlign = 'center' | 'left' | 'right';
export type SubtitlePlacement = 'overlay' | 'below';
export type VideoFitMode = 'cover' | 'contain';
export type SubtitleFontFamily =
  | 'Arial'
  | 'Verdana'
  | 'Tahoma'
  | 'Trebuchet MS'
  | 'Atkinson Hyperlegible'
  | 'Noto Sans';

export interface SubtitleStyle {
  primaryFontSize: number;
  secondaryFontSize: number;
  primaryColor: string;
  secondaryColor: string;
  bgOpacity: number;
  blur: boolean;
  textStroke: boolean;
  edgeStyle: SubtitleEdgeStyle;
  edgeColor: string;
  outlineWidth: number;
  align: SubtitleAlign;
  fontFamily: SubtitleFontFamily;
  boxColor: string;
  dockColor: string;
  dockOpacity: number;
  /** Live video fill in the below-well. False = solid dockColor. */
  dockAmbient: boolean;
  placement: SubtitlePlacement;
  videoFit: VideoFitMode;
  position: 'bottom' | 'top';
  offsetY: number;
  pauseOnHover: boolean;
  termHighlight: boolean;
  layoutMode: SubtitleLayoutMode;
  order: SubtitleOrder;
}

export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: 'TR' },
  { code: 'en', name: 'English', nativeName: 'English', flag: 'EN' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: 'DE' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: 'ES' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: 'FR' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: 'PT' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: 'IT' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: 'RU' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: 'JA' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: 'KO' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: 'ZH' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: 'AR' },
];

export interface ExtensionSettings {
  dualSubtitlesEnabled: boolean;
  sourceLang: string;
  targetLang: string;
  subStyle: SubtitleStyle;
  termLockEnabled: boolean;
  customProtectedTerms: string[];
  playbackSpeed: number;
  silenceSkipEnabled: boolean;
  silenceThreshold: number;
  shortcutsEnabled: boolean;
  geminiApiKey: string;
  /** Runtime only — content script knows key exists without reading it. */
  geminiKeyConfigured?: boolean;
  geminiModel: string;
  geminiTemperature: number;
}

export interface CourseTranscript {
  id: string;
  lectureId: string;
  courseId: string;
  courseTitle: string;
  lectureTitle: string;
  cues: SubtitleCue[];
  language: string;
  translatedLanguage?: string;
  /** Identifies caption source; records without it are not trusted for active subtitles. */
  sourceFingerprint?: string;
  /** Identifies translation model and glossary settings. */
  translationFingerprint?: string;
  updatedAt: number;
}

export interface LectureNote {
  id: string;
  lectureId: string;
  courseId: string;
  courseTitle: string;
  lectureTitle: string;
  time: number;
  sourceText: string;
  translation?: string;
  imageDataUrl?: string;
  createdAt: number;
}

export interface PendingSeek {
  lectureId: string;
  time: number;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  dualSubtitlesEnabled: true,
  sourceLang: 'en',
  targetLang: 'tr',
  subStyle: {
    primaryFontSize: 19,
    secondaryFontSize: 16,
    primaryColor: '#ffffff',
    secondaryColor: '#fde047',
    bgOpacity: 55,
    blur: true,
    textStroke: true,
    edgeStyle: 'outline',
    edgeColor: '#000000',
    outlineWidth: 2,
    align: 'center',
    fontFamily: 'Arial',
    boxColor: '#0e1424',
    dockColor: '#000000',
    dockOpacity: 0,
    dockAmbient: true,
    placement: 'overlay',
    videoFit: 'cover',
    position: 'bottom',
    offsetY: 42,
    pauseOnHover: true,
    termHighlight: true,
    layoutMode: 'dual',
    order: 'source_top',
  },
  termLockEnabled: true,
  customProtectedTerms: [],
  playbackSpeed: 1.0,
  silenceSkipEnabled: false,
  silenceThreshold: -40,
  shortcutsEnabled: true,
  geminiModel: 'gemini-3.5-flash-lite',
  geminiApiKey: '',
  geminiTemperature: 0.2,
};
