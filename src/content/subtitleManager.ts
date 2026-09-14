import { SubtitleCue, CourseTranscript } from '../types';
import {
  parseVTT,
  primaryLang,
  cleanVttText,
  isRealSubtitleText,
  cueAtTime,
  cueTranslationCoverage,
  isCaptionTrack,
  trackMatchesSource,
  selectPreferredCaptionTrack,
  captionSourceFingerprint,
  selectCaptionResourceUrl,
  liveWindowCues,
} from '../services/vttParser';
import { getTranscript, saveTranscript, transcriptStorageId, transcriptTranslationFingerprint } from '../services/db';
import { getPageSettings } from '../services/storage';
import {
  activateCaptionTracks,
  collectKnownCaptionUrls,
  fetchUdemyCaptionUrl,
  forgetUdemyCaptionCache,
  readNativeCaptionLabel,
  readNativeCaptionText,
  waitForCaptionResourceUrl,
  waitForTrackCues,
} from '../services/udemyCaptions';
import { shadowOverlay } from './overlay/shadowRoot';
import { formatSourceStatus, shouldRetryCaptionSearch, cacheMatchesCaptionSource } from './captionSearchState';
import type { TranslationPatch } from '../services/translator/gemini';

function isValidCaptionTrack(track: TextTrack): boolean {
  if (!track) return false;
  if (!isCaptionTrack(track)) return false;
  const label = (track.label || '').toLowerCase();
  if (/thumbnail|sprite|storyboard|preview|seek/i.test(label)) {
    return false;
  }
  return true;
}

function userTranslationError(raw: string): string {
  const msg = (raw || '').trim();
  if (!msg) return 'Gemini çevirisi başarısız. Anahtarı Gemini sekmesinde test edin.';
  if (/anahtarı yok|anahtarı girilmedi|api anahtarı/i.test(msg)) {
    return 'Gemini anahtarı gerekli — uzantı simgesi → Gemini';
  }
  if (/günlük kota|dakikalık istek|kotası|quota|429/i.test(msg)) return msg;
  if (/geçersiz|invalid|403|404/i.test(msg)) return msg;
  return msg.length > 96 ? `${msg.slice(0, 93)}…` : msg;
}

function needsTranslation(settings: { sourceLang?: string; targetLang?: string }): boolean {
  return primaryLang(settings.sourceLang || 'en') !== primaryLang(settings.targetLang || 'tr');
}

function cacheLooksTranslated(cues: SubtitleCue[]): boolean {
  if (!cues.length) return false;
  if (cues.some((c) => !isRealSubtitleText(c.text))) return false;
  return cueTranslationCoverage(cues) >= 0.95;
}

const SOURCE_ERROR = 'Kaynak altyazı bulunamadı. Videoyu oynatın veya “Altyazıyı yenile” seçin.';
const CAPTION_POLL_INTERVAL_MS = 1000;
const CAPTION_POLL_ATTEMPTS = 12;
const CAPTION_FETCH_TIMEOUT_MS = 8000;
const CAPTION_SEARCH_DEADLINE_MS = 12000;
const MAX_CAPTION_TEXT_LENGTH = 8_000_000;
const TRANSLATE_REQUEST_TIMEOUT_MS = 90000;
const TRANSLATE_HANG_MS = 180000;

interface CaptionSource {
  track: TextTrack | null;
  url: string;
  fingerprint: string;
  label: string;
}

function isTrustedCaptionUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === 'https:' &&
      (host === 'udemy.com' ||
        host.endsWith('.udemy.com') ||
        host === 'udemycdn.com' ||
        host.endsWith('.udemycdn.com'))
    );
  } catch {
    return false;
  }
}

function trackElementUrl(element: HTMLTrackElement): string {
  const raw = element.src || element.getAttribute('src') || element.dataset.src || '';
  if (!raw) return '';
  try {
    const url = new URL(raw, document.baseURI).href;
    return isTrustedCaptionUrl(url) ? url : '';
  } catch {
    return '';
  }
}

function fetchCaptionVttViaBackground(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (text: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(text);
    };
    const timeout = window.setTimeout(() => finish(null), CAPTION_FETCH_TIMEOUT_MS);
    try {
      chrome.runtime.sendMessage({ type: 'FETCH_CAPTION_VTT', url }, (response) => {
        if (chrome.runtime.lastError || !response?.success || typeof response.text !== 'string') {
          finish(null);
          return;
        }
        finish(response.text);
      });
    } catch {
      finish(null);
    }
  });
}

