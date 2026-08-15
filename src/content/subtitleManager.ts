import { SubtitleCue, CourseTranscript } from '../types';
import { parseVTT, isRealSubtitleText, cueAtTime, cueTranslationCoverage, trackMatchesSource, liveWindowCues } from '../services/vttParser';
import { getTranscript, saveTranscript, transcriptStorageId } from '../services/db';
import { getPageSettings } from '../services/storage';
import { shadowOverlay } from './overlay/shadowRoot';
import type { TranslationPatch } from '../services/translator/gemini';

function isValidCaptionTrack(track: TextTrack): boolean {
  if (!track) return false;
  const kind = (track.kind || '').toLowerCase();
  if (kind === 'metadata' || kind === 'thumbnails' || kind === 'chapters') {
    return false;
  }
  const label = (track.label || '').toLowerCase();
  if (/thumbnail|sprite|storyboard|preview|seek/i.test(label)) {
    return false;
  }
  return true;
}

function isValidVttUrl(url: string): boolean {
  if (!url) return false;
  if (/thumb-sprites|thumbnails|storyboard|preview|sprite/i.test(url)) {
    return false;
  }
  return /\.vtt|captions|subtitles/i.test(url);
}

function userTranslationError(raw: string): string {
  const msg = (raw || '').trim();
  if (!msg) return 'Gemini çevirisi başarısız. Anahtarı Gemini sekmesinde test edin.';
  if (/anahtarı yok|anahtarı girilmedi|api anahtarı/i.test(msg)) {
    return 'Gemini anahtarı gerekli — uzantı simgesi → Gemini';
  }
  if (/kotası|quota|429/i.test(msg)) return msg;
  if (/geçersiz|invalid|403|404/i.test(msg)) return msg;
  return msg.length > 96 ? `${msg.slice(0, 93)}…` : msg;
}

function needsTranslation(settings: { sourceLang?: string; targetLang?: string }): boolean {
  return (settings.sourceLang || 'en').toLowerCase() !== (settings.targetLang || 'tr').toLowerCase();
}

