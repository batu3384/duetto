import { ExtensionSettings } from '../../types';
import {
  autoDockPx,
  averageBottomRgb,
  dockFill,
  DOCK_LIGHT_LUMA,
  DOCK_SEAM_PX,
  hexToRgb,
  luma,
  rgbCss,
} from '../../services/subtitleLook';
import { getPageSettings } from '../../services/storage';
import { shadowOverlay } from './shadowRoot';
import { playerHook } from '../playerHook';

const STYLE_ID = 'duetto-dock-style';
const ATTR = 'data-duetto-dock';
const PROBE_W = 48;
const PROBE_H = 28;

const DOCK_CSS = `
[${ATTR}="below"]::after {
  content: none;
}
[${ATTR}="below"] video {
  width: 100% !important;
  left: 0 !important;
  right: 0 !important;
  height: calc(100% - var(--duetto-dock-h, 96px) + 2px) !important;
  max-height: calc(100% - var(--duetto-dock-h, 96px) + 2px) !important;
  top: 0 !important;
  bottom: auto !important;
  object-fit: var(--duetto-video-fit, cover) !important;
  object-position: center center !important;
  background: var(--duetto-dock-match, transparent) !important;
}
[${ATTR}="below"] .vjs-control-bar,
[${ATTR}="below"] [data-purpose="video-controls"],
[${ATTR}="below"] [data-purpose="video-control-bar"] {
  bottom: var(--duetto-dock-h, 96px) !important;
}
`;

let watching = false;
let boundSource: HTMLVideoElement | null = null;
let sampleTimer: number | null = null;
let dockScrimPct = 0;
let paint = { r: 0, g: 0, b: 0 };
let hasPaint = false;
let probeCanvas: HTMLCanvasElement | null = null;

function capturePlayback(video: HTMLVideoElement): MediaStream | null {
  const anyVideo = video as HTMLVideoElement & {
    captureStream?: (fps?: number) => MediaStream;
    mozCaptureStream?: (fps?: number) => MediaStream;
  };
  const fn = anyVideo.captureStream || anyVideo.mozCaptureStream;
  if (typeof fn !== 'function') return null;
  try {
    return fn.call(video, 12);
  } catch {
    try {
      return fn.call(video);
    } catch {
      return null;
    }
  }
}

function stopSample(): void {
  if (sampleTimer != null) {
    window.clearInterval(sampleTimer);
    sampleTimer = null;
  }
}

function clearAmbient(): void {
  stopSample();
  const layer = shadowOverlay.getAmbientLayer();
  layer?.querySelectorAll('video').forEach((el) => {
    const v = el as HTMLVideoElement;
    v.pause();
    v.srcObject = null;
    v.remove();
  });
  boundSource = null;
}

function probeCtx(): CanvasRenderingContext2D | null {
  if (!probeCanvas) {
    probeCanvas = document.createElement('canvas');
    probeCanvas.width = PROBE_W;
    probeCanvas.height = PROBE_H;
  }
  return probeCanvas.getContext('2d', { willReadFrequently: true });
}

function publishMatch(c: { r: number; g: number; b: number }, snap: boolean): void {
  if (!hasPaint || snap) {
    paint = c;
    hasPaint = true;
  } else {
    const jump = Math.abs(c.r - paint.r) + Math.abs(c.g - paint.g) + Math.abs(c.b - paint.b);
    const t = jump > 48 ? 1 : 0.42;
    paint = {
      r: Math.round(paint.r + (c.r - paint.r) * t),
      g: Math.round(paint.g + (c.g - paint.g) * t),
      b: Math.round(paint.b + (c.b - paint.b) * t),
    };
  }
  const css = rgbCss(paint);
  const host = shadowOverlay.getHostElement();
  const box = host?.parentElement;
  host?.style.setProperty('--duetto-dock-match', css);
  box?.style.setProperty('--duetto-dock-match', css);
  host?.classList.add('dock-ready');
  if (dockScrimPct < 70) {
    shadowOverlay.setDockLight(0.2126 * paint.r + 0.7152 * paint.g + 0.0722 * paint.b > DOCK_LIGHT_LUMA);
  }
}

function sampleFrame(from: HTMLVideoElement, snap = false): boolean {
  if (from.readyState < 2) return false;
  const ctx = probeCtx();
  if (!ctx || !probeCanvas) return false;
  try {
    ctx.drawImage(from, 0, 0, PROBE_W, PROBE_H);
    const data = ctx.getImageData(0, 0, PROBE_W, PROBE_H).data;
    publishMatch(averageBottomRgb(data, PROBE_W, PROBE_H), snap);
    return true;
  } catch {
    return false;
  }
}

