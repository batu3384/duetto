import { playerHook } from './playerHook';
import { subtitleManager } from './subtitleManager';
import { shadowOverlay } from './overlay/shadowRoot';
import { uiRenderer } from './overlay/uiRenderer';
import { setupKeyboardShortcuts, setShortcutsEnabled } from './shortcuts';
import { applySettingsCache, extensionAlive, getPageSettings, isStaleExtensionError, mergeSettings, SECRET_KEY, SETTINGS_KEY, settingsForPage } from '../services/storage';
import { consumePendingSeek, setPendingSeek } from '../services/db';
import { ExtensionSettings } from '../types';
import { applyVideoDock, clearVideoDock, watchVideoDock } from './overlay/videoDock';

console.log('[Duetto] Content script initialized on Udemy.');

const HOST_ID = 'duetto-overlay-host';
const STALE_BANNER_ID = 'duetto-stale-banner';

let isInitialized = false;
let cleanupShortcuts: (() => void) | null = null;
let attachedVideo: HTMLVideoElement | null = null;
let onTimeUpdate: (() => void) | null = null;
let onRateChange: (() => void) | null = null;
let cueUnsub: (() => void) | null = null;
let playerObserver: MutationObserver | null = null;
let urlPoll: ReturnType<typeof setInterval> | null = null;
let lastLectureKey = '';
let attaching = false;
let checkTimer: ReturnType<typeof setTimeout> | null = null;
let staleStopped = false;
let appliedPageSettings: ExtensionSettings | null = null;

function showStaleExtensionBanner(): void {
  if (document.getElementById(STALE_BANNER_ID)) return;
  const el = document.createElement('div');
  el.id = STALE_BANNER_ID;
  el.setAttribute('role', 'status');
  el.textContent = 'Duetto güncellendi — uzantının çalışması için bu sayfayı yenileyin (F5).';
  el.style.cssText =
    'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483646;padding:10px 14px;border-radius:10px;border:1px solid #2c3546;background:rgba(14,20,36,0.96);color:#e8ebf2;font:600 12px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(12,16,24,0.55);pointer-events:none';
  document.body.appendChild(el);
}

function stopObserversOnStale(): void {
  if (staleStopped) return;
  staleStopped = true;
  if (urlPoll) clearInterval(urlPoll);
  urlPoll = null;
  playerObserver?.disconnect();
  playerObserver = null;
  if (checkTimer) clearTimeout(checkTimer);
  checkTimer = null;
}

function guardStaleExtension(): boolean {
  if (extensionAlive()) return false;
  showStaleExtensionBanner();
  stopObserversOnStale();
  return true;
}

function lectureKeyFromUrl(): string {
  const match = window.location.pathname.match(/\/lecture\/(\d+)/);
  return match ? match[1] : window.location.pathname;
}

function findContainer(video: HTMLVideoElement): HTMLElement | null {
  if (!video.parentElement) return null;
  const nested = video.parentElement.closest(
    '.video-player--container, [data-purpose="video-container"], .video-js'
  ) as HTMLElement | null;
  const container = nested || video.parentElement;
  if (container.tagName.toLowerCase() === 'video') return null;
  return container;
}

function suppressNativeUdemyCaptions(suppress: boolean) {
  let styleEl = document.getElementById('duetto-native-suppress-style') as HTMLStyleElement | null;
  if (suppress) {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'duetto-native-suppress-style';
      styleEl.textContent = `
        .vjs-text-track-display,
        [class*="captions-display--captions-container"],
        [data-purpose="captions-cue-text"],
        .vjs-text-track-cue {
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `;
      document.head.appendChild(styleEl);
    }
  } else if (styleEl) {
    styleEl.remove();
  }
}

function refreshNativeCaptionVisibility(): void {
  suppressNativeUdemyCaptions(
    !!appliedPageSettings?.dualSubtitlesEnabled &&
      subtitleManager.getCues().length > 0 &&
      !subtitleManager.getSourceError()
  );
}

