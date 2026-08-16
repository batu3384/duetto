import type {
  SubtitleAlign,
  SubtitleEdgeStyle,
  SubtitleFontFamily,
  SubtitlePlacement,
  SubtitleStyle,
  VideoFitMode,
} from '../types';

const LATIN =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC';
const LATIN_EXT =
  'U+0100-02AF, U+0304, U+0308, U+0329, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

const EDGE_SET = new Set<string>(['none', 'outline', 'dropshadow', 'raised', 'depressed']);

export const SUBTITLE_FONTS: { id: SubtitleFontFamily; name: string; stack: string }[] = [
  { id: 'Arial', name: 'Arial (yayın)', stack: 'Arial, Helvetica, sans-serif' },
  { id: 'Verdana', name: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
  { id: 'Tahoma', name: 'Tahoma', stack: 'Tahoma, sans-serif' },
  { id: 'Trebuchet MS', name: 'Trebuchet MS', stack: '"Trebuchet MS", sans-serif' },
  { id: 'Noto Sans', name: 'Noto Sans (TR)', stack: '"Noto Sans", Arial, sans-serif' },
  { id: 'Atkinson Hyperlegible', name: 'Atkinson', stack: '"Atkinson Hyperlegible", Arial, sans-serif' },
];

export const EDGE_OPTIONS: { id: SubtitleEdgeStyle; name: string }[] = [
  { id: 'none', name: 'Yok' },
  { id: 'outline', name: 'Kontur' },
  { id: 'dropshadow', name: 'Gölge' },
  { id: 'raised', name: 'Kabartma' },
  { id: 'depressed', name: 'Çökük' },
];

const STACK_BY_ID: Record<string, string> = Object.fromEntries(SUBTITLE_FONTS.map((f) => [f.id, f.stack]));

export function isEdgeStyle(v: unknown): v is SubtitleEdgeStyle {
  return typeof v === 'string' && EDGE_SET.has(v);
}

export function migrateFontFamily(family: string | undefined): SubtitleFontFamily {
  if (family && STACK_BY_ID[family]) return family as SubtitleFontFamily;
  return 'Arial';
}

export function resolveFontStack(family: string | undefined): string {
  return STACK_BY_ID[migrateFontFamily(family)];
}

export function clampOutlineWidth(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 2;
  return Math.max(1, Math.min(4, Math.round(v)));
}

export function clampFontSize(n: unknown, min: number, max: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
}

export function clampOffsetY(n: unknown, fallback = 42): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(8, Math.min(400, Math.round(v)));
}

export function readCssPx(value: string, fallback: number): number {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function clampPct(n: unknown, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function clampDockOpacity(n: unknown, fallback = 0): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function safeCssColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const v = value.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
    if (v.length === 4) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase();
    return v.toLowerCase();
  }
  return fallback;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = safeCssColor(hex, '#0e1424').slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function luma(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const DOCK_SEAM_PX = 16;
export const DOCK_LIGHT_LUMA = 166;

/** Bottom band of a frame — the strip that meets the well, not the title bar. */
export function averageBottomRgb(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bandRatio = 0.28
): { r: number; g: number; b: number } {
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  const ratio = Math.max(0.08, Math.min(1, bandRatio));
  const y0 = Math.min(h - 1, Math.max(0, Math.floor(h * (1 - ratio))));
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = y0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
  }
  if (!n) return { r: 0, g: 0, b: 0 };
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

export function rgbCss(c: { r: number; g: number; b: number }): string {
  return `rgb(${c.r},${c.g},${c.b})`;
}

export function boxFillRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r},${g},${b},${a})`;
}

export function dockFill(hex: string, opacityPct: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clampDockOpacity(opacityPct) / 100})`;
}

/** YouTube / CEA-708 pen colors + dual-sub extras. */
export const TEXT_COLORS: { name: string; color: string }[] = [
  { name: 'Beyaz', color: '#ffffff' },
  { name: 'Buz', color: '#e4e4e7' },
  { name: 'Sarı', color: '#fde047' },
  { name: 'Altın', color: '#fbbf24' },
  { name: 'Cyan', color: '#22d3ee' },
  { name: 'Gök', color: '#38bdf8' },
  { name: 'Yeşil', color: '#4ade80' },
  { name: 'Lime', color: '#a3e635' },
  { name: 'Pembe', color: '#f9a8d4' },
  { name: 'Macenta', color: '#e879f9' },
  { name: 'Turuncu', color: '#fb923c' },
  { name: 'Kırmızı', color: '#f87171' },
];

export const DOCK_COLORS: { name: string; color: string }[] = [
  { name: 'Sinema', color: '#000000' },
  { name: 'Gece mavisi', color: '#0a1628' },
  { name: 'Grafit', color: '#2d3139' },
  { name: 'Kahve', color: '#2a1f18' },
  { name: 'Açık kuyu', color: '#d4d4d8' },
];

export const BOX_COLORS: { name: string; color: string }[] = [
  { name: 'Sinema', color: '#0e1424' },
  { name: 'Kömür', color: '#18181b' },
  { name: 'Lacivert', color: '#0f172a' },
  { name: 'Gece', color: '#152038' },
  { name: 'Orman', color: '#14532d' },
  { name: 'Bordo', color: '#3f1d1d' },
  { name: 'Açık', color: '#e4e4e7' },
];

export function resolveAlign(v: unknown): SubtitleAlign {
  if (v === 'left' || v === 'right' || v === 'center') return v;
  return 'center';
}

export function resolvePlacement(v: unknown): SubtitlePlacement {
  return v === 'below' ? 'below' : 'overlay';
}