function syncAmbient(video: HTMLVideoElement, on: boolean): void {
  const layer = shadowOverlay.getAmbientLayer();
  if (!on || !layer) {
    clearAmbient();
    return;
  }
  const existing = layer.querySelector('video') as HTMLVideoElement | null;
  if (existing && boundSource === video && existing.srcObject) {
    void existing.play().catch(() => undefined);
    return;
  }
  if (existing) clearAmbient();

  if (sampleFrame(video, !hasPaint)) {
    stopSample();
    sampleTimer = window.setInterval(() => {
      sampleFrame(video);
    }, 320);
    return;
  }

  const stream = capturePlayback(video);
  if (!stream) {
    video.addEventListener(
      'playing',
      () => {
        void getPageSettings().then(applyVideoDock);
      },
      { once: true }
    );
    return;
  }
  const probe = document.createElement('video');
  probe.className = 'dock-probe';
  probe.muted = true;
  probe.defaultMuted = true;
  probe.playsInline = true;
  probe.setAttribute('aria-hidden', 'true');
  probe.srcObject = stream;
  layer.appendChild(probe);
  boundSource = video;
  void probe.play().catch(() => undefined);
  const tick = () => sampleFrame(probe, !hasPaint);
  probe.addEventListener('loadeddata', () => tick(), { once: true });
  stopSample();
  sampleTimer = window.setInterval(tick, 320);
}

function setMatchFromHex(hex: string): void {
  const c = hexToRgb(hex);
  publishMatch(c, true);
}

export function applyVideoDock(settings: ExtensionSettings | null): void {
  const host = shadowOverlay.getHostElement();
  const box = host?.parentElement || null;
  const video = playerHook.findVideoElement();
  const on =
    !!settings?.dualSubtitlesEnabled &&
    settings.subStyle.placement === 'below' &&
    !!box &&
    !!video &&
    box.contains(video);

  document.querySelectorAll(`[${ATTR}]`).forEach((el) => {
    if (!on || el !== box) {
      (el as HTMLElement).removeAttribute(ATTR);
      (el as HTMLElement).style.removeProperty('--duetto-dock-h');
      (el as HTMLElement).style.removeProperty('--duetto-dock-bg');
      (el as HTMLElement).style.removeProperty('--duetto-video-fit');
      (el as HTMLElement).style.removeProperty('--duetto-dock-match');
      (el as HTMLElement).style.removeProperty('--duetto-dock-seam');
    }
  });

  if (!on || !box || !host || !settings) {
    document.getElementById(STYLE_ID)?.remove();
    host?.style.removeProperty('--duetto-dock-h');
    host?.style.removeProperty('--duetto-dock-bg');
    host?.style.removeProperty('--duetto-video-fit');
    host?.style.removeProperty('--duetto-dock-match');
    host?.style.removeProperty('--duetto-dock-seam');
    host?.classList.remove('dock-ready');
    shadowOverlay.setDockMode(false);
    hasPaint = false;
    clearAmbient();
    return;
  }

  const ambient = settings.subStyle.dockAmbient !== false;
  const h = autoDockPx(settings.subStyle);
  const opacity = settings.subStyle.dockOpacity ?? 0;
  dockScrimPct = opacity;
  const color = settings.subStyle.dockColor || '#000000';
  const bg = dockFill(color, opacity);
  const fit = settings.subStyle.videoFit === 'contain' ? 'contain' : 'cover';
  box.setAttribute(ATTR, 'below');
  box.style.setProperty('--duetto-dock-h', `${h}px`);
  box.style.setProperty('--duetto-dock-bg', bg);
  box.style.setProperty('--duetto-video-fit', fit);
  box.style.setProperty('--duetto-dock-seam', `${DOCK_SEAM_PX}px`);
  host.style.setProperty('--duetto-dock-h', `${h}px`);
  host.style.setProperty('--duetto-dock-bg', bg);
  host.style.setProperty('--duetto-video-fit', fit);
  host.style.setProperty('--duetto-dock-seam', `${DOCK_SEAM_PX}px`);
  if (!ambient) {
    setMatchFromHex(color);
    shadowOverlay.setDockLight(luma(color) > DOCK_LIGHT_LUMA && opacity >= 40);
  } else if (opacity >= 70) {
    shadowOverlay.setDockLight(luma(color) > DOCK_LIGHT_LUMA);
  }
  shadowOverlay.setDockMode(true);
  syncAmbient(video, ambient);

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = DOCK_CSS;
}

export function clearVideoDock(): void {
  applyVideoDock(null);
}

export function watchVideoDock(): void {
  if (watching) return;
  watching = true;
  const bump = () => {
    void getPageSettings().then(applyVideoDock);
  };
  document.addEventListener('fullscreenchange', bump);
  window.addEventListener('resize', bump);
}