function cacheLooksTranslated(cues: SubtitleCue[]): boolean {
  if (!cues.length) return false;
  if (cues.some((c) => !isRealSubtitleText(c.text))) return false;
  return cueTranslationCoverage(cues) >= 0.95;
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
  private restInflight: boolean = false;
  private liveQueued: boolean = false;
  private restQueued: boolean = false;
  private liveTimer: ReturnType<typeof setTimeout> | null = null;
  private translationHint: string | null = null;
  private translateReq: number = 0;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: ((cue: SubtitleCue | null) => void)[] = [];
  private transcriptListeners: ((cues: SubtitleCue[]) => void)[] = [];
  private trackPollInterval: ReturnType<typeof setInterval> | null = null;
  private activeVideo: HTMLVideoElement | null = null;
  private trackChangeHandler: (() => void) | null = null;
  private trackList: TextTrackList | null = null;

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
    return this.isTranslating || this.liveInflight || this.restInflight;
  }

  public getTranslationHint(): string | null {
    return this.translationHint;
  }

  private setTranslationHint(msg: string | null): void {
    this.translationHint = msg;
    this.notifyCueChange(this.currentCue);
  }

  public updateTime(currentTime: number): void {
    if (this.cues.length === 0) return;
    const matchingCue = cueAtTime(this.cues, currentTime);
    if (matchingCue?.id !== this.currentCue?.id || matchingCue?.translation !== this.currentCue?.translation) {
      this.currentCue = matchingCue;
      this.notifyCueChange(matchingCue);
    }
    if (matchingCue && !matchingCue.translation) this.nudgeLive(currentTime);
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
    this.detachTrackHandler();
    this.cues = [];
    this.currentCue = null;
    this.isTranslating = false;
    this.liveInflight = false;
    this.restInflight = false;
    this.liveQueued = false;
    this.restQueued = false;
    if (this.liveTimer) clearTimeout(this.liveTimer);
    this.liveTimer = null;
    this.translationHint = null;
    this.activeVideo = null;
    this.notifyCueChange(null);
  }

  private detachTrackHandler(): void {
    if (this.trackList && this.trackChangeHandler) {
      this.trackList.removeEventListener('change', this.trackChangeHandler);
    }
    this.trackList = null;
    this.trackChangeHandler = null;
  }

  public async loadSubtitlesForVideo(video: HTMLVideoElement, opts?: { skipCache?: boolean }): Promise<void> {
    this.activeVideo = video;
    this.translateReq += 1;
    this.isTranslating = false;
    const req = this.translateReq;
    this.extractCourseAndLectureInfo();

    if (video.textTracks) {
      this.detachTrackHandler();
      this.trackList = video.textTracks;
      this.trackChangeHandler = () => this.ensureTracksActive(video);
      this.trackList.addEventListener('change', this.trackChangeHandler);
    }

    const settings = await getPageSettings();
    if (this.translateReq !== req) return;
    const storageId = transcriptStorageId(
      this.currentLectureId,
      settings.sourceLang || 'en',
      settings.targetLang || 'tr'
    );

    if (!opts?.skipCache && this.currentLectureId) {
      const cached = await getTranscript(storageId);
      if (this.translateReq !== req) return;
      if (cached?.cues?.length && !cached.cues.some((c) => !isRealSubtitleText(c.text))) {
        this.cues = cached.cues;
        this.transcriptListeners.forEach((l) => l(this.cues));
        this.updateTime(video.currentTime);
        if (cacheLooksTranslated(cached.cues)) return;
        await this.kickTranslate(video.currentTime);
        return;
      }
    }

    this.ensureTracksActive(video);

    const cues = await this.extractAllCues(video);
    if (this.translateReq !== req) return;
    if (cues && cues.length > 0) {
      this.cues = cues;
      this.transcriptListeners.forEach((l) => l(this.cues));
      this.updateTime(video.currentTime);
      await this.kickTranslate(video.currentTime);
    } else {
      this.startTrackPolling(video);
    }
  }

  private ensureTracksActive(video: HTMLVideoElement): void {
    if (!video.textTracks) return;
    for (let i = 0; i < video.textTracks.length; i++) {
      const track = video.textTracks[i];
      if (isValidCaptionTrack(track) && track.mode === 'disabled') {
        track.mode = 'hidden';
      }
    }
  }

  private async extractAllCues(video: HTMLVideoElement): Promise<SubtitleCue[] | null> {
    const settings = await getPageSettings();
    const targetSourceLang = (settings.sourceLang || 'en').toLowerCase();

    if (video.textTracks && video.textTracks.length > 0) {
      this.ensureTracksActive(video);
      const validTracks = Array.from(video.textTracks).filter(isValidCaptionTrack);

      if (validTracks.length > 0) {
        const matchingTrack =
          validTracks.find(
            (t) => trackMatchesSource(t.language || '', t.label || '', targetSourceLang) && !/auto/.test((t.label || '').toLowerCase())
          ) ||
          validTracks.find((t) => trackMatchesSource(t.language || '', t.label || '', targetSourceLang)) ||
          validTracks[0];

        if (matchingTrack?.cues && matchingTrack.cues.length > 0) {
          const extracted = this.convertTextTrackToCues(matchingTrack);
          if (extracted.length > 0) return extracted;
        }
      }
    }

    const trackElements = Array.from(video.querySelectorAll('track')).filter(
      (el) => el.kind === 'captions' || el.kind === 'subtitles'
    );
    const validTrackEl =
      trackElements.find(
        (t) => (t.srclang?.toLowerCase().startsWith(targetSourceLang) || !t.srclang) && isValidVttUrl(t.src)
      ) || trackElements.find((t) => isValidVttUrl(t.src));

    if (validTrackEl?.src) {
      try {
        const res = await fetch(validTrackEl.src);
        if (res.ok) {
          const parsed = parseVTT(await res.text());
          if (parsed.length > 0) return parsed;
        }
      } catch (e) {
        console.warn('[Duetto] Failed to fetch track src:', e);
      }
    }

    try {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const validVttEntries = resources.reverse().filter((r) => isValidVttUrl(r.name));
      for (const entry of validVttEntries) {
        try {
          const res = await fetch(entry.name);
          if (res.ok) {
            const parsed = parseVTT(await res.text());
            if (parsed.length > 0) return parsed;
          }
        } catch {
          /* next */
        }
      }
    } catch {
      /* ignore */
    }

    return null;
  }

  private startTrackPolling(video: HTMLVideoElement): void {
    if (this.trackPollInterval) clearInterval(this.trackPollInterval);
    let attempts = 0;
    const pollReq = this.translateReq;

    this.trackPollInterval = setInterval(async () => {
      if (this.translateReq !== pollReq) {
        if (this.trackPollInterval) clearInterval(this.trackPollInterval);
        this.trackPollInterval = null;
        return;
      }
      attempts++;
      this.ensureTracksActive(video);
      const cues = await this.extractAllCues(video);
      if (cues && cues.length > 0) {
        if (this.trackPollInterval) clearInterval(this.trackPollInterval);
        this.trackPollInterval = null;
        if (this.translateReq !== pollReq) return;
        this.cues = cues;
        this.transcriptListeners.forEach((l) => l(this.cues));
        this.updateTime(video.currentTime);
        await this.kickTranslate(video.currentTime);
      } else if (attempts >= 10) {
        if (this.trackPollInterval) clearInterval(this.trackPollInterval);
        this.trackPollInterval = null;
      }
    }, 1000);
  }

  public applyTranslationPatches(patches: TranslationPatch[], meta?: { lectureId?: string; requestId?: number }): void {
    if (!patches.length) return;
    if (meta?.lectureId && meta.lectureId !== this.currentLectureId) return;

    const byId = new Map(patches.map((p) => [p.id, p.translation]));
    const hadCurrent = !!this.currentCue?.translation;
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
      if (!hadCurrent) shadowOverlay.showToast('Çeviri geldi', 900);
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
    if (!this.currentLectureId || !this.cues.some((c) => c.translation)) return;
    const settings = await getPageSettings();
    const transcript: CourseTranscript = {
      id: transcriptStorageId(this.currentLectureId, settings.sourceLang || 'en', settings.targetLang || 'tr'),
      lectureId: this.currentLectureId,
      courseId: this.currentCourseId,
      courseTitle: this.currentCourseTitle,
      lectureTitle: this.currentLectureTitle,
      cues: this.cues,
      language: settings.sourceLang || 'en',
      translatedLanguage: settings.targetLang || 'tr',
      updatedAt: Date.now(),
    };
    await saveTranscript(transcript);
  }

  public nudgeLive(aroundTime: number): void {
    const cue = cueAtTime(this.cues, aroundTime);
    if (!cue || cue.translation?.trim()) return;
    if (this.liveInflight) {
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
    void this.translateRest();
  }

  public async ensureLive(aroundTime: number): Promise<void> {
    if (this.liveInflight) {
      this.liveQueued = true;
      return;
    }
    if (this.cues.length === 0) return;
    const settings = await getPageSettings();
    if (!needsTranslation(settings)) {
      this.setTranslationHint(null);
      return;
    }
    if (!settings.geminiKeyConfigured) {
      this.setTranslationHint('Gemini anahtarı gerekli — uzantı simgesi → Gemini');
      return;
    }
    const windowCues = liveWindowCues(this.cues, aroundTime).filter((c) => !c.translation?.trim());
    if (!windowCues.length) return;

    this.liveInflight = true;
    if (this.restInflight) this.restQueued = true;
    this.isTranslating = true;
    this.setTranslationHint(null);
    try {
      const response = await this.sendTranslate(windowCues, aroundTime, 'live');
      this.mergeTranslated(response);
    } finally {
      this.liveInflight = false;
      this.isTranslating = this.restInflight;
      if (this.liveQueued) {
        this.liveQueued = false;
        void this.ensureLive(this.activeVideo?.currentTime ?? aroundTime);
        return;
      }
      if (this.restQueued) {
        this.restQueued = false;
        void this.translateRest();
      }
    }
  }

  public async translateRest(): Promise<void> {
    if (this.cues.length === 0) return;
    if (this.liveInflight) {
      this.restQueued = true;
      return;
    }
    if (this.restInflight) {
      this.restQueued = true;
      return;
    }
    const settings = await getPageSettings();
    if (!needsTranslation(settings) || !settings.geminiKeyConfigured) return;
    const pending = this.cues.filter((c) => !c.translation?.trim());
    if (!pending.length) return;

    this.restInflight = true;
    this.isTranslating = true;
    const aroundTime = this.activeVideo?.currentTime ?? 0;
    try {
      const response = await this.sendTranslate(pending, aroundTime, 'rest');
      this.mergeTranslated(response);
    } finally {
      this.restInflight = false;
      this.isTranslating = this.liveInflight;
      if (this.liveQueued) {
        this.liveQueued = false;
        void this.ensureLive(this.activeVideo?.currentTime ?? aroundTime);
      } else if (this.restQueued) {
        this.restQueued = false;
        void this.translateRest();
      }
    }
  }

  public async translateAllCuesBatch(): Promise<void> {
    await this.kickTranslate(this.activeVideo?.currentTime ?? 0);
  }

  private sendTranslate(
    cues: SubtitleCue[],
    aroundTime: number,
    priority: 'live' | 'rest'
  ): Promise<{ success: boolean; cues?: SubtitleCue[]; error?: string }> {
    const lectureId = this.currentLectureId;
    const requestId = this.translateReq;
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'TRANSLATE_CUES', payload: { cues, aroundTime, lectureId, requestId, priority } },
        (res) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(res || { success: false });
        }
      );
    });
  }

  private mergeTranslated(response: { success?: boolean; cues?: SubtitleCue[]; error?: string }): void {
    if (response?.success && response.cues?.length) {
      const byId = new Map(response.cues.filter((c) => c.translation).map((c) => [c.id, c.translation as string]));
      if (byId.size) this.applyTranslationPatches([...byId].map(([id, translation]) => ({ id, translation })));
      this.setTranslationHint(null);
      return;
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
    }
  }

  private convertTextTrackToCues(track: TextTrack): SubtitleCue[] {
    const cues: SubtitleCue[] = [];
    if (!track.cues) return cues;

    for (let i = 0; i < track.cues.length; i++) {
      const vttCue = track.cues[i] as VTTCue;
      const text = (vttCue.text || '').replace(/<[^>]+>/g, '').trim();
      if (text && isRealSubtitleText(text)) {
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
