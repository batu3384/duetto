/**
 * Video player hook for Udemy.
 */
export function displayedPlaybackSpeed(
  isSilenceSkipping: boolean,
  normalSpeed: number,
  playbackRate: number
): number {
  return isSilenceSkipping ? normalSpeed : playbackRate;
}

export function chooseLectureVideo(videos: HTMLVideoElement[]): HTMLVideoElement | null {
  if (!videos.length) return null;
  return (
    videos.find((video) => !video.paused && video.readyState >= 2 && video.videoWidth > 0) ||
    videos.find((video) => video.readyState >= 2 && video.videoWidth > 0) ||
    videos.find((video) => video.readyState >= 2) ||
    videos[0]
  );
}

export function findLectureVideo(doc: Document = document): HTMLVideoElement | null {
  const scoped = Array.from(
    doc.querySelectorAll('.video-player--container, [data-purpose="video-container"], .video-js')
  ).flatMap((container) => Array.from(container.querySelectorAll('video')));
  const curriculumVideos = Array.from(
    doc.querySelectorAll('[data-purpose="curriculum-item-viewer"] video')
  );
  const videos = [...new Set(scoped.length ? scoped : curriculumVideos.length ? curriculumVideos : Array.from(doc.querySelectorAll('video')))]
    .filter((video): video is HTMLVideoElement => video instanceof HTMLVideoElement);
  return chooseLectureVideo(videos);
}

export class PlayerHook {
  private video: HTMLVideoElement | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private connectedVideo: HTMLVideoElement | null = null;
  private isSilenceSkipping: boolean = false;
  private normalSpeed: number = 1.0;
  private silenceRaf: number | null = null;
  private silenceThreshold: number = -45;
  private playResumeHandler: (() => void) | null = null;
  private silenceSource: MediaStreamAudioSourceNode | null = null;
  private silenceSink: GainNode | null = null;

  public findVideoElement(): HTMLVideoElement | null {
    if (this.video && document.contains(this.video)) {
      return this.video;
    }
    const next = findLectureVideo();
    if (!next) {
      if (this.video) this.resetVideo();
      return null;
    }
    if (next !== this.video) this.bindVideo(next);
    return this.video;
  }

  private bindVideo(video: HTMLVideoElement): void {
    if (this.video === video) return;
    if (this.video && this.playResumeHandler) {
      this.video.removeEventListener('play', this.playResumeHandler);
    }
    this.video = video;
    this.playResumeHandler = () => {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
    };
    video.addEventListener('play', this.playResumeHandler);
  }

  public resetVideo(): void {
    this.stopSilenceLoop();
    this.releaseSilenceTap();
    if (this.video && this.playResumeHandler) {
      this.video.removeEventListener('play', this.playResumeHandler);
    }
    this.video = null;
    this.playResumeHandler = null;
  }

  public setSpeed(speed: number): void {
    const video = this.findVideoElement();
    this.normalSpeed = speed;
    if (video && !this.isSilenceSkipping) {
      video.playbackRate = speed;
    }
  }

  public noteExternalRate(): void {
    if (this.isSilenceSkipping) return;
    const video = this.video;
    if (video && document.contains(video)) this.normalSpeed = video.playbackRate;
  }

  public getSpeed(): number {
    const video = this.findVideoElement();
    return displayedPlaybackSpeed(this.isSilenceSkipping, this.normalSpeed, video ? video.playbackRate : this.normalSpeed);
  }

  public getCurrentTime(): number {
    const video = this.findVideoElement();
    return video ? video.currentTime : 0;
  }

  public getDuration(): number {
    const video = this.findVideoElement();
    return video ? video.duration : 0;
  }

  public seek(seconds: number): void {
    const video = this.findVideoElement();
    if (video) {
      video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
    }
  }

  public setTime(targetSeconds: number): void {
    const video = this.findVideoElement();
    if (video) {
      video.currentTime = targetSeconds;
    }
  }

