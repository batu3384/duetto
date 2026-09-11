import { applySettingsCache, getSettings, SECRET_KEY, SETTINGS_KEY, senderMayReadSecrets, settingsForPage, stashGeminiKeyFromSettingsBlob } from '../services/storage';
import { testGeminiPipeline, translateCues, translatePhrase } from '../services/translator';
import { translationJobKey } from '../services/translator/jobKey';
import { SubtitleCue } from '../types';
import type { TranslationPatch } from '../services/translator';

chrome.runtime.onInstalled.addListener(() => {
  void stashGeminiKeyFromSettingsBlob().then(() => getSettings({ fresh: true }));
});

chrome.runtime.onStartup.addListener(() => {
  void stashGeminiKeyFromSettingsBlob().then(() => getSettings({ fresh: true }));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (!changes[SETTINGS_KEY] && !changes[SECRET_KEY]) return;
  void getSettings({ fresh: true }).then(applySettingsCache);
});

function pingTab(tabId: number | undefined, message: Record<string, unknown>): void {
  if (typeof tabId !== 'number') return;
  chrome.tabs.sendMessage(tabId, message, () => {
    void chrome.runtime.lastError;
  });
}

function isUdemyCaptionUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === 'https:' &&
      (hostname === 'udemy.com' ||
        hostname.endsWith('.udemy.com') ||
        hostname === 'udemycdn.com' ||
        hostname.endsWith('.udemycdn.com'))
    );
  } catch {
    return false;
  }
}

const CAPTION_FETCH_TIMEOUT_MS = 10000;
const MAX_CAPTION_TEXT_LENGTH = 8_000_000;

