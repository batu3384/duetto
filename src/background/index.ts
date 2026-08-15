import { applySettingsCache, getSettings, SECRET_KEY, SETTINGS_KEY, senderMayReadSecrets, settingsForPage, stashGeminiKeyFromSettingsBlob } from '../services/storage';
import { testGeminiPipeline, translateCues, translatePhrase } from '../services/translator';
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

let restAbort: AbortController | null = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
  },
  tabId: number | undefined,
  sendResponse: (response: { success: boolean; cues?: SubtitleCue[]; error?: string }) => void
) {
  const priority = payload?.priority === 'live' ? 'live' : 'rest';
  if (priority === 'live') restAbort?.abort();
  const abort = new AbortController();
  if (priority === 'rest') restAbort = abort;

  try {
    const cues = Array.isArray(payload?.cues) ? payload.cues : [];
    const settings = await getSettings({ fresh: true });
    const lectureId = typeof payload?.lectureId === 'string' ? payload.lectureId : '';
    const requestId = typeof payload?.requestId === 'number' ? payload.requestId : 0;
    const aroundTime = typeof payload?.aroundTime === 'number' && Number.isFinite(payload.aroundTime) ? payload.aroundTime : 0;
    const translatedCues = await translateCues(cues, settings, (done, total) => {
      pingTab(tabId, { type: 'TRANSLATE_PROGRESS', done, total, lectureId, requestId });
    }, {
      aroundTime,
      abort: abort.signal,
      onBatch: (patches: TranslationPatch[]) => {
        pingTab(tabId, { type: 'TRANSLATE_PARTIAL', patches, lectureId, requestId });
      },
    });
    sendResponse({ success: true, cues: translatedCues });
  } catch (error: unknown) {
    const err = error as { name?: string; message?: string };
    if (err?.name === 'AbortError' || abort.signal.aborted) {
      sendResponse({ success: true, cues: Array.isArray(payload?.cues) ? payload.cues : [] });
      return;
    }
    console.error('[Duetto] Translation error:', err?.message || 'Translation failed');
    sendResponse({ success: false, error: err?.message || 'Translation failed' });
  } finally {
    if (priority === 'rest' && restAbort === abort) restAbort = null;
  }
}
