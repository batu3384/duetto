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
      <div className="flex flex-col items-center justify-center h-[560px] bg-canvas text-mute gap-2.5" role="status">
        <div className="w-5 h-5 rounded-full border-2 border-line border-t-ink animate-spin" aria-hidden />
        <span className="text-xs font-mono tracking-wider text-mute">DUETTO yükleniyor</span>
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
    <div className="flex flex-col h-[560px] bg-canvas text-ink font-sans antialiased">
      <header className="px-3.5 py-2.5 bg-raised border-b border-line flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-canvas border border-line overflow-hidden flex items-center justify-center shrink-0">
            <img src="/icons/duetto-icon-light.svg" alt="Duetto" className="w-full h-full object-cover" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <h1 className="text-sm font-bold tracking-tight text-ink">DUETTO</h1>
            <span className="text-[11px] font-mono text-mute">v2.18.1</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-ink" id="dual-label">
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
            <div className="w-9 h-5 bg-line peer-focus-visible:ring-2 peer-focus-visible:ring-brand-ring rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[6px] after:left-[6px] after:bg-ink after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-brand" />
          </label>
        </div>
      </header>

      <div className="px-3.5 pt-2.5 pb-1 shrink-0">
        <nav className="flex items-center p-0.5 bg-raised rounded-xl border border-line" role="tablist" aria-label="Ayar sekmeleri">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1 min-h-9 py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand-ring ${
                  isActive
                    ? 'bg-brand/20 text-ink font-semibold'
                    : 'text-mute hover:text-ink hover:bg-lift/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <main className="flex-1 overflow-y-auto p-3.5" role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
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
