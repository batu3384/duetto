/**
 * Video player hook for Udemy.
 */
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
    if (this.video && this.playResumeHandler) {
      this.video.removeEventListener('play', this.playResumeHandler);
    }
    this.video = null;
    this.playResumeHandler = null;
  }

  public setSpeed(speed: number): void {
    const video = this.findVideoElement();
    if (video) {
      this.normalSpeed = speed;
      if (!this.isSilenceSkipping) {
        video.playbackRate = speed;
      }
    }
  }

  public getSpeed(): number {
    const video = this.findVideoElement();
    return video ? video.playbackRate : 1.0;
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
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;
      ctx.drawImage(video, 0, 0);
      return canvas.toDataURL('image/jpeg', 0.72);
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
      return;
    }

    const video = this.findVideoElement();
    if (!video) return;

    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioCtx = new AudioContextClass();
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 512;
        this.analyser.smoothingTimeConstant = 0.1;
        this.analyser.connect(this.audioCtx.destination);
      }

      if (this.connectedVideo !== video && this.audioCtx && this.analyser) {
        try {
          const source = this.audioCtx.createMediaElementSource(video);
          source.connect(this.analyser);
          this.connectedVideo = video;
        } catch {
          this.connectedVideo = video;
        }
      }

      this.startSilenceLoop();
    } catch (e) {
      console.warn('[Duetto] WebAudio silence detection attach error:', e);
    }
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
