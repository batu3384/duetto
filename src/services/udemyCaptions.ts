import { selectCaptionResourceUrl, trackMatchesSource } from './vttParser.ts';

const TRACK_CUE_WAIT_MS = 4000;
const RESOURCE_WAIT_MS = 3000;

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

export function waitForTrackCues(track: TextTrack, timeoutMs = TRACK_CUE_WAIT_MS): Promise<void> {
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
  const match = doc.documentElement.innerHTML.match(/"course_id"\s*:\s*(\d+)/);
  return match ? match[1] : null;
}

type UdemyCaptionAsset = { locale_id?: string; url?: string; video_label?: string };

export async function fetchUdemyCaptionUrl(
  lectureId: string,
  sourceLang: string,
  courseId?: string | null
): Promise<{ url: string; label: string } | null> {
  const cid = courseId || findUdemyCourseId();
  if (!cid || !lectureId) return null;
  const apiUrl = `https://www.udemy.com/api-2.0/courses/${cid}/subscriber-curriculum-items/${lectureId}/?fields=asset&fields[asset]=captions`;
  try {
    const response = await fetch(apiUrl, {
      credentials: 'include',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { asset?: { captions?: UdemyCaptionAsset[] } };
    const captions = data?.asset?.captions;
    if (!Array.isArray(captions) || !captions.length) return null;
    const match =
      captions.find((c) => captionLocaleMatches(c.locale_id || '', sourceLang)) ||
      captions.find((c) => trackMatchesSource(c.locale_id || '', c.video_label || '', sourceLang));
    if (!match?.url) return null;
    const label = match.video_label || match.locale_id || sourceLang;
    return { url: match.url, label };
  } catch {
    return null;
  }
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
    const finish = (url: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      observer.disconnect();
      resolve(url);
    };

    const observer = new PerformanceObserver((list) => {
      const names = list.getEntries().map((entry) => entry.name);
      const url = selectCaptionResourceUrl([...collectPerformanceCaptionUrls(), ...names], sourceLang);
      if (url) finish(url);
    });

    try {
      observer.observe({ type: 'resource', buffered: true });
    } catch {
      finish(null);
      return;
    }

    const timer = setTimeout(() => finish(selectCaptionResourceUrl(collectPerformanceCaptionUrls(), sourceLang)), timeoutMs);
  });
}
