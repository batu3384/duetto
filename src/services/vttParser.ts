import type { SubtitleCue } from '../types/index.ts';

/**
 * Checks if a text string is real spoken dialogue and not thumbnail sprite coordinates.
 */
export function isRealSubtitleText(text: string): boolean {
  if (!text || text.length < 1) return false;
  // Reject image sprite coordinates like "thumb-sprites.jpg#xywh=480,270,160,90"
  if (/\.jpe?g|\.png|\.webp|xywh=|#xywh|thumb-sprites|storyboard/i.test(text)) {
    return false;
  }
  return true;
}

/**
 * Converts WebVTT time format (00:01:23.450 or 01:23.450) to seconds.
 */
export function vttTimeToSeconds(timeStr: string): number {
  const parts = timeStr.trim().split(':');
  const parsePart = (part: string): number => {
    const normalized = part.trim().replace(',', '.');
    return /^\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : Number.NaN;
  };
  let hours = 0;
  let minutes = 0;
  let secondsWithMs = 0;

  if (parts.length === 3) {
    hours = parsePart(parts[0]);
    minutes = parsePart(parts[1]);
    secondsWithMs = parsePart(parts[2]);
    if (minutes > 59 || secondsWithMs >= 60) return Number.NaN;
  } else if (parts.length === 2) {
    minutes = parsePart(parts[0]);
    secondsWithMs = parsePart(parts[1]);
    if (secondsWithMs >= 60) return Number.NaN;
  } else {
    secondsWithMs = parsePart(parts[0]);
  }

  if (![hours, minutes, secondsWithMs].every(Number.isFinite)) return Number.NaN;
  return hours * 3600 + minutes * 60 + secondsWithMs;
}

/**
 * Cleans formatting tags from WebVTT cues (e.g. <i>, <b>, <v Voice>, <c.color>, timestamps).
 */
export function cleanVttText(rawText: string): string {
  return rawText
    .replace(/<[^>]+>/g, '') // remove HTML/VTT tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * Parses raw WebVTT text into an array of SubtitleCue objects, strictly ignoring image sprites.
 */
export function parseVTT(vttContent: string): SubtitleCue[] {
  const lines = vttContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const cues: SubtitleCue[] = [];

  let i = 0;
  // Skip WEBVTT header
  while (i < lines.length && !lines[i].includes('-->')) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.includes('-->')) {
      const timeParts = line.split('-->');
      const startStr = timeParts[0].trim().split(' ')[0];
      const endStr = timeParts[1].trim().split(' ')[0];

      const startTime = vttTimeToSeconds(startStr);
      const endTime = vttTimeToSeconds(endStr);

      i++;
      const textLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
        textLines.push(lines[i].trim());
        i++;
      }

      const text = cleanVttText(textLines.join(' '));
      if (Number.isFinite(startTime) && Number.isFinite(endTime) && endTime > startTime && text && isRealSubtitleText(text)) {
        cues.push({
          id: `cue-${cues.length}`,
          startTime,
          endTime,
          text,
        });
      }
    } else {
      i++;
    }
  }

  return cues;
}

/**
 * Groups consecutive cues into logical semantic batches with a separator for batch translation with full context.
 */
export interface CueBatch {
  cues: SubtitleCue[];
  combinedText: string;
}

export function groupCuesForBatchTranslation(cues: SubtitleCue[], maxTokensOrCues: number = 12): CueBatch[] {
  const batches: CueBatch[] = [];
  let currentBatchCues: SubtitleCue[] = [];

  for (const cue of cues) {
    currentBatchCues.push(cue);
    if (currentBatchCues.length >= maxTokensOrCues) {
      batches.push(makeBatch(currentBatchCues));
      currentBatchCues = [];
    }
  }

  if (currentBatchCues.length > 0) batches.push(makeBatch(currentBatchCues));
  return batches;
}

function makeBatch(cues: SubtitleCue[]): CueBatch {
  return {
    cues,
    combinedText: cues.map((c) => `[${c.id}] ${c.text}`).join('\n'),
  };
}

export function cueIndexAtTime(cues: SubtitleCue[], aroundTime: number): number {
  if (!cues.length) return -1;
  let i = cues.findIndex((c) => aroundTime >= c.startTime && aroundTime <= c.endTime);
  if (i < 0) i = cues.findIndex((c) => c.startTime >= aroundTime);
  return i < 0 ? 0 : i;
}

/** On-screen cue plus a few ahead so playback does not wait on the rest of the lecture. */
export function liveWindowCues(
  cues: SubtitleCue[],
  aroundTime: number,
  ahead = 12,
  behind = 1
): SubtitleCue[] {
  if (!cues.length) return [];
  const i = cueIndexAtTime(cues, aroundTime);
  const from = Math.max(0, i - behind);
  return cues.slice(from, i + ahead);
}

