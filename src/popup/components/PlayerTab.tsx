import React, { useState } from 'react';
import { ExtensionSettings } from '../../types';
import { Tv, RotateCcw, FastForward, Rewind } from 'lucide-react';
import { sendToUdemyTab } from '../sendToTab';

interface Props {
  settings: ExtensionSettings;
  onChange: (updated: Partial<ExtensionSettings>) => void;
}

const SPEED_PRESETS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5];

const btnClass =
  'py-2 bg-[#181a1f] hover:bg-[#20232a] text-zinc-300 rounded-lg border border-[#272a32] text-xs font-medium min-h-8 flex items-center justify-center gap-1 cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-400';

export const PlayerTab: React.FC<Props> = ({ settings, onChange }) => {
  const [pipActive, setPipActive] = useState(false);

  const setSpeed = (val: number) => {
    onChange({ playbackSpeed: val });
    sendToUdemyTab({ type: 'SET_SPEED', speed: val });
  };

  return (
    <div className="space-y-3">
      <div className="p-3 bg-[#111317] rounded-xl border border-[#1f2228] space-y-2.5">
        <div className="flex items-center justify-between">
          <label htmlFor="speed" className="text-xs font-semibold text-zinc-300">
            Oynatma hızı
          </label>
          <span className="font-mono text-xs font-bold text-zinc-200 bg-[#1a1c22] px-2 py-0.5 rounded border border-[#272a32]">
            {settings.playbackSpeed.toFixed(2)}x
          </span>
        </div>

        <input
          id="speed"
          type="range"
          min="0.5"
          max="3.5"
          step="0.05"
          value={settings.playbackSpeed}
          onChange={(e) => setSpeed(parseFloat(e.target.value))}
          className="w-full"
        />

        <div className="grid grid-cols-7 gap-1">
          {SPEED_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setSpeed(preset)}
              className={`min-h-8 py-1 text-[11px] font-mono font-medium rounded-md border focus-visible:ring-2 focus-visible:ring-blue-400 ${
                Math.abs(settings.playbackSpeed - preset) < 0.01
                  ? 'bg-zinc-200 border-white text-zinc-950 font-bold'
                  : 'bg-[#181a1f] border-[#272a32] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {preset}x
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 bg-[#111317] rounded-xl border border-[#1f2228] space-y-2">
        <div className="text-xs font-semibold text-zinc-300">Hızlı atlama</div>
        <div className="grid grid-cols-4 gap-1.5">
          <button type="button" onClick={() => sendToUdemyTab({ type: 'SEEK_VIDEO', seconds: -10 })} className={btnClass}>
            <Rewind className="w-3 h-3" aria-hidden /> -10s
          </button>
          <button type="button" onClick={() => sendToUdemyTab({ type: 'SEEK_VIDEO', seconds: -5 })} className={btnClass}>
            <Rewind className="w-3 h-3" aria-hidden /> -5s
          </button>
          <button type="button" onClick={() => sendToUdemyTab({ type: 'SEEK_VIDEO', seconds: 5 })} className={btnClass}>
            +5s <FastForward className="w-3 h-3" aria-hidden />
          </button>
          <button type="button" onClick={() => sendToUdemyTab({ type: 'SEEK_VIDEO', seconds: 10 })} className={btnClass}>
            +10s <FastForward className="w-3 h-3" aria-hidden />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() =>
            sendToUdemyTab({ type: 'TOGGLE_PIP' }, (res) => {
              const r = res as { pip?: boolean } | undefined;
              setPipActive(!!r?.pip);
            })
          }
          className="flex items-center justify-center gap-2 min-h-10 py-2.5 px-3 bg-[#111317] hover:bg-[#181a1f] text-zinc-200 rounded-xl border border-[#1f2228] focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <Tv className="w-3.5 h-3.5 text-zinc-400" aria-hidden />
          <span className="text-xs font-medium">{pipActive ? 'PiP kapat' : 'Mini PiP'}</span>
        </button>
        <button
          type="button"
          onClick={() => sendToUdemyTab({ type: 'RELOAD_CAPTIONS' })}
          className="flex items-center justify-center gap-2 min-h-10 py-2.5 px-3 bg-[#111317] hover:bg-[#181a1f] text-zinc-200 rounded-xl border border-[#1f2228] focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <RotateCcw className="w-3.5 h-3.5 text-zinc-400" aria-hidden />
          <span className="text-xs font-medium">Altyazıyı yenile</span>
        </button>
      </div>

      <div className="flex items-center justify-between p-3 bg-[#111317] rounded-xl border border-[#1f2228]">
        <div>
          <div className="text-xs font-medium text-zinc-200" id="silence-label">
            Sessizlik atlama
          </div>
          <div className="text-[11px] text-zinc-400">Konuşma duraklarında hızlanır</div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer min-h-8 min-w-8 justify-end">
          <input
            type="checkbox"
            aria-labelledby="silence-label"
            checked={settings.silenceSkipEnabled}
            onChange={(e) => onChange({ silenceSkipEnabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[6px] after:right-[18px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400" />
        </label>
      </div>

      <div className="flex items-center justify-between p-3 bg-[#111317] rounded-xl border border-[#1f2228]">
        <div>
          <div className="text-xs font-medium text-zinc-200" id="sc-label">
            Klavye kısayolları
          </div>
          <div className="text-[11px] text-zinc-400">Udemy sayfasında D P J L [ ] S</div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer min-h-8 min-w-8 justify-end">
          <input
            type="checkbox"
            aria-labelledby="sc-label"
            checked={settings.shortcutsEnabled}
            onChange={(e) => onChange({ shortcutsEnabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[6px] after:right-[18px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400" />
        </label>
      </div>

      <div className="p-2.5 bg-[#0e1013] rounded-xl border border-[#181a1f] space-y-1.5">
        <div className="text-[11px] font-mono text-zinc-400">Kısayollar</div>
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          {[
            ['Çift altyazı', 'D'],
            ['Mini PiP', 'P'],
            ['Not + kare', 'S'],
            ['-5s / +5s', 'J L'],
            ['Hız', '[ ]'],
          ].map(([label, keys]) => (
            <div key={label} className="flex items-center justify-between p-1.5 min-h-8 bg-[#14161a] rounded-lg border border-[#1e2026]">
              <span className="text-zinc-400">{label}</span>
              <kbd className="px-1.5 py-0.5 bg-zinc-800 text-zinc-200 rounded font-mono text-[11px]">{keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
