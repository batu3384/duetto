import { primaryLang, selectCaptionResourceUrl, trackMatchesSource } from './vttParser.ts';

const TRACK_CUE_WAIT_MS = 700;
const RESOURCE_WAIT_MS = 3000;
const API_TIMEOUT_MS = 4000;

export function isNumericLectureId(lectureId: string): boolean {
  return /^\d+$/.test(lectureId || '');
}

export function captionLocaleMatches(localeId: string, sourceLang: string): boolean {
  const loc = primaryLang(localeId);
  const src = primaryLang(sourceLang);
  return !!loc && !!src && loc === src;
}

/** Activate caption tracks so the browser loads VTT even when Udemy CC is off. */
export function activateCaptionTracks(
  video: HTMLVideoElement,
  isCaption: (track: TextTrack) => boolean
): void {
  const root =
    video.closest('.video-player--container, [data-purpose="video-container"], .video-js') ||
    video.parentElement;
  const videos = [...new Set([video, ...(root ? Array.from(root.querySelectorAll('video')) : [])])];
  for (const candidate of videos) {
    if (!candidate.textTracks) continue;
    for (const track of Array.from(candidate.textTracks)) {
      if (!isCaption(track)) continue;
      if (track.mode === 'disabled') track.mode = 'hidden';
    }
  }
}

type CueWaitTrack = {
  cues: { length: number } | null;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

export function waitForTrackCues(track: CueWaitTrack, timeoutMs = TRACK_CUE_WAIT_MS): Promise<void> {
  if (track.cues && track.cues.length > 0) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      track.removeEventListener('cuechange', onCueChange);
      resolve();
    };
    const onCueChange = () => {
      if (track.cues && track.cues.length > 0) finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    track.addEventListener('cuechange', onCueChange);
  });
}

export function findUdemyCourseId(doc: Document = document): string | null {
  const fromAttr = doc.querySelector('[data-course-id]')?.getAttribute('data-course-id')?.trim();
  if (fromAttr && /^\d+$/.test(fromAttr)) return fromAttr;
  const fromMeta = doc
    .querySelector('meta[property="udemy_com:course_id"], meta[name="course_id"]')
    ?.getAttribute('content')
    ?.trim();
  if (fromMeta && /^\d+$/.test(fromMeta)) return fromMeta;
  return null;
}

type UdemyCaptionAsset = {
  locale_id?: string | { locale?: string };
  locale?: string | { locale?: string };
  url?: string;
  download_url?: string;
  video_label?: string;
  title?: string;
};

function captionLocaleId(caption: UdemyCaptionAsset): string {
  const raw = caption.locale_id || caption.locale;
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') return raw.locale || '';
  return '';
}

function toCaptionResult(caption: UdemyCaptionAsset, sourceLang: string): { url: string; label: string } | null {
  const rawUrl = caption.url || caption.download_url;
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl, 'https://www.udemy.com');
    const host = parsed.hostname.toLowerCase();
    if (
      parsed.protocol !== 'https:' ||
      !(host === 'udemy.com' || host.endsWith('.udemy.com') || host === 'udemycdn.com' || host.endsWith('.udemycdn.com'))
    ) {
      return null;
    }
    const url = parsed.href;
    const label = caption.video_label || caption.title || captionLocaleId(caption) || sourceLang;
    return { url, label };
  } catch {
    return null;
  }
}

export function pickCaptionAsset(
  captions: UdemyCaptionAsset[],
  sourceLang: string,
  avoidLang?: string
): { url: string; label: string } | null {
  const sourceMatches = [
    ...captions.filter((c) => captionLocaleMatches(captionLocaleId(c), sourceLang)),
    ...captions.filter(
      (c) =>
        !captionLocaleMatches(captionLocaleId(c), sourceLang) &&
        trackMatchesSource(captionLocaleId(c), c.video_label || c.title || '', sourceLang)
    ),
  ];
  for (const sourceMatch of sourceMatches) {
    const result = toCaptionResult(sourceMatch, sourceLang);
    if (result) return result;
  }
  const src = primaryLang(sourceLang);
  const avoid = primaryLang(avoidLang || '');
  if (avoid && avoid !== src) {
    const candidates = captions.filter((caption) => caption.url || caption.download_url);
    if (candidates.length === 1) {
      const only = candidates[0];
      const locale = captionLocaleId(only);
      const label = only.video_label || only.title || '';
      if (!trackMatchesSource(locale, label, avoid)) return toCaptionResult(only, sourceLang);
    }
    return null;
  }
  const candidates = captions.filter((caption) => caption.url || caption.download_url);
  return candidates.length === 1 ? toCaptionResult(candidates[0], sourceLang) : null;
}