/** Current cue + next few first so the on-screen line translates immediately. */
export function orderCuesForLiveTranslation(cues: SubtitleCue[], aroundTime: number): SubtitleCue[] {
  if (!cues.length) return cues;
  const i = cueIndexAtTime(cues, aroundTime);
  const liveEnd = Math.min(cues.length, i + 12);
  return [...cues.slice(i, liveEnd), ...cues.slice(0, i), ...cues.slice(liveEnd)];
}

export function groupCuesForLiveTranslation(
  cues: SubtitleCue[],
  aroundTime: number,
  liveSize = 12,
  batchSize = 12
): CueBatch[] {
  if (!cues.length) return [];
  const i = cueIndexAtTime(cues, aroundTime);
  const live = cues.slice(i, i + liveSize);
  const liveIds = new Set(live.map((c) => c.id));
  const rest = cues.filter((c) => !liveIds.has(c.id));
  const batches: CueBatch[] = [];
  if (live.length) batches.push(makeBatch(live));
  batches.push(...groupCuesForBatchTranslation(rest, batchSize));
  return batches;
}

export function stripGeminiFences(raw: string): string {
  return raw.replace(/^```[\w]*\s*/i, '').replace(/\s*```$/i, '').trim();
}

/** Map `[cue-id] text`. Unlabeled lines append to the last id. No positional fallback. */
export function parseLabeledCueLines(raw: string, allowedIds: Set<string>): Map<string, string> {
  const map = new Map<string, string>();
  const cleaned = stripGeminiFences(raw);
  let lastId: string | null = null;
  for (const line of cleaned.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const match = t.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (match) {
      const id = match[1].trim();
      const text = match[2].replace(/^[:.\-–]\s*/, '').trim();
      if (!allowedIds.has(id) || !text) continue;
      map.set(id, text);
      lastId = id;
      continue;
    }
    if (lastId && map.has(lastId)) {
      map.set(lastId, `${map.get(lastId)} ${t}`);
    }
  }
  return map;
}

/** `[n] text` as index into this batch only. No unlabeled positional fallback. */
export function parseStrictIndexLines(raw: string, expected: number): Map<number, string> {
  const map = new Map<number, string>();
  if (expected <= 0) return map;
  const cleaned = stripGeminiFences(raw);
  for (const line of cleaned.split('\n')) {
    const match = line.trim().match(/^\[(\d+)\]\s*(.*)$/);
    if (!match) continue;
    const i = parseInt(match[1], 10);
    const text = match[2].replace(/^[:.\-–]\s*/, '').trim();
    if (i >= 0 && i < expected && text) map.set(i, text);
  }
  return map;
}

export function parseBatchTranslation(raw: string, batchCues: SubtitleCue[]): Map<string, string> {
  const allowed = new Set(batchCues.map((c) => c.id));
  const labeled = parseLabeledCueLines(raw, allowed);
  const map = new Map(labeled);
  if (map.size === batchCues.length) return map;
  const indexed = parseStrictIndexLines(raw, batchCues.length);
  batchCues.forEach((cue, i) => {
    const text = indexed.get(i);
    if (!map.has(cue.id) && text) map.set(cue.id, text);
  });
  return map;
}

export function cueAtTime(cues: SubtitleCue[], currentTime: number): SubtitleCue | null {
  let best: SubtitleCue | null = null;
  for (const c of cues) {
    if (currentTime >= c.startTime && currentTime <= c.endTime) {
      if (!best || c.startTime >= best.startTime) best = c;
    }
  }
  return best;
}

export function cueTranslationCoverage(cues: SubtitleCue[]): number {
  if (!cues.length) return 0;
  let n = 0;
  for (const c of cues) {
    if (typeof c.translation === 'string' && c.translation.length > 0) n += 1;
  }
  return n / cues.length;
}

const ISO3_TO_1: Record<string, string> = {
  eng: 'en',
  tur: 'tr',
  deu: 'de',
  ger: 'de',
  fra: 'fr',
  fre: 'fr',
  spa: 'es',
  por: 'pt',
  ita: 'it',
  jpn: 'ja',
  kor: 'ko',
  chi: 'zh',
  zho: 'zh',
  ara: 'ar',
  rus: 'ru',
};

/** BCP-47 / ISO 639-2 / Udemy locale → primary code (`eng` / `en_US` / `en` → `en`). */
export function primaryLang(code: string): string {
  const primary = (code || '').trim().toLowerCase().replace(/_/g, '-').split('-')[0];
  return ISO3_TO_1[primary] || primary;
}

