import React, { useEffect, useState } from 'react';
import { ExtensionSettings } from '../../types';
import { CheckCircle, AlertCircle, Plus, X, Activity } from 'lucide-react';
import { sendToUdemyTab } from '../sendToTab';

interface Props {
  settings: ExtensionSettings;
  onChange: (updated: Partial<ExtensionSettings>) => void | Promise<void>;
}

const AVAILABLE_GEMINI_MODELS = [
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite (önerilen)' },
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash' },
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
  { id: 'gemini-flash-latest', name: 'Gemini Flash Latest' },
];

type TestResult =
  | {
      success: true;
      latencyMs: number;
      model: string;
      phrase?: { source: string; translation: string };
      subtitle?: { source: string; translation: string };
    }
  | { success: false; error: string };

function runGeminiPipelineTest(): Promise<TestResult> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'TEST_GEMINI' }, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message || 'Background yanıt vermedi' });
        return;
      }
      if (!res) {
        resolve({ success: false, error: 'Boş yanıt. Uzantıyı yeniden yükleyin.' });
        return;
      }
      resolve(res as TestResult);
    });
  });
}

export const AiTab: React.FC<Props> = ({ settings, onChange }) => {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [newTerm, setNewTerm] = useState('');
  const [keyDraft, setKeyDraft] = useState(settings.geminiApiKey);

  useEffect(() => {
    setKeyDraft(settings.geminiApiKey);
  }, [settings.geminiApiKey]);

  const hasKey = keyDraft.trim().length > 8;

  const commitKey = async (raw: string) => {
    const key = raw.trim();
    if (key === settings.geminiApiKey) return;
    await onChange({ geminiApiKey: key });
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const key = keyDraft.trim();
      if (!key) throw new Error('Önce API anahtarını yazın.');
      await commitKey(key);
      const result = await runGeminiPipelineTest();
      setTestResult(result);
      if (result.success) sendToUdemyTab({ type: 'TRIGGER_TRANSLATE' });
    } catch (err: unknown) {
      const e = err as { message?: string };
      setTestResult({ success: false, error: e?.message || 'Test başarısız.' });
    } finally {
      setTesting(false);
    }
  };

  const handleAddTerm = () => {
    const term = newTerm.trim().toLowerCase();
    if (!term) return;
    const current = settings.customProtectedTerms || [];
    if (!current.includes(term)) {
      onChange({ customProtectedTerms: [...current, term] });
    }
    setNewTerm('');
  };

  return (
    <div className="space-y-3">
      {!hasKey && (
        <div className="p-2.5 rounded-lg border border-warn/30 bg-warn-dim text-xs text-warn-fg">
          Çeviri yalnız Gemini. Google Translate kaldırıldı. Anahtar olmadan altyazı çevrilmez.
        </div>
      )}

      <div className="p-3 bg-surface rounded-xl border border-line space-y-2.5">
        <div className="flex items-center justify-between text-xs font-semibold text-ink">
          <span>Gemini</span>
          <span className={`font-mono text-[11px] ${hasKey ? 'text-ok' : 'text-warn'}`}>
            {hasKey ? 'Anahtar var' : 'Anahtar gerekli'}
          </span>
        </div>

        <p className="text-[11px] text-faint leading-snug">
          Anahtar bu cihazda, uzantı deposunda kalır. Udemy sayfasına ve senkronize hesaba gitmez. Sayfa yenilemek silmez.
        </p>

        <div className="space-y-1">
          <label htmlFor="gemini-model" className="text-xs text-mute">
            Model
          </label>
          <select
            id="gemini-model"
            value={settings.geminiModel || 'gemini-3.5-flash-lite'}
            onChange={(e) => onChange({ geminiModel: e.target.value })}
            className="w-full bg-inset border border-line text-ink text-xs rounded-lg px-2.5 py-2 outline-none font-medium cursor-pointer focus-visible:ring-2 focus-visible:ring-brand-ring"
          >
            {AVAILABLE_GEMINI_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-mute">
            <label htmlFor="api-key">API anahtarı</label>
            <span className={`font-mono ${hasKey ? 'text-mute' : 'text-warn'}`}>
              {hasKey ? 'Kayıtlı' : 'Yok'}
            </span>
          </div>
          <input
            id="api-key"
            type="password"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Google AI Studio anahtarı"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            onBlur={() => void commitKey(keyDraft)}
            className="w-full bg-inset border border-line text-ink text-xs rounded-lg px-2.5 py-2 outline-none font-mono focus-visible:ring-2 focus-visible:ring-brand-ring"
          />
          {hasKey && (
            <button
              type="button"
              onClick={() => {
                setKeyDraft('');
                void onChange({ geminiApiKey: '' });
              }}
              className="text-[11px] text-faint hover:text-danger-fg min-h-8"
            >
              Anahtarı bu cihazdan sil
            </button>
          )}
        </div>

        <div className="space-y-1 pt-1 border-t border-line">
          <div className="flex items-center justify-between text-xs text-mute">
            <label htmlFor="temp">Çeviri doğallığı</label>
            <span className="font-mono text-ink font-bold">{(settings.geminiTemperature ?? 0.2).toFixed(1)}</span>
          </div>
          <input
            id="temp"
            type="range"
            min="0.0"
            max="0.7"
            step="0.1"
            value={settings.geminiTemperature ?? 0.2}
            onChange={(e) => onChange({ geminiTemperature: parseFloat(e.target.value) })}
            className="w-full"
          />
        </div>

        <button
          type="button"
          onClick={handleTestConnection}
          disabled={testing || !hasKey}
          className="w-full min-h-10 py-2 bg-inset hover:bg-lift text-ink text-xs font-semibold rounded-lg border border-line disabled:opacity-50 flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-brand-ring"
        >
          <Activity className="w-3.5 h-3.5 text-mute" aria-hidden />
          <span>{testing ? 'Çeviri test ediliyor…' : 'Gemini çevirisini test et'}</span>
        </button>

        {testResult && (
          <div
            role={testResult.success ? 'status' : 'alert'}
            aria-live={testResult.success ? 'polite' : 'assertive'}
            className={`p-2.5 rounded-lg text-xs flex items-start gap-2 ${
              testResult.success
                ? 'bg-ok-dim text-ok-fg border border-ok/40'
                : 'bg-danger-dim text-danger-fg border border-danger/40'
            }`}
          >
            {testResult.success ? (
              <CheckCircle className="w-3.5 h-3.5 text-ok shrink-0 mt-0.5" aria-hidden />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-danger shrink-0 mt-0.5" aria-hidden />
            )}
            <div className="flex-1 min-w-0 space-y-1">
              {testResult.success ? (
                <>
                  <div className="font-medium">Gemini çalışıyor ({testResult.model})</div>
                  <div className="text-[11px] font-mono text-ok/90">{testResult.latencyMs} ms</div>
                  {testResult.phrase && (
                    <div className="text-[11px] text-ink break-words">
                      Kelime: <span className="text-mute">{testResult.phrase.source}</span> →{' '}
                      <span className="text-ink">{testResult.phrase.translation}</span>
                    </div>
                  )}
                  <div className="text-[11px] text-ok-fg">Altyazı çevirisi bu ders için yeniden başladı.</div>
                </>
              ) : (
                <div className="font-medium break-words">{testResult.error}</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="p-3 bg-surface rounded-xl border border-line space-y-2">
        <div className="text-xs font-semibold text-ink">Korunan terimler</div>
        <div className="text-[11px] text-mute">Çeviride orijinal kalacak teknik sözcükler.</div>

        <div className="flex gap-1.5">
          <label className="sr-only" htmlFor="new-term">
            Yeni terim
          </label>
          <input
            id="new-term"
            type="text"
            placeholder="Terim yazın…"
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTerm()}
            className="flex-1 bg-inset border border-line text-ink text-xs rounded-lg px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
          />
          <button
            type="button"
            onClick={handleAddTerm}
            aria-label="Terim ekle"
            className="min-w-8 min-h-8 px-2.5 py-1 bg-inset hover:bg-lift text-ink rounded-lg border border-line focus-visible:ring-2 focus-visible:ring-brand-ring"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>

        <div className="flex flex-wrap gap-1 pt-1">
          {['props', 'state', 'hook', 'closure', ...(settings.customProtectedTerms || [])].map((term) => {
            const isCustom = (settings.customProtectedTerms || []).includes(term);
            return (
              <span
                key={term}
                className="inline-flex items-center gap-1 px-2 py-1 bg-inset text-ink text-[11px] font-mono rounded-md border border-line"
              >
                {term}
                {isCustom && (
                  <button
                    type="button"
                    aria-label={`${term} sil`}
                    onClick={() =>
                      onChange({
                        customProtectedTerms: (settings.customProtectedTerms || []).filter((t) => t !== term),
                      })
                    }
                    className="hover:text-danger-fg focus-visible:ring-2 focus-visible:ring-brand-ring rounded"
                  >
                    <X className="w-2.5 h-2.5" aria-hidden />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};