const CAPTION_NEGATIVE_CACHE_MS = 5000;
const COURSE_ID_NEGATIVE_CACHE_MS = 5000;
const captionUrlCache = new Map<
  string,
  { result: { url: string; label: string } | null; expiresAt: number }
>();
const captionUrlInflight = new Map<string, Promise<{ url: string; label: string } | null>>();

const courseIdCache = new Map<string, { id: string | null; expiresAt: number }>();

export function forgetUdemyCaptionCache(): void {
  captionUrlCache.clear();
  captionUrlInflight.clear();
  courseIdCache.clear();
}

export async function resolveNumericCourseId(courseId?: string | null): Promise<string | null> {
  const fromDom = findUdemyCourseId();
  if (fromDom) return fromDom;
  const raw = (courseId || '').trim();
  if (/^\d+$/.test(raw)) return raw;
  if (!raw || raw === 'current-course') return null;
  const cached = courseIdCache.get(raw);
  if (cached && (cached.expiresAt === Infinity || cached.expiresAt > Date.now())) return cached.id;
  if (cached) courseIdCache.delete(raw);
  try {
    const response = await fetch(
      `https://www.udemy.com/api-2.0/courses/${encodeURIComponent(raw)}/?fields[course]=id`,
      {
        credentials: 'include',
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      }
    );
    if (!response.ok) {
      courseIdCache.set(raw, { id: null, expiresAt: Date.now() + COURSE_ID_NEGATIVE_CACHE_MS });
      return null;
    }
    const data = (await response.json()) as { id?: number | string };
    const id = String(data?.id || '');
    const ok = /^\d+$/.test(id) ? id : null;
    courseIdCache.set(raw, { id: ok, expiresAt: ok ? Infinity : Date.now() + COURSE_ID_NEGATIVE_CACHE_MS });
    return ok;
  } catch {
    courseIdCache.set(raw, { id: null, expiresAt: Date.now() + COURSE_ID_NEGATIVE_CACHE_MS });
    return null;
  }
}

export function readNativeCaptionText(root: ParentNode = document): string {
  const selectors = [
    '[data-purpose="captions-cue-text"]',
    '[class*="captions-display--captions-cue"]',
    '.vjs-text-track-cue',
  ];
  for (const sel of selectors) {
    const parts: string[] = [];
    for (const el of root.querySelectorAll(sel)) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) parts.push(text);
    }
    if (parts.length) return [...new Set(parts)].join(' ');
  }
  return '';
}

export function readNativeCaptionLabel(root: ParentNode = document): string {
  const checked = root.querySelector(
    '[data-purpose="captions-dropdown"] [aria-checked="true"], [data-purpose="closed-captions-menu"] [aria-checked="true"], [class*="captions-menu"] [aria-checked="true"]'
  );
  const text = (checked?.textContent || '').replace(/\s+/g, ' ').trim();
  return text && text.length < 80 ? text : '';
}