async function handleCaptionFetch(
  rawUrl: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: { success: boolean; text?: string }) => void
): Promise<void> {
  if (
    typeof sender.tab?.id !== 'number' ||
    !isUdemyCaptionUrl(sender.url || '') ||
    typeof rawUrl !== 'string' ||
    !isUdemyCaptionUrl(rawUrl)
  ) {
    sendResponse({ success: false });
    return;
  }
  try {
    // Caption URLs are signed by Udemy; never forward session cookies to a CDN URL.
    const response = await fetch(rawUrl, {
      credentials: 'omit',
      signal: AbortSignal.timeout(CAPTION_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      sendResponse({ success: false });
      return;
    }
    const text = await response.text();
    if (text.length > MAX_CAPTION_TEXT_LENGTH) {
      sendResponse({ success: false });
      return;
    }
    sendResponse({ success: true, text });
  } catch {
    sendResponse({ success: false });
  }
}

type TranslationResponse = { success: boolean; cues?: SubtitleCue[]; error?: string };
type TranslationSubscriber = {
  tabId: number | undefined;
  payload: TranslatePayload;
  sendResponse: (response: TranslationResponse) => void;
};
type TranslatePayload = {
  cues?: SubtitleCue[];
  aroundTime?: number;
  lectureId?: string;
  requestId?: number;
  priority?: 'live' | 'rest';
  sourceFingerprint?: string;
  translationFingerprint?: string;
};
type TranslationJob = {
  key: string | null;
  abort: AbortController;
  subscribers: TranslationSubscriber[];
};

const translationJobs = new Map<string, TranslationJob>();
const tabTranslationJobs = new Map<number, TranslationJob>();

function detachTabFromTranslationJob(tabKey: number): void {
  const job = tabTranslationJobs.get(tabKey);
  if (!job) return;
  const remaining = job.subscribers.filter((subscriber) => {
    const subscriberKey = typeof subscriber.tabId === 'number' ? subscriber.tabId : -1;
    return subscriberKey !== tabKey;
  });
  for (const subscriber of job.subscribers) {
    const subscriberKey = typeof subscriber.tabId === 'number' ? subscriber.tabId : -1;
    if (subscriberKey === tabKey) {
      subscriber.sendResponse({
        success: true,
        cues: Array.isArray(subscriber.payload.cues) ? subscriber.payload.cues : [],
      });
    }
  }
  job.subscribers = remaining;
  tabTranslationJobs.delete(tabKey);
  if (!job.subscribers.length) job.abort.abort();
}

function respondToSubscribers(job: TranslationJob, responseFor: (subscriber: TranslationSubscriber) => TranslationResponse): void {
  for (const subscriber of job.subscribers) {
    subscriber.sendResponse(responseFor(subscriber));
  }
}

function liveTranslationScopeMatch(a: TranslatePayload, b: TranslatePayload): boolean {
  return (
    a.priority === 'live' &&
    b.priority === 'live' &&
    typeof a.lectureId === 'string' &&
    a.lectureId === b.lectureId &&
    a.sourceFingerprint === b.sourceFingerprint &&
    a.translationFingerprint === b.translationFingerprint
  );
}

function translatedCuesForSubscriber(
  sourceCues: SubtitleCue[],
  translatedCues: SubtitleCue[]
): SubtitleCue[] {
  const translations = new Map(
    translatedCues
      .filter((cue) => typeof cue.translation === 'string' && cue.translation.trim())
      .map((cue) => [cue.id, cue.translation as string])
  );
  return sourceCues.map((cue) => {
    const translation = translations.get(cue.id);
    return translation ? { ...cue, translation } : cue;
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_CAPTION_VTT') {
    void handleCaptionFetch(message.url, sender, sendResponse);
    return true;
  }

  if (message.type === 'TRANSLATE_CUES') {
    handleTranslateRequest(message.payload, sender.tab?.id, sendResponse);
    return true;
  }

  if (message.type === 'TRANSLATE_PHRASE') {
    handlePhraseRequest(message, sendResponse);
    return true;
  }

  if (message.type === 'STASH_GEMINI_KEY') {
    void stashGeminiKeyFromSettingsBlob().then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'GET_SETTINGS') {
    getSettings({ fresh: true }).then((settings) => {
      sendResponse(senderMayReadSecrets(sender) ? settings : settingsForPage(settings));
    });
    return true;
  }

  if (message.type === 'TEST_GEMINI') {
    if (!senderMayReadSecrets(sender)) {
      sendResponse({ success: false, error: 'denied' });
      return;
    }
    handleGeminiTest(sendResponse);
    return true;
  }
});

async function handleGeminiTest(
  sendResponse: (response: Awaited<ReturnType<typeof testGeminiPipeline>> | { success: false; error: string }) => void
) {
  try {
    const settings = await getSettings({ fresh: true });
    const result = await testGeminiPipeline(settings);
    sendResponse(result);
  } catch (error: unknown) {
    const err = error as { name?: string; message?: string };
    const msg =
      err?.name === 'TimeoutError' || /aborted|timeout/i.test(err?.message || '')
        ? 'Gemini yanıt vermedi (zaman aşımı). Ağı ve modeli kontrol et.'
        : err?.message || 'Gemini test başarısız';
    sendResponse({ success: false, error: msg });
  }
}

async function handlePhraseRequest(
  message: { text?: unknown; targetLang?: unknown },
  sendResponse: (response: { success: boolean; text?: string; error?: string }) => void
) {
  try {
    const text = typeof message.text === 'string' ? message.text : '';
    const targetLang = typeof message.targetLang === 'string' ? message.targetLang : '';
    if (!text.trim() || !/^[a-z]{2,8}$/i.test(targetLang)) {
      sendResponse({ success: false, error: 'bad phrase' });
      return;
    }
    const settings = await getSettings({ fresh: true });
    const translated = await translatePhrase(text, settings, targetLang);
    sendResponse({ success: true, text: translated });
  } catch (error: unknown) {
    const err = error as { message?: string };
    sendResponse({ success: false, error: err?.message || 'Phrase failed' });
  }
}

async function handleTranslateRequest(
  payload: {
    cues?: SubtitleCue[];
    aroundTime?: number;
    lectureId?: string;
    requestId?: number;
    priority?: 'live' | 'rest';
    sourceFingerprint?: string;
    translationFingerprint?: string;
  },
  tabId: number | undefined,
  sendResponse: (response: TranslationResponse) => void
) {
  const typedPayload = payload as TranslatePayload;
  const abortKey = typeof tabId === 'number' ? tabId : -1;
  const key = translationJobKey(typedPayload);
  const existing = key ? translationJobs.get(key) : undefined;
  if (existing && !existing.abort.signal.aborted) {
    existing.subscribers.push({ tabId, payload: typedPayload, sendResponse });
    tabTranslationJobs.set(abortKey, existing);
    return;
  }

  const tabJob = tabTranslationJobs.get(abortKey);
  const tabPayload = tabJob?.subscribers[0]?.payload;
  if (
    tabJob &&
    !tabJob.abort.signal.aborted &&
    tabPayload &&
    liveTranslationScopeMatch(typedPayload, tabPayload)
  ) {
    tabJob.subscribers.push({ tabId, payload: typedPayload, sendResponse });
    return;
  }

  detachTabFromTranslationJob(abortKey);
  const job: TranslationJob = {
    key,
    abort: new AbortController(),
    subscribers: [{ tabId, payload: typedPayload, sendResponse }],
  };
  if (key) translationJobs.set(key, job);
  tabTranslationJobs.set(abortKey, job);

  try {
    const cues = Array.isArray(typedPayload?.cues) ? typedPayload.cues : [];
    const settings = await getSettings({ fresh: true });
    const lectureId = typeof typedPayload?.lectureId === 'string' ? typedPayload.lectureId : '';
    const requestId = typeof typedPayload?.requestId === 'number' ? typedPayload.requestId : 0;
    const aroundTime =
      typeof typedPayload?.aroundTime === 'number' && Number.isFinite(typedPayload.aroundTime)
        ? typedPayload.aroundTime
        : 0;
    const translatedCues = await translateCues(cues, settings, (done, total) => {
      for (const subscriber of job.subscribers) {
        pingTab(subscriber.tabId, {
          type: 'TRANSLATE_PROGRESS',
          done,
          total,
          lectureId,
          requestId: typeof subscriber.payload.requestId === 'number' ? subscriber.payload.requestId : 0,
        });
      }
    }, {
      aroundTime,
      abort: job.abort.signal,
      onBatch: (patches: TranslationPatch[]) => {
        for (const subscriber of job.subscribers) {
          pingTab(subscriber.tabId, {
            type: 'TRANSLATE_PARTIAL',
            patches,
            lectureId,
            requestId: typeof subscriber.payload.requestId === 'number' ? subscriber.payload.requestId : 0,
          });
        }
      },
    });
    respondToSubscribers(job, (subscriber) => ({
      success: true,
      cues: translatedCuesForSubscriber(
        Array.isArray(subscriber.payload.cues) ? subscriber.payload.cues : [],
        translatedCues
      ),
    }));
  } catch (error: unknown) {
    const err = error as { name?: string; message?: string };
    if (err?.name === 'AbortError' || job.abort.signal.aborted) {
      respondToSubscribers(job, (subscriber) => ({
        success: true,
        cues: Array.isArray(subscriber.payload.cues) ? subscriber.payload.cues : [],
      }));
      return;
    }
    console.error('[Duetto] Translation error:', err?.message || 'Translation failed');
    respondToSubscribers(job, () => ({ success: false, error: err?.message || 'Translation failed' }));
  } finally {
    if (job.key && translationJobs.get(job.key) === job) {
      translationJobs.delete(job.key);
    }
    for (const [tab, activeJob] of tabTranslationJobs) {
      if (activeJob === job) tabTranslationJobs.delete(tab);
    }
  }
}