  public async togglePiP(): Promise<boolean> {
    const video = this.findVideoElement();
    if (!video) return false;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return false;
      }
      if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
        return true;
      }
    } catch (e) {
      console.warn('[Duetto] PiP toggle error:', e);
    }
    return !!document.pictureInPictureElement;
  }

  public captureFrame(): string | undefined {
    const video = this.findVideoElement();
    if (!video || video.videoWidth < 2) return undefined;
    try {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 480 / video.videoWidth);
      canvas.width = Math.max(2, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(2, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch {
      return undefined;
    }
  }

  public initSilenceDetection(enabled: boolean, thresholdDb: number = -45): void {
    this.silenceThreshold = thresholdDb;
    this.stopSilenceLoop();

    if (!enabled) {
      const video = this.video;
      if (video && this.isSilenceSkipping) {
        video.playbackRate = this.normalSpeed;
      }
      this.isSilenceSkipping = false;
      this.releaseSilenceTap();
      return;
    }

    const video = this.findVideoElement();
    if (!video) return;

    try {
      if (!this.attachSilenceStream(video)) {
        this.stopSilenceLoop();
        console.warn('[Duetto] Sessizlik atlama bu videoda captureStream açamadı.');
        return;
      }
      if (this.audioCtx?.state === 'suspended') void this.audioCtx.resume().catch(() => {});
      this.startSilenceLoop();
    } catch (e) {
      console.warn('[Duetto] WebAudio silence detection attach error:', e);
    }
  }

  private ensureSilenceGraph(): boolean {
    if (this.audioCtx && this.analyser && this.silenceSink) return true;
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioCtx = new AudioContextClass();
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.1;
    this.silenceSink = this.audioCtx.createGain();
    this.silenceSink.gain.value = 0;
    this.analyser.connect(this.silenceSink);
    this.silenceSink.connect(this.audioCtx.destination);
    return true;
  }

  /** captureStream keeps the element audible. createMediaElementSource would mute it. */
  private attachSilenceStream(video: HTMLVideoElement): boolean {
    if (!this.ensureSilenceGraph() || !this.audioCtx || !this.analyser) return false;
    const capture = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.bind(video);
    if (!capture) return false;
    if (this.connectedVideo === video && this.silenceSource) return true;
    let stream: MediaStream;
    try {
      stream = capture();
    } catch {
      return false;
    }
    try {
      this.silenceSource?.disconnect();
      const source = this.audioCtx.createMediaStreamSource(stream);
      source.connect(this.analyser);
      this.silenceSource = source;
      this.connectedVideo = video;
      return true;
    } catch {
      this.silenceSource = null;
      this.connectedVideo = null;
      return false;
    }
  }

  private releaseSilenceTap(): void {
    this.silenceSource?.disconnect();
    this.silenceSource = null;
    this.connectedVideo = null;
  }

  private stopSilenceLoop(): void {
    if (this.silenceRaf != null) {
      cancelAnimationFrame(this.silenceRaf);
      this.silenceRaf = null;
    }
  }

  private startSilenceLoop(): void {
    if (!this.analyser) return;
    const buffer = new Float32Array(this.analyser.fftSize);

    const checkVolume = () => {
      const video = this.findVideoElement();
      if (video && !video.paused && this.analyser) {
        this.analyser.getFloatTimeDomainData(buffer);
        let sumSquares = 0;
        for (let i = 0; i < buffer.length; i++) {
          sumSquares += buffer[i] * buffer[i];
        }
        const rms = Math.sqrt(sumSquares / buffer.length);
        const db = 20 * Math.log10(Math.max(rms, 1e-5));

        if (db < this.silenceThreshold) {
          if (!this.isSilenceSkipping) {
            this.isSilenceSkipping = true;
            video.playbackRate = Math.min(3.0, this.normalSpeed * 2.0);
          }
        } else if (this.isSilenceSkipping) {
          this.isSilenceSkipping = false;
          video.playbackRate = this.normalSpeed;
        }
      }
      this.silenceRaf = requestAnimationFrame(checkVolume);
    };

    this.silenceRaf = requestAnimationFrame(checkVolume);
  }
}

export const playerHook = new PlayerHook();