async function fetchLectureCaptionsJson(apiUrl: string): Promise<UdemyCaptionAsset[] | null> {
  const response = await fetch(apiUrl, {
    credentials: 'include',
    headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    asset?: { captions?: UdemyCaptionAsset[] };
    captions?: UdemyCaptionAsset[];
  };
  const captions = data?.asset?.captions || data?.captions;
  return Array.isArray(captions) && captions.length ? captions : null;
}

export async function fetchUdemyCaptionUrl(
  lectureId: string,
  sourceLang: string,
  courseId?: string | null,
  avoidLang?: string
): Promise<{ url: string; label: string } | null> {
  if (!isNumericLectureId(lectureId)) return null;
  const src = (sourceLang || 'en').toLowerCase();
  const avoid = (avoidLang || '').toLowerCase();
  const key = `${lectureId}|${src}|${avoid}`;
  const cached = captionUrlCache.get(key);
  if (cached && (cached.expiresAt === Infinity || cached.expiresAt > Date.now())) {
    return cached.result;
  }
  if (cached) captionUrlCache.delete(key);
  const pending = captionUrlInflight.get(key);
  if (pending) return pending;

  const job = (async () => {
    const endpoints = [
      `https://www.udemy.com/api-2.0/lectures/${lectureId}/?fields[lecture]=asset,title&fields[asset]=captions`,
    ];
    const cid = await resolveNumericCourseId(courseId);
    if (cid) {
      endpoints.push(
        `https://www.udemy.com/api-2.0/users/me/subscribed-courses/${cid}/lectures/${lectureId}/?fields[lecture]=asset,title&fields[asset]=captions`,
        `https://www.udemy.com/api-2.0/courses/${cid}/subscriber-curriculum-items/${lectureId}/?fields[lecture]=asset&fields[asset]=captions`
      );
    }
    let result: { url: string; label: string } | null = null;
    for (const apiUrl of endpoints) {
      try {
        const captions = await fetchLectureCaptionsJson(apiUrl);
        if (!captions) continue;
        result = pickCaptionAsset(captions, src, avoid);
        if (result) break;
      } catch {
        /* timeout / network — try next, do not cache abort */
      }
    }
    captionUrlCache.set(key, {
      result,
      expiresAt: result ? Infinity : Date.now() + CAPTION_NEGATIVE_CACHE_MS,
    });
    return result;
  })().finally(() => {
    captionUrlInflight.delete(key);
  });

  captionUrlInflight.set(key, job);
  return job;
}

export function collectPerformanceCaptionUrls(): string[] {
  try {
    return performance
      .getEntriesByType('resource')
      .map((entry) => (entry as PerformanceResourceTiming).name);
  } catch {
    return [];
  }
}

export function collectDomCaptionUrls(doc: Document = document): string[] {
  const urls: string[] = [];
  const nodes = doc.querySelectorAll('track[src], [src*=".vtt"], [data-src*=".vtt"]');
  for (const el of nodes) {
    const raw = el.getAttribute('src') || el.getAttribute('data-src') || '';
    if (!raw) continue;
    try {
      urls.push(new URL(raw, doc.baseURI || 'https://www.udemy.com').href);
    } catch {
      /* skip */
    }
  }
  return urls;
}

export function collectKnownCaptionUrls(doc: Document = document): string[] {
  return [...collectPerformanceCaptionUrls(), ...collectDomCaptionUrls(doc)];
}

/** Watch for VTT fetches after tracks are activated (Udemy lazy-loads when CC is off). */
export function waitForCaptionResourceUrl(
  sourceLang: string,
  timeoutMs = RESOURCE_WAIT_MS,
  avoidLang?: string
): Promise<string | null> {
  const existing = selectCaptionResourceUrl(collectKnownCaptionUrls(), sourceLang, avoidLang);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    let observer: PerformanceObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (url: string | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      observer?.disconnect();
      resolve(url);
    };

    try {
      observer = new PerformanceObserver((list) => {
        const names = list.getEntries().map((entry) => entry.name);
        const url = selectCaptionResourceUrl([...collectKnownCaptionUrls(), ...names], sourceLang, avoidLang);
        if (url) finish(url);
      });
      observer.observe({ type: 'resource', buffered: true });
    } catch {
      finish(selectCaptionResourceUrl(collectKnownCaptionUrls(), sourceLang, avoidLang));
      return;
    }

    timer = setTimeout(
      () => finish(selectCaptionResourceUrl(collectKnownCaptionUrls(), sourceLang, avoidLang)),
      timeoutMs
    );
  });
}