function applyLiveSettings(settings: ExtensionSettings) {
  const page = settingsForPage(settings);
  appliedPageSettings = page;
  applySettingsCache(page);
  uiRenderer.updateSettings(page);
  applyVideoDock(page);
  refreshNativeCaptionVisibility();
  setShortcutsEnabled(page.shortcutsEnabled !== false);
  if (typeof page.playbackSpeed === 'number') {
    playerHook.setSpeed(page.playbackSpeed);
  }
  playerHook.initSilenceDetection(!!page.silenceSkipEnabled, page.silenceThreshold);
}

function teardownPlayer() {
  uiRenderer.resetInteraction({ resume: false });
  if (attachedVideo && onTimeUpdate) attachedVideo.removeEventListener('timeupdate', onTimeUpdate);
  if (attachedVideo && onRateChange) attachedVideo.removeEventListener('ratechange', onRateChange);
  cueUnsub?.();
  cueUnsub = null;
  onTimeUpdate = null;
  onRateChange = null;
  clearVideoDock();
  subtitleManager.reset();
  refreshNativeCaptionVisibility();
  shadowOverlay.destroy();
  playerHook.resetVideo();
  attachedVideo = null;
  isInitialized = false;
}

async function bootstrap() {
  if (guardStaleExtension()) return;

  try {
    const settings = await getPageSettings();
    applyLiveSettings(settings);
  } catch (err) {
    if (isStaleExtensionError(err)) {
      guardStaleExtension();
      return;
    }
    throw err;
  }

  if (!extensionAlive()) {
    guardStaleExtension();
    return;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (guardStaleExtension()) return;
    if (area !== 'local' || (!changes[SETTINGS_KEY] && !changes[SECRET_KEY])) return;
    void getPageSettings()
      .then((updated) => {
      const oldVal = changes[SETTINGS_KEY]?.oldValue as ExtensionSettings | undefined;
      applyLiveSettings(updated);
      const langChanged =
        oldVal && (oldVal.targetLang !== updated.targetLang || oldVal.sourceLang !== updated.sourceLang);
      const keyChanged = !!changes[SECRET_KEY] || changes[SETTINGS_KEY]?.newValue?.geminiKeyConfigured !== oldVal?.geminiKeyConfigured;
      if (langChanged || keyChanged) {
        const video = playerHook.findVideoElement();
        if (video) subtitleManager.loadSubtitlesForVideo(video, { skipCache: langChanged });
      }
    })
      .catch((err) => {
        if (isStaleExtensionError(err)) guardStaleExtension();
      });
  });

  if (!extensionAlive()) {
    guardStaleExtension();
    return;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'UPDATE_SETTINGS' && message.settings) {
      applyLiveSettings(mergeSettings(message.settings));
      sendResponse({ success: true });
    } else if (message.type === 'TOGGLE_PIP') {
      playerHook.togglePiP().then((on) => sendResponse({ success: true, pip: on }));
      return true;
    } else if (message.type === 'SEEK_VIDEO') {
      playerHook.seek(message.seconds || 0);
      sendResponse({ success: true });
    } else if (message.type === 'SET_TIME') {
      playerHook.setTime(message.time || 0);
      sendResponse({ success: true });
    } else if (message.type === 'SET_SPEED') {
      playerHook.setSpeed(message.speed || 1.0);
      sendResponse({ success: true });
    } else if (message.type === 'RELOAD_CAPTIONS' || message.type === 'TRIGGER_TRANSLATE') {
      const video = playerHook.findVideoElement();
      if (video) subtitleManager.loadSubtitlesForVideo(video, { skipCache: true });
      sendResponse({ success: true });
    } else if (message.type === 'TRANSLATE_PARTIAL') {
      subtitleManager.applyTranslationPatches(message.patches || [], {
        lectureId: message.lectureId,
        requestId: message.requestId,
      });
      sendResponse({ success: true });
    } else if (message.type === 'TRANSLATE_PROGRESS') {
      sendResponse({ success: true });
    } else if (message.type === 'GET_CUES') {
      sendResponse({ cues: subtitleManager.getCues(), meta: subtitleManager.getMetadata() });
    } else if (message.type === 'NAVIGATE_LECTURE') {
      const courseId = typeof message.courseId === 'string' ? message.courseId : '';
      const lectureId = typeof message.lectureId === 'string' ? message.lectureId : '';
      const time = typeof message.time === 'number' && Number.isFinite(message.time) ? message.time : 0;
      if (!/^[a-zA-Z0-9_-]+$/.test(courseId) || !/^\d+$/.test(lectureId)) {
        sendResponse({ success: false });
        return;
      }
      const meta = subtitleManager.getMetadata();
      if (meta.lectureId === lectureId) {
        playerHook.setTime(time);
      } else {
        setPendingSeek({ lectureId, time }).then(() => {
          window.location.assign(`https://www.udemy.com/course/${courseId}/learn/lecture/${lectureId}`);
        });
      }
      sendResponse({ success: true });
      return true;
    }
    return undefined;
  });

  if (!cleanupShortcuts) {
    cleanupShortcuts = setupKeyboardShortcuts();
  }

  observePlayer();
  watchVideoDock();
}

