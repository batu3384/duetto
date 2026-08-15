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
        <div className="p-2.5 rounded-lg border border-amber-900/50 bg-amber-950/30 text-xs text-amber-200">
          Çeviri yalnız Gemini. Google Translate kaldırıldı. Anahtar olmadan altyazı çevrilmez.
        </div>
      )}

      <div className="p-3 bg-[#111317] rounded-xl border border-[#1f2228] space-y-2.5">
        <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
          <span>Gemini</span>
          <span className={`font-mono text-[11px] ${hasKey ? 'text-emerald-400' : 'text-amber-400'}`}>
            {hasKey ? 'Anahtar var' : 'Anahtar gerekli'}
          </span>
        </div>

        <p className="text-[11px] text-zinc-500 leading-snug">
          Anahtar bu cihazda, uzantı deposunda kalır. Udemy sayfasına ve senkronize hesaba gitmez. Sayfa yenilemek silmez.
        </p>

        <div className="space-y-1">
          <label htmlFor="gemini-model" className="text-xs text-zinc-400">
            Model
          </label>
          <select
            id="gemini-model"
            value={settings.geminiModel || 'gemini-3.5-flash-lite'}
            onChange={(e) => onChange({ geminiModel: e.target.value })}
            className="w-full bg-[#181a1f] border border-[#272a32] text-zinc-200 text-xs rounded-lg px-2.5 py-2 outline-none font-medium cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            {AVAILABLE_GEMINI_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <label htmlFor="api-key">API anahtarı</label>
            <span className={`font-mono ${hasKey ? 'text-zinc-400' : 'text-amber-400'}`}>
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
            className="w-full bg-[#181a1f] border border-[#272a32] text-zinc-200 text-xs rounded-lg px-2.5 py-2 outline-none font-mono focus-visible:ring-2 focus-visible:ring-blue-400"
          />
          {hasKey && (
            <button
              type="button"
              onClick={() => {
                setKeyDraft('');
                void onChange({ geminiApiKey: '' });
              }}
              className="text-[11px] text-zinc-500 hover:text-red-400 min-h-8"
            >
              Anahtarı bu cihazdan sil
            </button>
          )}
        </div>

        <div className="space-y-1 pt-1 border-t border-[#1b1e24]">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <label htmlFor="temp">Çeviri doğallığı</label>
            <span className="font-mono text-zinc-300 font-bold">{(settings.geminiTemperature ?? 0.2).toFixed(1)}</span>
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
          className="w-full min-h-10 py-2 bg-[#1e222a] hover:bg-[#282d38] text-zinc-200 text-xs font-semibold rounded-lg border border-[#2d323e] disabled:opacity-50 flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <Activity className="w-3.5 h-3.5 text-zinc-400" aria-hidden />
          <span>{testing ? 'Çeviri test ediliyor…' : 'Gemini çevirisini test et'}</span>
        </button>

        {testResult && (
          <div
            role="status"
            aria-live="polite"
            className={`p-2.5 rounded-lg text-xs flex items-start gap-2 ${
              testResult.success
                ? 'bg-[#101b15] text-emerald-300 border border-emerald-900/60'
                : 'bg-[#221313] text-red-300 border border-red-900/60'
            }`}
          >
            {testResult.success ? (
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" aria-hidden />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" aria-hidden />
            )}
            <div className="flex-1 min-w-0 space-y-1">
              {testResult.success ? (
                <>
                  <div className="font-medium">Gemini çalışıyor ({testResult.model})</div>
                  <div className="text-[11px] font-mono text-emerald-400/90">{testResult.latencyMs} ms</div>
                  {testResult.phrase && (
                    <div className="text-[11px] text-zinc-300 break-words">
                      Kelime: <span className="text-zinc-400">{testResult.phrase.source}</span> →{' '}
                      <span className="text-white">{testResult.phrase.translation}</span>
                    </div>
                  )}
                  <div className="text-[11px] text-emerald-200/80">Altyazı çevirisi bu ders için yeniden başladı.</div>
                </>
              ) : (
                <div className="font-medium break-words">{testResult.error}</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="p-3 bg-[#111317] rounded-xl border border-[#1f2228] space-y-2">
        <div className="text-xs font-semibold text-zinc-300">Korunan terimler</div>
        <div className="text-[11px] text-zinc-400">Çeviride orijinal kalacak teknik sözcükler.</div>

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
            className="flex-1 bg-[#181a1f] border border-[#272a32] text-zinc-200 text-xs rounded-lg px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          />
          <button
            type="button"
            onClick={handleAddTerm}
            aria-label="Terim ekle"
            className="min-w-8 min-h-8 px-2.5 py-1 bg-[#20242e] hover:bg-[#2c3240] text-zinc-200 rounded-lg border border-[#2f3544] focus-visible:ring-2 focus-visible:ring-blue-400"
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
                className="inline-flex items-center gap-1 px-2 py-1 bg-[#181a1f] text-zinc-300 text-[11px] font-mono rounded-md border border-[#272a32]"
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
                    className="hover:text-red-400 focus-visible:ring-2 focus-visible:ring-blue-400 rounded"
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