async function fetchCaptionText(url: string): Promise<string | null> {
  if (!isTrustedCaptionUrl(url)) return null;
  try {
    const sameOrigin = new URL(url, document.baseURI).origin === window.location.origin;
    const response = await fetch(url, {
      credentials: sameOrigin ? 'include' : 'omit',
      signal: AbortSignal.timeout(CAPTION_FETCH_TIMEOUT_MS),
    });
    if (response.ok) {
      const text = await response.text();
      if (text.length <= MAX_CAPTION_TEXT_LENGTH && /-->/m.test(text)) return text;
    }
  } catch (error) {
    console.warn('[Duetto] Failed to fetch track src:', error);
  }
  return fetchCaptionVttViaBackground(url);
}

export class SubtitleManager {
  private cues: SubtitleCue[] = [];
  private currentCue: SubtitleCue | null = null;
  private currentLectureId: string = '';
  private currentCourseId: string = '';
  private currentLectureTitle: string = '';
  private currentCourseTitle: string = '';
  private isTranslating: boolean = false;
  private liveInflight: boolean = false;
  private liveQueued: boolean = false;
  private swTranslatePending: boolean = false;
  private extractInFlight: boolean = false;
  private liveTimer: ReturnType<typeof setTimeout> | null = null;
  private translationHint: string | null = null;
  private translateReq: number = 0;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: ((cue: SubtitleCue | null) => void)[] = [];
  private transcriptListeners: ((cues: SubtitleCue[]) => void)[] = [];
  private trackPollInterval: ReturnType<typeof setInterval> | null = null;
  private trackRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private searchDeadlineTimer: ReturnType<typeof setTimeout> | null = null;
  private activeVideo: HTMLVideoElement | null = null;
  private trackChangeHandler: (() => void) | null = null;
  private trackList: TextTrackList | null = null;
  private sourceFingerprint = '';
  private sourceLabel = '';
  private sourceLoading = false;
  private sourceError: string | null = null;
  private nativeSourceLang = 'en';
  private nativeTargetLang = 'tr';

