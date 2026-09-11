import { selectCaptionResourceUrl, trackMatchesSource } from './vttParser.ts';

const TRACK_CUE_WAIT_MS = 700;
const RESOURCE_WAIT_MS = 1000;
const API_TIMEOUT_MS = 4000;

export function isNumericLectureId(lectureId: string): boolean {
  return /^\d+$/.test(lectureId || '');
}

export function captionLocaleMatches(localeId: string, sourceLang: string): boolean {
  const loc = (localeId || '').toLowerCase().replace(/_/g, '-');
  const src = (sourceLang || 'en').toLowerCase();
  if (!loc || !src) return false;
  return loc === src || loc.startsWith(`${src}-`);
}

/** Activate caption tracks so the browser loads VTT even when Udemy CC is off. */
export function activateCaptionTracks(
  video: HTMLVideoElement,
  isCaption: (track: TextTrack) => boolean
): void {
  if (!video.textTracks) return;
  for (const track of Array.from(video.textTracks)) {
    if (!isCaption(track)) continue;
    if (track.mode === 'disabled') track.mode = 'hidden';
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

type UdemyCaptionAsset = { locale_id?: string; url?: string; video_label?: string; title?: string };

const captionUrlCache = new Map<string, { url: string; label: string } | null>();
const captionUrlInflight = new Map<string, Promise<{ url: string; label: string } | null>>();

export function forgetUdemyCaptionCache(): void {
  captionUrlCache.clear();
  captionUrlInflight.clear();
}

function pickCaptionAsset(
  captions: UdemyCaptionAsset[],
  sourceLang: string
): { url: string; label: string } | null {
  const match =
    captions.find((c) => captionLocaleMatches(c.locale_id || '', sourceLang)) ||
    captions.find((c) => trackMatchesSource(c.locale_id || '', c.video_label || c.title || '', sourceLang));
  if (!match?.url) return null;
  try {
    const url = new URL(match.url, 'https://www.udemy.com').href;
    const label = match.video_label || match.title || match.locale_id || sourceLang;
    return { url, label };
  } catch {
    return null;
  }
}

async function fetchLectureCaptionsJson(apiUrl: string): Promise<UdemyCaptionAsset[] | null> {
  const response = await fetch(apiUrl, {
    credentials: 'include',
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
  courseId?: string | null
): Promise<{ url: string; label: string } | null> {
  if (!isNumericLectureId(lectureId)) return null;
  const src = (sourceLang || 'en').toLowerCase();
  const key = `${lectureId}|${src}`;
  if (captionUrlCache.has(key)) return captionUrlCache.get(key) || null;
  const pending = captionUrlInflight.get(key);
  if (pending) return pending;

  const job = (async () => {
    const endpoints = [
      `https://www.udemy.com/api-2.0/lectures/${lectureId}/?fields[lecture]=asset&fields[asset]=captions`,
    ];
    const cid = courseId || findUdemyCourseId();
    if (cid && /^\d+$/.test(cid)) {
      endpoints.push(
        `https://www.udemy.com/api-2.0/courses/${cid}/subscriber-curriculum-items/${lectureId}/?fields[lecture]=asset&fields[asset]=captions`
      );
    }
    let result: { url: string; label: string } | null = null;
    let completed = false;
    for (const apiUrl of endpoints) {
      try {
        const captions = await fetchLectureCaptionsJson(apiUrl);
        completed = true;
        if (!captions) continue;
        result = pickCaptionAsset(captions, src);
        if (result) break;
      } catch {
        /* timeout / network — try next, do not cache abort */
      }
    }
    if (result || completed) captionUrlCache.set(key, result);
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

/** Watch for VTT fetches after tracks are activated (Udemy lazy-loads when CC is off). */
export function waitForCaptionResourceUrl(sourceLang: string, timeoutMs = RESOURCE_WAIT_MS): Promise<string | null> {
  const existing = selectCaptionResourceUrl(collectPerformanceCaptionUrls(), sourceLang);
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
        const url = selectCaptionResourceUrl([...collectPerformanceCaptionUrls(), ...names], sourceLang);
        if (url) finish(url);
      });
      observer.observe({ type: 'resource', buffered: true });
    } catch {
      finish(selectCaptionResourceUrl(collectPerformanceCaptionUrls(), sourceLang));
      return;
    }

    timer = setTimeout(
      () => finish(selectCaptionResourceUrl(collectPerformanceCaptionUrls(), sourceLang)),
      timeoutMs
    );
  });
}