export function trackMatchesSource(language: string, label: string, sourceLang: string): boolean {
  const lab = `${language || ''} ${label || ''}`.toLowerCase();
  const src = primaryLang(sourceLang);
  const lang = primaryLang(language);
  if (src && lang && lang === src) return true;
  if (src === 'en') return /\benglish\b|\bingiliz|\beng\b|(?:^|\s)en(?:\s|$|[-_\[(])/i.test(lab);
  if (src === 'tr') return /t[uü]rk|turkish/.test(lab);
  if (src === 'de') return /deutsch|german|almanca/.test(lab);
  if (src === 'es') return /spanish|espa[nñ]ol/.test(lab);
  if (src === 'fr') return /french|fran[cç]ais/.test(lab);
  if (src === 'pt') return /portuguese|portugu/.test(lab);
  if (src === 'it') return /italian|italiano/.test(lab);
  if (src === 'ja') return /japanese|日本語|japon/.test(lab);
  if (src === 'ko') return /korean|한국어|kore/.test(lab);
  if (src === 'zh') return /chinese|中文|çin/.test(lab);
  if (src === 'ar') return /arabic|عربي|arap/.test(lab);
  if (src === 'ru') return /russian|русск|rusça/.test(lab);
  return !!src && lab.includes(src);
}

export interface CaptionTrackLike {
  language?: string;
  label?: string;
  mode?: string;
  kind?: string;
}

export function isCaptionTrack(track: CaptionTrackLike): boolean {
  const kind = (track.kind || '').toLowerCase();
  if (kind === 'metadata' || kind === 'chapters' || kind === 'descriptions' || kind === 'thumbnails') {
    return false;
  }
  if (!kind) return true;
  return kind === 'captions' || kind === 'subtitles';
}

function isAutoCaptionLabel(label: string): boolean {
  return /\bauto(?:matic)?(?:[- ]generated)?\b|\bmachine\b|\bai\b/.test(label.toLowerCase());
}

export function selectPreferredCaptionTrack<T extends CaptionTrackLike>(
  tracks: T[],
  sourceLang: string,
  avoidLang?: string
): T | null {
  const captions = tracks.filter(isCaptionTrack);
  if (!captions.length) return null;
  const src = primaryLang(sourceLang);
  const avoid = primaryLang(avoidLang || '');
  const matching = captions.filter((track) =>
    trackMatchesSource(track.language || '', track.label || '', sourceLang)
  );
  if (matching.length) {
    return (
      matching.find((track) => track.mode?.toLowerCase() === 'showing') ||
      matching.find((track) => !isAutoCaptionLabel(track.label || '')) ||
      matching[0]
    );
  }
  if (!avoid || avoid === src) return null;
  return captions.find(
    (track) =>
      track.mode?.toLowerCase() === 'showing' &&
      !track.language?.trim() &&
      !track.label?.trim()
  ) || null;
}

export function captionSourceFingerprint(track: CaptionTrackLike | null, url = ''): string {
  const normalize = (value: string | undefined): string => (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const normalizeUrl = (raw: string): string => {
    if (!raw.trim()) return '';
    try {
      const parsed = new URL(raw, 'https://duetto.invalid');
      return `${parsed.origin === 'https://duetto.invalid' ? '' : parsed.origin}${parsed.pathname}`;
    } catch {
      return raw.split(/[?#]/, 1)[0];
    }
  };
  const identity = [normalize(track?.language), normalize(track?.label), normalizeUrl(url)].join('|');
  return identity === '||' ? '' : `v1:${identity}`;
}

export function selectCaptionResourceUrl(urls: string[], sourceLang: string, avoidLang?: string): string | null {
  const src = primaryLang(sourceLang);
  if (!src) return null;
  const avoid = primaryLang(avoidLang || '');
  const langToken = (code: string): RegExp => {
    const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[/?#&=_\\-.])${escaped}(?:$|[/?#&=_\\-.])`, 'i');
  };
  const urlMatchesLang = (url: string, code: string): boolean =>
    langToken(code).test(url) || (code === 'en' && /english/i.test(url)) || (code === 'tr' && /t(?:urkish|[uü]rk)/i.test(url));
  const isUdemyHost = (url: string): boolean => {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return (
        hostname === 'udemy.com' ||
        hostname.endsWith('.udemy.com') ||
        hostname === 'udemycdn.com' ||
        hostname.endsWith('.udemycdn.com')
      );
    } catch {
      return false;
    }
  };
  const isCaptionUrl = (url: string): boolean =>
    (/\.vtt(?:$|[?#])|\/(?:captions?|subtitles?)(?:\/|[?#])/i.test(url)) &&
    !/thumb-sprites|thumbnails|storyboard|preview|sprite/i.test(url);
  const byPath = new Map<string, string>();
  for (const url of urls) {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url) || !isUdemyHost(url) || !isCaptionUrl(url)) {
      continue;
    }
    let pathKey = url.split(/[?#]/, 1)[0];
    try {
      const parsed = new URL(url);
      pathKey = `${parsed.origin}${parsed.pathname}`;
    } catch {
      /* keep stripped url */
    }
    byPath.set(pathKey, url);
  }
  const candidates = [...byPath.values()];
  if (!candidates.length) return null;
  const matched = candidates.filter((url) => urlMatchesLang(url, src));
  if (matched.length) {
    return matched.find((url) => !isAutoCaptionLabel(url)) || matched[matched.length - 1];
  }
  const rest =
    avoid && avoid !== src
      ? candidates.filter((url) => !urlMatchesLang(url, avoid))
      : candidates;
  if (rest.length !== 1) return null;
  return rest[0];
}