  public onCueChange(listener: (cue: SubtitleCue | null) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public onTranscriptLoaded(listener: (cues: SubtitleCue[]) => void): () => void {
    this.transcriptListeners.push(listener);
    return () => {
      this.transcriptListeners = this.transcriptListeners.filter((l) => l !== listener);
    };
  }

  public getCues(): SubtitleCue[] {
    return this.cues;
  }

  public getCurrentCue(): SubtitleCue | null {
    return this.currentCue;
  }

  public isTranslatingNow(): boolean {
    return this.isTranslating || this.liveInflight || this.swTranslatePending;
  }

  public getTranslationHint(): string | null {
    return this.translationHint;
  }

  public getSourceLabel(): string {
    return this.sourceLabel || (this.sourceLoading ? 'Altyazı aranıyor…' : this.cues.length ? 'Kaynak altyazı' : '');
  }

  public getSourceStatusText(): string {
    return formatSourceStatus(this.sourceError, this.sourceLabel, this.sourceLoading);
  }

  public getSourceError(): string | null {
    return this.sourceError;
  }

  public isSourceLoading(): boolean {
    return this.sourceLoading;
  }

  private setTranslationHint(msg: string | null): void {
    this.translationHint = msg;
    this.notifyCueChange(this.currentCue);
  }

  private nativeCaptionRoot(video = this.activeVideo): ParentNode {
    return (
      video?.closest('.video-player--container, [data-purpose="video-container"], .video-js') ||
      video?.parentElement ||
      document
    );
  }

  private nativeCaptionMatchesSource(
    sourceLang: string,
    targetLang: string,
    root: ParentNode,
    video = this.activeVideo
  ): boolean {
    const label = readNativeCaptionLabel(root);
    if (label) {
      if (trackMatchesSource('', label, sourceLang)) return true;
      return !trackMatchesSource('', label, targetLang);
    }
    return !Array.from(video?.textTracks || []).some(
      (track) =>
        track.mode?.toLowerCase() === 'showing' &&
        trackMatchesSource(track.language || '', track.label || '', targetLang) &&
        !trackMatchesSource(track.language || '', track.label || '', sourceLang)
    );
  }

  public updateTime(currentTime: number): void {
    if (this.cues.length === 0 || this.cues[0]?.id.startsWith('native-')) {
      this.syncNativeCue(currentTime);
      if (this.cues.length === 0) return;
    }
    const matchingCue = cueAtTime(this.cues, currentTime);
    if (matchingCue?.id !== this.currentCue?.id || matchingCue?.translation !== this.currentCue?.translation) {
      this.currentCue = matchingCue;
      this.notifyCueChange(matchingCue);
    }
    if (matchingCue && !matchingCue.translation) this.nudgeLive(currentTime);
  }

  private syncNativeCue(currentTime: number): void {
    const root = this.nativeCaptionRoot();
    if (!this.nativeCaptionMatchesSource(this.nativeSourceLang, this.nativeTargetLang, root)) return;
    const text = readNativeCaptionText(root);
    if (!text || !isRealSubtitleText(text)) return;
    const existing = this.cues.find((cue) => cue.text === text);
    if (existing) {
      existing.endTime = Math.max(existing.endTime, currentTime + 4);
      this.currentCue = existing;
      this.sourceLoading = false;
      this.sourceError = null;
      this.markNativeSource(readNativeCaptionLabel(root) || 'Kaynak altyazı');
      this.notifyCueChange(existing);
      if (!existing.translation) this.nudgeLive(currentTime);
      return;
    }
    const cue: SubtitleCue = {
      id: `native-${this.cues.length}`,
      startTime: Math.max(0, currentTime - 0.15),
      endTime: currentTime + 6,
      text,
    };
    this.cues = [...this.cues.filter((item) => item.id.startsWith('native-')), cue].slice(-24);
    this.sourceLoading = false;
    this.sourceError = null;
    this.markNativeSource(readNativeCaptionLabel(root) || 'Kaynak altyazı');
    this.currentCue = cue;
    this.notifyCueChange(cue);
    this.nudgeLive(currentTime);
  }

  public rebindVideo(video: HTMLVideoElement): void {
    this.activeVideo = video;
    this.updateTime(video.currentTime);
    if (this.cues.length && !cacheLooksTranslated(this.cues)) {
      void this.kickTranslate(video.currentTime);
    }
  }

  private notifyCueChange(cue: SubtitleCue | null): void {
    this.listeners.forEach((l) => l(cue));
  }

  public reset(): void {
    this.translateReq += 1;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = null;
    if (this.trackPollInterval) clearInterval(this.trackPollInterval);
    this.trackPollInterval = null;
    if (this.trackRefreshTimer) clearTimeout(this.trackRefreshTimer);
    this.trackRefreshTimer = null;
    if (this.searchDeadlineTimer) clearTimeout(this.searchDeadlineTimer);
    this.searchDeadlineTimer = null;
    this.detachTrackHandler();
    this.cues = [];
    this.currentCue = null;
    this.isTranslating = false;
    this.liveInflight = false;
    this.liveQueued = false;
    this.swTranslatePending = false;
    this.extractInFlight = false;
    if (this.liveTimer) clearTimeout(this.liveTimer);
    this.liveTimer = null;
    this.translationHint = null;
    this.activeVideo = null;
    this.sourceFingerprint = '';
    this.sourceLabel = '';
    this.sourceLoading = false;
    this.sourceError = null;
    this.nativeSourceLang = 'en';
    this.nativeTargetLang = 'tr';
    this.notifyCueChange(null);
  }

  private detachTrackHandler(): void {
    if (this.trackList && this.trackChangeHandler) {
      this.trackList.removeEventListener('change', this.trackChangeHandler);
      this.trackList.removeEventListener('addtrack', this.trackChangeHandler);
    }
    this.trackList = null;
    this.trackChangeHandler = null;
  }

  public async loadSubtitlesForVideo(video: HTMLVideoElement, opts?: { skipCache?: boolean }): Promise<void> {
    this.activeVideo = video;
    this.translateReq += 1;
    if (this.trackPollInterval) clearInterval(this.trackPollInterval);
    this.trackPollInterval = null;
    if (this.trackRefreshTimer) clearTimeout(this.trackRefreshTimer);
    this.trackRefreshTimer = null;
    this.isTranslating = false;
    this.liveInflight = false;
    this.liveQueued = false;
    this.swTranslatePending = false;
    this.extractInFlight = false;
    if (this.liveTimer) clearTimeout(this.liveTimer);
    this.liveTimer = null;
    if (this.searchDeadlineTimer) clearTimeout(this.searchDeadlineTimer);
    this.searchDeadlineTimer = null;
    this.cues = [];
    this.currentCue = null;
    this.sourceFingerprint = '';
    this.sourceLabel = '';
    this.sourceLoading = true;
    this.sourceError = null;
    this.translationHint = null;
    this.notifyCueChange(null);
    const req = this.translateReq;
    this.extractCourseAndLectureInfo();
    if (opts?.skipCache) forgetUdemyCaptionCache();

    activateCaptionTracks(video, isValidCaptionTrack);

    if (video.textTracks) {
      this.detachTrackHandler();
      this.trackList = video.textTracks;
      this.trackChangeHandler = () => {
        if (this.trackRefreshTimer) clearTimeout(this.trackRefreshTimer);
        this.trackRefreshTimer = setTimeout(() => {
          this.trackRefreshTimer = null;
          void getPageSettings()
            .then((currentSettings) => {
              if (this.activeVideo !== video || this.translateReq !== req) return;
              const source = this.findCaptionSource(
                video,
                currentSettings.sourceLang || 'en',
                currentSettings.targetLang || 'tr'
              );
              const needsRetry = shouldRetryCaptionSearch({
                hasCues: this.cues.length > 0,
                sourceError: !!this.sourceError,
                nativeOnly: this.cues.length > 0 && this.cues.every((cue) => cue.id.startsWith('native-')),
              });
              if (!source?.fingerprint || source.fingerprint === this.sourceFingerprint) {
                if (needsRetry) this.retryCaptionSearch(video);
                return;
              }
              void this.loadSubtitlesForVideo(video, { skipCache: true });
            })
            .catch(() => {
              /* stale context or track disappeared */
            });
        }, 250);
      };
      this.trackList.addEventListener('change', this.trackChangeHandler);
      this.trackList.addEventListener('addtrack', this.trackChangeHandler);
    }

    this.searchDeadlineTimer = setTimeout(() => {
      void getPageSettings()
        .then((currentSettings) => {
          if (this.translateReq !== req || this.cues.length) return;
          if (this.extractInFlight || this.trackPollInterval) return;
          const root = this.nativeCaptionRoot(video);
          const native = readNativeCaptionText(root);
          if (
            native &&
            isRealSubtitleText(native) &&
            this.nativeCaptionMatchesSource(
              currentSettings.sourceLang || 'en',
              currentSettings.targetLang || 'tr',
              root,
              video
            )
          ) {
            this.sourceLoading = false;
            this.sourceError = null;
            this.markNativeSource(readNativeCaptionLabel(root) || 'Kaynak altyazı');
            this.syncNativeCue(video.currentTime);
            return;
          }
          this.sourceLoading = false;
          this.sourceError = SOURCE_ERROR;
          this.setTranslationHint(SOURCE_ERROR);
        })
        .catch(() => {
          if (this.translateReq !== req || this.cues.length) return;
          if (this.extractInFlight || this.trackPollInterval) return;
          this.sourceLoading = false;
          this.sourceError = SOURCE_ERROR;
          this.setTranslationHint(SOURCE_ERROR);
        });
    }, CAPTION_SEARCH_DEADLINE_MS);

    const settings = await getPageSettings();
    if (this.translateReq !== req) return;
    const sourceLang = settings.sourceLang || 'en';
    const targetLang = settings.targetLang || 'tr';
    this.nativeSourceLang = sourceLang;
    this.nativeTargetLang = targetLang;
    const source = this.findCaptionSource(video, sourceLang, targetLang);
    this.sourceFingerprint = source?.fingerprint || '';
    this.sourceLabel = source?.label || '';
    this.notifyCueChange(this.currentCue);
    const storageId = transcriptStorageId(
      this.currentLectureId,
      sourceLang,
      targetLang
    );
    const translationFingerprint = transcriptTranslationFingerprint(settings);

    if (!opts?.skipCache && this.currentLectureId) {
      const cached = await getTranscript(storageId);
      if (this.translateReq !== req) return;
      const cacheMatchesSource = cacheMatchesCaptionSource(cached?.sourceFingerprint, source?.fingerprint || '');
      const cacheMatchesTranslation = cached?.translationFingerprint === translationFingerprint;
      if (
        cacheMatchesSource &&
        cacheMatchesTranslation &&
        cached?.cues?.length &&
        !cached.cues.some((c) => !isRealSubtitleText(c.text))
      ) {
        if (!this.sourceFingerprint && cached.sourceFingerprint) {
          this.sourceFingerprint = cached.sourceFingerprint;
        }
        this.applyLoadedCues(cached.cues, video);
        if (cacheLooksTranslated(cached.cues)) return;
        await this.kickTranslate(video.currentTime);
        return;
      }
    }

    this.extractInFlight = true;
    let cues: SubtitleCue[] | null = null;
    try {
      cues = await this.extractAllCues(video, req, { wait: true });
    } finally {
      this.extractInFlight = false;
    }
    if (this.translateReq !== req) return;
    if (cues && cues.length > 0) {
      this.applyLoadedCues(cues, video);
      await this.kickTranslate(video.currentTime);
      if (cues.every((cue) => cue.id.startsWith('native-'))) this.startTrackPolling(video);
    } else {
      this.startTrackPolling(video);
    }
  }

  private applyLoadedCues(cues: SubtitleCue[], video: HTMLVideoElement): void {
    this.cues = cues;
    this.sourceLoading = false;
    this.sourceError = null;
    if (!this.sourceLabel && cues.length) this.sourceLabel = 'Kaynak altyazı';
    if (this.searchDeadlineTimer) {
      clearTimeout(this.searchDeadlineTimer);
      this.searchDeadlineTimer = null;
    }
    this.transcriptListeners.forEach((l) => l(this.cues));
    this.updateTime(video.currentTime);
    this.notifyCueChange(this.currentCue);
  }

  private async extractAllCues(
    video: HTMLVideoElement,
    expectedRequestId = this.translateReq,
    opts?: { wait?: boolean; skipApi?: boolean }
  ): Promise<SubtitleCue[] | null> {
    const wait = opts?.wait === true;
    const settings = await getPageSettings();
    if (expectedRequestId !== this.translateReq || this.activeVideo !== video) return null;
    const targetSourceLang = (settings.sourceLang || 'en').toLowerCase();
    const targetLang = (settings.targetLang || 'tr').toLowerCase();
    const source = this.findCaptionSource(video, targetSourceLang, targetLang);
    if (expectedRequestId !== this.translateReq || this.activeVideo !== video) return null;
    if (source?.fingerprint) this.sourceFingerprint = source.fingerprint;
    if (source?.label) this.sourceLabel = source.label;

    if (source?.track) {
      if (wait) await waitForTrackCues(source.track);
      if (expectedRequestId !== this.translateReq || this.activeVideo !== video) return null;
      if (source.track.cues && source.track.cues.length > 0) {
        const extracted = this.convertTextTrackToCues(source.track);
        if (extracted.length > 0) return extracted;
      }
    }

    const directUrl = source?.url || '';
    if (directUrl) {
      const vttText = await fetchCaptionText(directUrl);
      if (expectedRequestId !== this.translateReq || this.activeVideo !== video) return null;
      if (vttText) {
        const parsed = parseVTT(vttText);
        if (parsed.length > 0) return parsed;
      }
    }

    if (!opts?.skipApi) {
      const apiCaption = await fetchUdemyCaptionUrl(
        this.currentLectureId,
        targetSourceLang,
        this.currentCourseId,
        targetLang
      );
      if (expectedRequestId !== this.translateReq || this.activeVideo !== video) return null;
      if (apiCaption?.url) {
        const apiText = await fetchCaptionText(apiCaption.url);
        if (expectedRequestId !== this.translateReq || this.activeVideo !== video) return null;
        if (apiText) {
          const parsed = parseVTT(apiText);
          if (parsed.length > 0) {
            this.sourceLabel = apiCaption.label;
            this.sourceFingerprint = captionSourceFingerprint(
              { language: targetSourceLang, label: apiCaption.label },
              apiCaption.url
            );
            return parsed;
          }
        }
      }
    }

    let resourceUrl = selectCaptionResourceUrl(collectKnownCaptionUrls(), targetSourceLang, targetLang);
    if (!resourceUrl && wait) resourceUrl = await waitForCaptionResourceUrl(targetSourceLang, undefined, targetLang);
    if (expectedRequestId !== this.translateReq || this.activeVideo !== video) return null;
    if (resourceUrl) {
      const resourceText = await fetchCaptionText(resourceUrl);
      if (expectedRequestId !== this.translateReq || this.activeVideo !== video) return null;
      if (resourceText) {
        const parsed = parseVTT(resourceText);
        if (parsed.length > 0) {
          const label = source?.label || `${targetSourceLang.toUpperCase()} (network)`;
          this.sourceLabel = label;
          this.sourceFingerprint = captionSourceFingerprint(
            { language: targetSourceLang, label },
            resourceUrl
          );
          return parsed;
        }
      }
    }

    const nativeRoot = this.nativeCaptionRoot(video);
    const native = readNativeCaptionText(nativeRoot);
    if (
      native &&
      isRealSubtitleText(native) &&
      this.nativeCaptionMatchesSource(targetSourceLang, targetLang, nativeRoot, video)
    ) {
      this.markNativeSource(readNativeCaptionLabel(nativeRoot) || 'Kaynak altyazı');
      this.sourceError = null;
      return [
        {
          id: 'native-0',
          startTime: Math.max(0, video.currentTime - 0.15),
          endTime: video.currentTime + 6,
          text: native,
        },
      ];
    }

    return null;
  }

  private findCaptionSource(video: HTMLVideoElement, sourceLang: string, targetLang?: string): CaptionSource | null {
    const root =
      video.closest('.video-player--container, [data-purpose="video-container"], .video-js') || video;
    const trackElements = Array.from(root.querySelectorAll('track')).filter((el) => isCaptionTrack(el));
    const videos = new Set<HTMLVideoElement>([video, ...Array.from(root.querySelectorAll('video'))]);
    const validTracks = [...videos].flatMap((el) =>
      el.textTracks ? Array.from(el.textTracks).filter(isValidCaptionTrack) : []
    );
    const matchingTrack = selectPreferredCaptionTrack(validTracks, sourceLang, targetLang);

    if (matchingTrack) {
      const trackElement = trackElements.find((el) => el.track === matchingTrack) || null;
      const language = matchingTrack.language || trackElement?.srclang || '';
      const label = matchingTrack.label || trackElement?.label || language || 'Kaynak altyazı';
      const url = trackElement ? trackElementUrl(trackElement) : '';
      return {
        track: matchingTrack,
        url,
        fingerprint: captionSourceFingerprint({ language, label }, url),
        label,
      };
    }

    const trackElement = trackElements.find((el) =>
      trackMatchesSource(el.srclang || '', el.label || '', sourceLang)
    ) || null;
    if (!trackElement) return null;
    const language = trackElement.srclang || '';
    const label = trackElement.label || language || 'Kaynak altyazı';
    return {
      track: trackElement.track || null,
      url: trackElementUrl(trackElement),
      fingerprint: captionSourceFingerprint({ language, label }, trackElementUrl(trackElement)),
      label,
    };
  }

  private retryCaptionSearch(video: HTMLVideoElement): void {
    this.sourceError = null;
    if (this.cues.length === 0) {
      this.sourceLoading = true;
      this.setTranslationHint(null);
    } else {
      this.notifyCueChange(this.currentCue);
    }
    this.startTrackPolling(video);
  }

  private markNativeSource(label: string): void {
    this.sourceLabel = this.sourceLabel || label;
    if (!this.sourceFingerprint) {
      this.sourceFingerprint = captionSourceFingerprint(
        { language: this.nativeSourceLang, label: this.sourceLabel },
        'native'
      );
    }
  }

  private startTrackPolling(video: HTMLVideoElement): void {
    if (this.trackPollInterval) clearInterval(this.trackPollInterval);
    this.trackPollInterval = null;
    let attempts = 0;
    const pollReq = this.translateReq;
    let pollBusy = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      if (pollBusy) return;
      if (this.translateReq !== pollReq) {
        if (interval) clearInterval(interval);
        if (this.trackPollInterval === interval) this.trackPollInterval = null;
        return;
      }
      pollBusy = true;
      attempts++;
      try {
        const nativeAlreadyLoaded =
          this.cues.length > 0 && this.cues.every((cue) => cue.id.startsWith('native-'));
        const cues = await this.extractAllCues(video, pollReq, {
          skipApi: nativeAlreadyLoaded && attempts % 4 !== 0,
        });
        const nativeOnly = !!cues?.length && cues.every((cue) => cue.id.startsWith('native-'));
        if (cues && cues.length > 0 && !nativeOnly) {
          if (interval) clearInterval(interval);
          if (this.trackPollInterval === interval) this.trackPollInterval = null;
          if (this.translateReq !== pollReq) return;
          this.applyLoadedCues(cues, video);
          await this.kickTranslate(video.currentTime);
        } else if (nativeOnly && this.cues.length === 0) {
          this.applyLoadedCues(cues, video);
          await this.kickTranslate(video.currentTime);
        } else if (
          this.cues.length > 0 &&
          this.cues.every((cue) => cue.id.startsWith('native-')) &&
          attempts >= CAPTION_POLL_ATTEMPTS
        ) {
          if (interval) clearInterval(interval);
          if (this.trackPollInterval === interval) this.trackPollInterval = null;
        } else if (
          attempts >= CAPTION_POLL_ATTEMPTS &&
          this.translateReq === pollReq &&
          this.activeVideo === video &&
          this.cues.length === 0
        ) {
          if (interval) clearInterval(interval);
          if (this.trackPollInterval === interval) this.trackPollInterval = null;
          this.sourceLoading = false;
          this.sourceError = SOURCE_ERROR;
          this.setTranslationHint(SOURCE_ERROR);
        }
      } finally {
        pollBusy = false;
      }
    };

    void tick();
    interval = setInterval(() => {
      void tick();
    }, CAPTION_POLL_INTERVAL_MS);
    this.trackPollInterval = interval;
  }

