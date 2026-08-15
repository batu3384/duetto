import React, { useState, useEffect } from 'react';
import { DEFAULT_SETTINGS, ExtensionSettings } from '../types';
import { flushPendingSave, getSettings, saveSettings, SETTINGS_KEY, settingsForPage } from '../services/storage';
import { SubtitlesTab } from './components/SubtitlesTab';
import { PlayerTab } from './components/PlayerTab';
import { AiTab } from './components/AiTab';
import { NotesTab } from './components/NotesTab';
import { Captions, Sliders, Cpu, StickyNote } from 'lucide-react';
import { sendToUdemyTab } from './sendToTab';

type TabKey = 'subtitles' | 'player' | 'ai' | 'notes';

export default function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<TabKey>('subtitles');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    getSettings().then((data) => {
      setSettings(data);
      setLoading(false);
    });
    const onStore = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== 'local' || !changes[SETTINGS_KEY]) return;
      void getSettings({ fresh: true }).then(setSettings);
    };
    chrome.storage.onChanged.addListener(onStore);
    const flush = () => {
      void flushPendingSave();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    return () => {
      chrome.storage.onChanged.removeListener(onStore);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  const handleUpdateSettings = async (updated: Partial<ExtensionSettings>) => {
    const newSettings = await saveSettings(updated);
    setSettings(newSettings);
    sendToUdemyTab({ type: 'UPDATE_SETTINGS', settings: settingsForPage(newSettings) });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[560px] bg-[#090a0c] text-zinc-300 gap-2.5">
        <div className="w-5 h-5 rounded-full border-2 border-zinc-600 border-t-zinc-200 animate-spin" />
        <span className="text-xs font-mono tracking-wider text-zinc-400">DUETTO</span>
      </div>
    );
  }

  const tabs: { id: TabKey; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'subtitles', label: 'Altyazı', icon: Captions },
    { id: 'player', label: 'Oynatıcı', icon: Sliders },
    { id: 'ai', label: 'Gemini', icon: Cpu },
    { id: 'notes', label: 'Notlar', icon: StickyNote },
  ];

  return (
    <div className="flex flex-col h-[560px] bg-[#090a0c] text-zinc-100 font-sans antialiased">
      <header className="px-3.5 py-2.5 bg-[#101216] border-b border-[#1f2228] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-zinc-900 border border-zinc-700/80 overflow-hidden flex items-center justify-center shrink-0">
            <img src="/icons/duetto-icon-light.svg" alt="Duetto" className="w-full h-full object-cover" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <h1 className="text-sm font-bold tracking-tight text-white">DUETTO</h1>
            <span className="text-[11px] font-mono text-zinc-400">v2.17.0</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-300" id="dual-label">
            Çift Altyazı
          </span>
          <label className="relative inline-flex items-center cursor-pointer min-h-8 min-w-8 justify-center">
            <input
              type="checkbox"
              aria-labelledby="dual-label"
              checked={settings.dualSubtitlesEnabled}
              onChange={(e) => handleUpdateSettings({ dualSubtitlesEnabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-zinc-700 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[6px] after:left-[6px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600" />
          </label>
        </div>
      </header>

      <div className="px-3.5 pt-2.5 pb-1 shrink-0">
        <nav className="flex items-center p-0.5 bg-[#121418] rounded-xl border border-[#20232a]" aria-label="Ayar sekmeleri">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex-1 flex items-center justify-center gap-1 min-h-9 py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-blue-400 ${
                  isActive
                    ? 'bg-[#222630] text-white font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <main className="flex-1 overflow-y-auto p-3.5">
        {activeTab === 'subtitles' && (
          <SubtitlesTab settings={settings} onChange={handleUpdateSettings} />
        )}
        {activeTab === 'player' && (
          <PlayerTab settings={settings} onChange={handleUpdateSettings} />
        )}
        {activeTab === 'ai' && (
          <AiTab settings={settings} onChange={handleUpdateSettings} />
        )}
        {activeTab === 'notes' && <NotesTab />}
      </main>
    </div>
  );
}