function bindVideoListeners(video: HTMLVideoElement): void {
  if (attachedVideo && onTimeUpdate) attachedVideo.removeEventListener('timeupdate', onTimeUpdate);
  if (attachedVideo && onRateChange) attachedVideo.removeEventListener('ratechange', onRateChange);
  attachedVideo = video;
  onTimeUpdate = () => subtitleManager.updateTime(video.currentTime);
  onRateChange = () => uiRenderer.renderToolbar();
  video.addEventListener('timeupdate', onTimeUpdate);
  video.addEventListener('ratechange', onRateChange);
}

function observePlayer() {
  const runCheck = () => {
    if (guardStaleExtension()) return;
    if (attaching) return;
    const video = playerHook.findVideoElement();
    if (!video) return;
    const container = findContainer(video);
    if (!container) return;

    const lectureKey = lectureKeyFromUrl();
    const hostGone = !document.getElementById(HOST_ID);
    const videoChanged = video !== attachedVideo;
    const lectureChanged = lectureKey !== lastLectureKey && lastLectureKey !== '';

    if (!isInitialized || hostGone || videoChanged || lectureChanged) {
      setupPlayerInstance(video, container);
    }
  };

  const check = () => {
    if (checkTimer) clearTimeout(checkTimer);
    checkTimer = setTimeout(runCheck, 80);
  };

  check();
  playerObserver?.disconnect();
  playerObserver = new MutationObserver(() => check());
  playerObserver.observe(document.body, { childList: true, subtree: true });

  if (urlPoll) clearInterval(urlPoll);
  urlPoll = setInterval(check, 800);
}

function setupPlayerInstance(video: HTMLVideoElement, container: HTMLElement) {
  if (attaching) return;
  attaching = true;
  try {
    const lectureKey = lectureKeyFromUrl();
    const prevLecture = lastLectureKey;
    lastLectureKey = lectureKey;
    const sameLecture =
      prevLecture === lectureKey &&
      prevLecture !== '' &&
      video === attachedVideo &&
      subtitleManager.getCues().length > 0;

    if (sameLecture) {
      const host = document.getElementById(HOST_ID);
      if (!host || !container.contains(host)) {
        shadowOverlay.init(container);
        cueUnsub?.();
        cueUnsub = subtitleManager.onCueChange((cue) => {
          uiRenderer.renderSubtitle(cue);
          refreshNativeCaptionVisibility();
        });
      }
      bindVideoListeners(video);
      subtitleManager.rebindVideo(video);
      isInitialized = true;
      void getPageSettings()
        .then(applyLiveSettings)
        .catch((err) => {
          if (isStaleExtensionError(err)) guardStaleExtension();
        });
      return;
    }

    teardownPlayer();
    isInitialized = true;
    attachedVideo = video;

    const computedPos = window.getComputedStyle(container).position;
    if (computedPos === 'static') {
      container.style.position = 'relative';
    }

    shadowOverlay.init(container);

    getPageSettings()
      .then(async (settings) => {
        applyLiveSettings(settings);
        const pending = await consumePendingSeek();
        if (pending && pending.lectureId === lectureKeyFromUrl()) {
          playerHook.setTime(pending.time);
        }
      })
      .catch((err) => {
        if (isStaleExtensionError(err)) guardStaleExtension();
      });

    subtitleManager.loadSubtitlesForVideo(video);

    cueUnsub = subtitleManager.onCueChange((cue) => {
      uiRenderer.renderSubtitle(cue);
      refreshNativeCaptionVisibility();
    });

    bindVideoListeners(video);
  } finally {
    attaching = false;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