export function resolveVideoFit(v: unknown): VideoFitMode {
  return v === 'contain' ? 'contain' : 'cover';
}

const SUB_LINE_HEIGHT = 1.42;
const SUB_INNER_GAP = 6;
const SUB_DOCK_PAD = 18;

/** Caption strip under the picture. Dual lines need more room than one. */
export function autoDockPx(sub: SubtitleStyle): number {
  const look = captionLook(sub);
  const dual = (sub.layoutMode || 'dual') === 'dual';
  const textH = dual
    ? look.primarySize * SUB_LINE_HEIGHT + look.secondarySize * SUB_LINE_HEIGHT + SUB_INNER_GAP
    : Math.max(look.primarySize, look.secondarySize) * SUB_LINE_HEIGHT;
  return Math.max(72, Math.min(220, Math.ceil(textH + SUB_DOCK_PAD + 24)));
}

/** CEA-708 char border: none, uniform, drop-shadow, raised, depressed. */
export function edgeTextShadow(
  edge: SubtitleEdgeStyle | undefined,
  widthPx: number,
  color = '#000000'
): string {
  const w = clampOutlineWidth(widthPx);
  const c = safeCssColor(color, '#000000');
  if (!edge || edge === 'none') return 'none';
  if (edge === 'dropshadow') {
    return `${w}px ${w}px ${w + 1}px ${c}, 0 0 ${w + 2}px ${c}`;
  }
  if (edge === 'raised') {
    return `-${w}px -${w}px 0 #9ca3af, ${w}px ${w}px 0 ${c}`;
  }
  if (edge === 'depressed') {
    return `${w}px ${w}px 0 #9ca3af, -${w}px -${w}px 0 ${c}`;
  }
  const o: string[] = [];
  for (let x = -w; x <= w; x++) {
    for (let y = -w; y <= w; y++) {
      if (x === 0 && y === 0) continue;
      if (Math.abs(x) === w || Math.abs(y) === w) o.push(`${x}px ${y}px 0 ${c}`);
    }
  }
  return o.join(', ');
}

export function glassFillAlpha(opacityPct: number, blur: boolean): number {
  const a = clampPct(opacityPct, 55) / 100;
  if (!blur) return a;
  return Math.min(a, 0.48);
}

export function prefersReducedTransparency(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
}

export function resolveEdgeStyle(sub: Partial<SubtitleStyle> | undefined): SubtitleEdgeStyle {
  if (isEdgeStyle(sub?.edgeStyle)) return sub.edgeStyle;
  if (sub?.textStroke === false) return 'none';
  return 'outline';
}

export function bundledFontFaceCss(urlFor: (file: string) => string): string {
  const faces: { family: string; file: string; weight: number; range: string }[] = [
    { family: 'Atkinson Hyperlegible', file: 'atkinson-400.woff2', weight: 400, range: LATIN },
    { family: 'Atkinson Hyperlegible', file: 'atkinson-700.woff2', weight: 700, range: LATIN },
    { family: 'Atkinson Hyperlegible', file: 'atkinson-ext-400.woff2', weight: 400, range: LATIN_EXT },
    { family: 'Atkinson Hyperlegible', file: 'atkinson-ext-700.woff2', weight: 700, range: LATIN_EXT },
    { family: 'Noto Sans', file: 'noto-sans-400.woff2', weight: 400, range: LATIN },
    { family: 'Noto Sans', file: 'noto-sans-700.woff2', weight: 700, range: LATIN },
    { family: 'Noto Sans', file: 'noto-sans-ext-400.woff2', weight: 400, range: LATIN_EXT },
    { family: 'Noto Sans', file: 'noto-sans-ext-700.woff2', weight: 700, range: LATIN_EXT },
  ];
  return faces
    .map(
      (f) =>
        `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};font-display:swap;unicode-range:${f.range};src:url('${urlFor(f.file)}') format('woff2');}`
    )
    .join('');
}

export interface CaptionLook {
  edge: SubtitleEdgeStyle;
  edgeColor: string;
  blur: boolean;
  zero: boolean;
  alpha: number;
  shadow: string;
  font: string;
  primaryColor: string;
  secondaryColor: string;
  primarySize: number;
  secondarySize: number;
  align: SubtitleAlign;
  reducedTransparency: boolean;
  boxColor: string;
  boxFill: string;
}

export function captionLook(sub: SubtitleStyle, reduceTransparency?: boolean): CaptionLook {
  const reducedTransparency = reduceTransparency ?? prefersReducedTransparency();
  const opacity = clampPct(sub.bgOpacity, 55);
  const zero = opacity === 0;
  const blur = !!sub.blur && !reducedTransparency && !zero;
  const edge = resolveEdgeStyle(sub);
  const edgeColor = safeCssColor(sub.edgeColor, '#000000');
  const boxColor = safeCssColor(sub.boxColor, '#0e1424');
  const alpha = glassFillAlpha(opacity, blur);
  return {
    edge,
    edgeColor,
    blur,
    zero,
    alpha,
    shadow: edgeTextShadow(edge, sub.outlineWidth, edgeColor),
    font: resolveFontStack(sub.fontFamily),
    primaryColor: safeCssColor(sub.primaryColor, '#ffffff'),
    secondaryColor: safeCssColor(sub.secondaryColor, '#fde047'),
    primarySize: clampFontSize(sub.primaryFontSize, 13, 26, 19),
    secondarySize: clampFontSize(sub.secondaryFontSize, 12, 24, 16),
    align: resolveAlign(sub.align),
    reducedTransparency,
    boxColor,
    boxFill: boxFillRgba(boxColor, alpha),
  };
}