  public applyTranslationPatches(patches: TranslationPatch[], meta?: { lectureId?: string; requestId?: number }): void {
    if (!patches.length) return;
    if (meta?.lectureId && meta.lectureId !== this.currentLectureId) return;
    if (typeof meta?.requestId === 'number' && meta.requestId !== this.translateReq) return;

    const byId = new Map(patches.map((p) => [p.id, p.translation]));
    this.cues = this.cues.map((c) => {
      const next = byId.get(c.id);
      return next ? { ...c, translation: next } : c;
    });
    if (this.translationHint && this.cues.some((c) => c.translation)) {
      this.translationHint = null;
    }
    const cur = this.currentCue;
    if (cur && byId.has(cur.id)) {
      this.currentCue = this.cues.find((c) => c.id === cur.id) || cur;
      this.notifyCueChange(this.currentCue);
    }
    this.transcriptListeners.forEach((l) => l(this.cues));
    this.schedulePersist();
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persistTranscript();
    }, 400);
  }

  private async persistTranscript(): Promise<void> {
    if (!this.currentLectureId || !this.sourceFingerprint || !this.cues.some((c) => c.translation)) return;
    const settings = await getPageSettings();
    const transcript: CourseTranscript = {
      id: transcriptStorageId(
        this.currentLectureId,
        settings.sourceLang || 'en',
        settings.targetLang || 'tr'
      ),
      lectureId: this.currentLectureId,
      courseId: this.currentCourseId,
      courseTitle: this.currentCourseTitle,
      lectureTitle: this.currentLectureTitle,
      cues: this.cues,
      language: settings.sourceLang || 'en',
      translatedLanguage: settings.targetLang || 'tr',
      sourceFingerprint: this.sourceFingerprint,
      translationFingerprint: transcriptTranslationFingerprint(settings),
      updatedAt: Date.now(),
    };
    await saveTranscript(transcript);
  }

  public nudgeLive(aroundTime: number): void {
    const cue = cueAtTime(this.cues, aroundTime);
    if (!cue || cue.translation?.trim()) return;
    if (this.liveInflight || this.swTranslatePending) {
      this.liveQueued = true;
      return;
    }
    if (this.liveTimer) return;
    this.liveTimer = setTimeout(() => {
      this.liveTimer = null;
      void this.ensureLive(this.activeVideo?.currentTime ?? aroundTime);
    }, 80);
  }

  private async kickTranslate(aroundTime: number): Promise<void> {
    await this.ensureLive(aroundTime);
  }

  public async ensureLive(aroundTime: number): Promise<void> {
    if (this.liveInflight || this.swTranslatePending) {
      this.liveQueued = true;
      return;
    }
    if (this.cues.length === 0) return;
    const settings = await getPageSettings();
    if (!settings.dualSubtitlesEnabled) {
      this.setTranslationHint(null);
      return;
    }
    const requestId = this.translateReq;
    const lectureId = this.currentLectureId;
    if (!needsTranslation(settings)) {
      const patches = this.cues
        .filter((cue) => !cue.translation?.trim())
        .map((cue) => ({ id: cue.id, translation: cue.text }));
      this.applyTranslationPatches(patches, { lectureId, requestId });
      this.setTranslationHint(null);
      return;
    }
    if (!settings.geminiKeyConfigured) {
      this.setTranslationHint('Gemini anahtarı gerekli — uzantı simgesi → Gemini');
      return;
    }
    const windowCues = liveWindowCues(this.cues, aroundTime)
      .filter((c) => !c.translation?.trim())
      .slice(0, 12);
    if (!windowCues.length) return;

    this.liveInflight = true;
    this.isTranslating = true;
    this.setTranslationHint(null);
    try {
      const response = await this.sendTranslate(
        windowCues,
        aroundTime,
        transcriptTranslationFingerprint(settings),
        settings.sourceLang || 'en',
        settings.targetLang || 'tr'
      );
      if (requestId === this.translateReq && lectureId === this.currentLectureId) {
        this.mergeTranslated(response, { lectureId, requestId });
      }
    } finally {
      if (requestId !== this.translateReq) return;
      this.liveInflight = false;
      this.isTranslating = false;
      if (lectureId !== this.currentLectureId) {
        this.liveQueued = false;
        return;
      }
      if (this.liveQueued && !this.swTranslatePending) {
        this.liveQueued = false;
        void this.ensureLive(this.activeVideo?.currentTime ?? aroundTime);
      } else {
        this.notifyCueChange(this.currentCue);
      }
    }
  }

  private sendTranslate(
    cues: SubtitleCue[],
    aroundTime: number,
    translationFingerprint: string,
    sourceLang: string,
    targetLang: string
  ): Promise<{ success: boolean; cues?: SubtitleCue[]; error?: string; aborted?: boolean }> {
    const lectureId = this.currentLectureId;
    const requestId = this.translateReq;
    this.swTranslatePending = true;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (response: {
        success: boolean;
        cues?: SubtitleCue[];
        error?: string;
        aborted?: boolean;
      }) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        if (!response.aborted) window.clearTimeout(hang);
        resolve(response);
      };
      const timeout = window.setTimeout(() => {
        finish({ success: true, aborted: true });
      }, TRANSLATE_REQUEST_TIMEOUT_MS);
      const hang = window.setTimeout(() => {
        this.swTranslatePending = false;
        if (!settled) {
          finish({
            success: false,
            error: 'Gemini çeviri hatası: yanıt vermedi. Gemini sekmesinden bağlantıyı test edin.',
          });
          return;
        }
        if (requestId !== this.translateReq || lectureId !== this.currentLectureId) return;
        this.notifyCueChange(this.currentCue);
        if (this.liveQueued) {
          this.liveQueued = false;
          void this.ensureLive(this.activeVideo?.currentTime ?? aroundTime);
        }
      }, TRANSLATE_HANG_MS);
      try {
        chrome.runtime.sendMessage(
          {
            type: 'TRANSLATE_CUES',
            payload: {
              cues,
              aroundTime,
              lectureId,
              requestId,
              priority: 'live',
              sourceLang,
              targetLang,
              sourceFingerprint: this.sourceFingerprint,
              translationFingerprint,
            },
          },
          (res) => {
            this.swTranslatePending = false;
            window.clearTimeout(hang);
            if (chrome.runtime.lastError) {
              finish({ success: false, error: chrome.runtime.lastError.message });
              return;
            }
            const response = res || { success: false };
            if (settled) {
              if (requestId === this.translateReq && lectureId === this.currentLectureId) {
                this.mergeTranslated(response, { lectureId, requestId });
                if (this.liveQueued) {
                  this.liveQueued = false;
                  void this.ensureLive(this.activeVideo?.currentTime ?? aroundTime);
                }
              }
              return;
            }
            finish(response);
          }
        );
      } catch (error) {
        this.swTranslatePending = false;
        window.clearTimeout(hang);
        finish({
          success: false,
          error: error instanceof Error ? error.message : 'Gemini çeviri bağlantısı kurulamadı.',
        });
      }
    });
  }

  private mergeTranslated(
    response: { success?: boolean; cues?: SubtitleCue[]; error?: string; aborted?: boolean },
    meta: { lectureId: string; requestId: number }
  ): void {
    if (response?.aborted) return;
    if (response?.success && response.cues?.length) {
      const byId = new Map(response.cues.filter((c) => c.translation).map((c) => [c.id, c.translation as string]));
      if (byId.size) {
        this.applyTranslationPatches([...byId].map(([id, translation]) => ({ id, translation })), meta);
        this.setTranslationHint(null);
        return;
      }
    }
    if (cueTranslationCoverage(this.cues) > 0) {
      this.setTranslationHint(null);
      this.schedulePersist();
      return;
    }
    if (response?.error) {
      const msg = userTranslationError(response.error);
      this.setTranslationHint(msg);
      shadowOverlay.showToast(msg, 5000);
      return;
    }
    const msg = 'Gemini çeviri hatası: geçerli yanıt alınamadı. Gemini sekmesinden bağlantıyı test edin.';
    this.setTranslationHint(msg);
    shadowOverlay.showToast(msg, 5000);
  }

  private convertTextTrackToCues(track: TextTrack): SubtitleCue[] {
    const cues: SubtitleCue[] = [];
    if (!track.cues) return cues;

    for (let i = 0; i < track.cues.length; i++) {
      const vttCue = track.cues[i] as VTTCue;
      const text = cleanVttText(vttCue.text || '');
      if (
        Number.isFinite(vttCue.startTime) &&
        Number.isFinite(vttCue.endTime) &&
        vttCue.endTime > vttCue.startTime &&
        text &&
        isRealSubtitleText(text)
      ) {
        cues.push({
          id: `cue-${cues.length}`,
          startTime: vttCue.startTime,
          endTime: vttCue.endTime,
          text,
        });
      }
    }
    return cues;
  }

  private extractCourseAndLectureInfo(): void {
    const url = window.location.pathname;
    const match = url.match(/\/course\/([^/]+)\/learn\/lecture\/(\d+)/);
    if (match) {
      this.currentCourseId = match[1];
      this.currentLectureId = match[2];
    } else {
      this.currentLectureId = window.location.pathname;
      this.currentCourseId = 'current-course';
    }

    const titleEl = document.querySelector('[data-purpose="lead-title"], h1, .lecture-title');
    this.currentCourseTitle = document.title.replace(' | Udemy', '').trim();
    this.currentLectureTitle = titleEl?.textContent?.trim() || `Ders ${this.currentLectureId}`;
  }

  public getMetadata() {
    this.extractCourseAndLectureInfo();
    return {
      courseId: this.currentCourseId,
      courseTitle: this.currentCourseTitle || document.title,
      lectureId: this.currentLectureId,
      lectureTitle: this.currentLectureTitle,
    };
  }
}

export const subtitleManager = new SubtitleManager();
