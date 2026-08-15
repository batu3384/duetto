import React from 'react';
import {
  DEFAULT_SETTINGS,
  ExtensionSettings,
  SubtitleAlign,
  SubtitleFontFamily,
  SubtitleLayoutMode,
  SUPPORTED_LANGUAGES,
} from '../../types';
import { ArrowLeftRight, Eye, Sparkles, ArrowUpDown } from 'lucide-react';
import { sendToUdemyTab } from '../sendToTab';
import {
  captionLook,
  BOX_COLORS,
  DOCK_COLORS,
  dockFill,
  EDGE_OPTIONS,
  edgeTextShadow,
  SUBTITLE_FONTS,
  TEXT_COLORS,
} from '../../services/subtitleLook';
import { keyIsConfigured } from '../../services/storage';

interface Props {
  settings: ExtensionSettings;
  onChange: (updated: Partial<ExtensionSettings>) => void;
}

function ColorSwatches({
  value,
  onChange,
  colors,
}: {
  value: string;
  onChange: (color: string) => void;
  colors: { name: string; color: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {colors.map((p) => (
        <button
          key={p.color}
          type="button"
          aria-label={p.name}
          title={p.name}
          onClick={() => onChange(p.color)}
          style={{ backgroundColor: p.color }}
          className={`w-7 h-7 min-w-7 min-h-7 rounded-md border cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-400 ${
            value.toLowerCase() === p.color ? 'border-white ring-1 ring-white' : 'border-black/50 hover:border-white/50'
          }`}
        />
      ))}
      <label
        className="relative w-7 h-7 min-w-7 min-h-7 rounded-md overflow-hidden border border-[#3a3f4a] cursor-pointer"
        title="Özel renk"
      >
        <input
          type="color"
          aria-label="Özel renk"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
        <span className="block w-full h-full" style={{ background: `conic-gradient(#f87171,#fde047,#4ade80,#38bdf8,#e879f9,#f87171)` }} />
      </label>
    </div>
  );
}

const DOCK_SCENE_BG =
  'radial-gradient(90% 70% at 78% 18%, rgba(56,189,248,0.18), transparent 55%), linear-gradient(155deg,#0b1220 0%,#152a44 48%,#0c1929 100%)';

function DockColorPresets({
  value,
  opacity,
  onChange,
}: {
  value: string;
  opacity: number;
  onChange: (color: string) => void;
}) {
  const selected = value.toLowerCase();
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {DOCK_COLORS.map((p) => {
        const fill = dockFill(p.color, opacity);
        const active = selected === p.color;
        return (
          <button
            key={p.color}
            type="button"
            aria-label={p.name}
            title={p.name}
            onClick={() => onChange(p.color)}
            className={`rounded-lg overflow-hidden border text-left focus-visible:ring-2 focus-visible:ring-blue-400 cursor-pointer ${
              active ? 'border-white ring-1 ring-white' : 'border-[#272a32] hover:border-white/40'
            }`}
          >
            <div className="h-7 relative" style={{ background: DOCK_SCENE_BG }}>
              <div className="absolute left-1.5 top-1.5 w-5 h-3 rounded-sm bg-sky-200/10 border border-white/10" />
              <div className="absolute right-2 top-2 w-7 h-1 rounded bg-white/10" />
            </div>
            <div
              className="h-9 px-1 flex flex-col items-center justify-center gap-0 border-t border-white/[0.08]"
              style={{ background: fill }}
            >
              <span className="text-[7px] leading-tight font-medium text-white" style={{ textShadow: '0 0 3px #000' }}>
                Original
              </span>
              <span className="text-[6px] leading-tight font-bold text-[#fde047]" style={{ textShadow: '0 0 3px #000' }}>
                Çeviri
              </span>
            </div>
            <div className="px-1 py-0.5 text-[9px] text-zinc-400 text-center truncate bg-[#14161c]">{p.name}</div>
          </button>
        );
      })}
      <label
        className="rounded-lg overflow-hidden border border-[#272a32] cursor-pointer focus-within:ring-2 focus-within:ring-blue-400"
        title="Özel renk"
      >
        <input
          type="color"
          aria-label="Özel kuyu rengi"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="sr-only"
        />
        <div className="h-7" style={{ background: DOCK_SCENE_BG }} />
        <div
          className="h-9 flex items-center justify-center border-t border-white/[0.08]"
          style={{ background: dockFill(value, opacity) }}
        >
          <span
            className="block w-7 h-7 rounded-md border border-black/40"
            style={{ background: `conic-gradient(#f87171,#fde047,#4ade80,#38bdf8,#e879f9,#f87171)` }}
          />
        </div>
        <div className="px-1 py-0.5 text-[9px] text-zinc-400 text-center bg-[#14161c]">Özel</div>
      </label>
    </div>
  );
}

function FontPicker({
  value,
  onChange,
}: {
  value: SubtitleFontFamily;
  onChange: (id: SubtitleFontFamily) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {SUBTITLE_FONTS.map((f) => {
        const selected = value === f.id;
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(f.id)}
            className={`min-h-11 px-2 py-1.5 rounded-lg border text-left cursor-pointer transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-blue-400 ${
              selected ? 'border-white bg-[#282d38] ring-1 ring-white' : 'border-[#272a32] bg-[#181a1f] hover:border-white/40'
            }`}
          >
            <span className="block text-[13px] leading-tight text-white font-bold" style={{ fontFamily: f.stack, textShadow: '1px 1px 0 #000,-1px 1px 0 #000,1px -1px 0 #000,-1px -1px 0 #000' }}>
              Duetto
            </span>
            <span className={`block text-[10px] mt-0.5 ${selected ? 'text-zinc-200' : 'text-zinc-500'}`}>{f.name}</span>
          </button>
        );
      })}
    </div>
  );
}

const ALIGN_OPTIONS: { id: SubtitleAlign; name: string }[] = [
  { id: 'left', name: 'Sol' },
  { id: 'center', name: 'Orta' },
  { id: 'right', name: 'Sağ' },
];

const fieldClass =
  'w-full bg-[#181a1f] border border-[#272a32] text-zinc-200 text-xs rounded-lg px-2.5 py-2 focus-visible:ring-2 focus-visible:ring-blue-400 outline-none font-medium cursor-pointer';

const chipOn = 'bg-[#282d38] text-white font-semibold cursor-pointer';
const chipOff = 'text-zinc-400 hover:text-zinc-200 cursor-pointer';

export const SubtitlesTab: React.FC<Props> = ({ settings, onChange }) => {
  const { subStyle } = settings;
  const look = captionLook(subStyle);

  const retrigger = () => sendToUdemyTab({ type: 'TRIGGER_TRANSLATE' });

  const handleSwapLanguages = () => {
    onChange({
      sourceLang: settings.targetLang,
      targetLang: settings.sourceLang,
    });
    retrigger();
  };

  const updateSubStyle = (styleUpdate: Partial<typeof subStyle>) => {
    onChange({
      subStyle: {
        ...subStyle,
        ...styleUpdate,
      },
    });
  };

  const showSource = subStyle.layoutMode !== 'target_only';
  const showTarget = subStyle.layoutMode !== 'source_only';
  const targetFirst = subStyle.order === 'target_top';
  const below = subStyle.placement === 'below';
  const dockBg = dockFill(subStyle.dockColor || '#000000', subStyle.dockOpacity ?? 0);

  const previewLines = (
    <div className="relative" style={{ fontFamily: look.font, textAlign: look.align }}>
      {showTarget && targetFirst && (
        <div style={{ fontSize: 12, color: look.secondaryColor, fontWeight: 700, textShadow: look.shadow }}>
          Bu özel hook ile state yönetiyoruz.
        </div>
      )}
      {showSource && (
        <div style={{ fontSize: 12, color: look.primaryColor, fontWeight: 700, textShadow: look.shadow }}>
          We use this custom <span style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>hook</span> to manage state.
        </div>
      )}
      {showTarget && !targetFirst && (
        <div style={{ fontSize: 12, color: look.secondaryColor, fontWeight: 700, textShadow: look.shadow }}>
          Bu özel hook ile state yönetiyoruz.
        </div>
      )}
    </div>
  );

  const overlayCaption = (
    <div className="relative max-w-[94%] rounded-lg px-3 py-1.5">
      {look.blur && (
        <div
          className="absolute inset-0 rounded-lg"
          style={{
            backdropFilter: 'blur(12px) saturate(1.3)',
            WebkitBackdropFilter: 'blur(12px) saturate(1.3)',
            background: look.boxFill,
          }}
        />
      )}
      {!look.blur && !look.zero && (
        <div className="absolute inset-0 rounded-lg" style={{ background: look.boxFill }} />
      )}
      <div className="relative">{previewLines}</div>
    </div>
  );

  const scene = (
    <div
      className="absolute inset-0"
      style={{
        background: below ? '#f4f4f1' : DOCK_SCENE_BG,
      }}
    >
      {below ? (
        <>
          <div className="absolute left-3 top-2.5 text-[9px] font-bold tracking-wide" style={{ color: '#b8c92e' }}>
            SLIDE
          </div>
          <div className="absolute left-3 top-8 w-24 h-1.5 rounded bg-zinc-300" />
          <div className="absolute left-3 top-11 w-16 h-1.5 rounded bg-zinc-200" />
        </>
      ) : (
        <>
          <div className="absolute left-3 top-3 w-16 h-10 rounded-sm bg-sky-200/10 border border-white/10" />
          <div className="absolute right-8 top-6 w-24 h-2 rounded bg-white/10" />
          <div className="absolute right-10 top-10 w-16 h-2 rounded bg-white/5" />
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {!keyIsConfigured(settings) ? (
        <div className="p-2.5 rounded-lg border border-amber-900/50 bg-amber-950/30 text-xs text-amber-200">
          Çeviri yalnız Gemini. Anahtar yok → sarı çeviri satırı gelmez. Gemini sekmesinden anahtar + test.
        </div>
      ) : (
        <div className="p-2 rounded-lg border border-emerald-900/40 bg-emerald-950/20 text-[11px] text-emerald-300/90 flex items-center justify-between gap-2">
          <span>Gemini anahtarı kayıtlı</span>
          <span className="font-mono text-emerald-400/80">hedef: {settings.targetLang}</span>
        </div>
      )}

      <div className="p-3 bg-[#111317] rounded-xl border border-[#1f2228] space-y-2.5">
        <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
          <span>Dil seçimi</span>
          <span className="font-mono text-[11px] text-zinc-400">Kaynak → Hedef</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label className="sr-only" htmlFor="src-lang">
              Kaynak dil
            </label>
            <select
              id="src-lang"
              value={settings.sourceLang}
              onChange={(e) => {
                onChange({ sourceLang: e.target.value });
                retrigger();
              }}
              className={fieldClass}
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.nativeName}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleSwapLanguages}
            aria-label="Dilleri takas et"
            title="Dilleri takas et"
            className="min-w-8 min-h-8 p-2 bg-[#1e2127] hover:bg-[#282c35] text-zinc-300 rounded-lg border border-[#2c3038] focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <ArrowLeftRight className="w-4 h-4" aria-hidden />
          </button>

          <div className="flex-1">
            <label className="sr-only" htmlFor="tgt-lang">
              Hedef dil
            </label>
            <select
              id="tgt-lang"
              value={settings.targetLang}
              onChange={(e) => {
                onChange({ targetLang: e.target.value });
                retrigger();
              }}
              className={`${fieldClass} border-blue-500/40`}
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.nativeName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1.5 border-t border-[#1b1e24]">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-zinc-400" aria-hidden />
            <span className="text-xs font-medium text-zinc-300" id="term-lock-label">
              Teknik terimleri koru
            </span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer min-h-8 min-w-8 justify-end">
            <input
              type="checkbox"
              aria-labelledby="term-lock-label"
              checked={settings.termLockEnabled}
              onChange={(e) => onChange({ termLockEnabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-zinc-700 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[6px] after:right-[18px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600" />
          </label>
        </div>
      </div>

      <div className="sticky top-0 z-10 -mx-0.5 pb-1 bg-[#090a0c]">
      <div className="p-0 bg-transparent space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
          <div className="flex items-center gap-1">
            <Eye className="w-3 h-3" aria-hidden />
            <span>Canlı oynatıcı</span>
          </div>
          <span>{below ? 'Video altında' : subStyle.position === 'top' ? 'Video üstünde · üst' : 'Video üstünde'}</span>
        </div>
        <div className="rounded-xl overflow-hidden border border-[#2a2e38] bg-[#0c0e12] shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-between px-2.5 h-6 bg-[#14161c] text-[10px] text-zinc-500">
            <span>Ders önizleme</span>
            <span className="font-mono tabular-nums">3:21 / 12:08</span>
          </div>
          {below ? (
            <div className="flex flex-col h-[124px]">
              <div className="relative flex-1 min-h-0 overflow-hidden">{scene}</div>
              <div className="relative h-3 shrink-0 -mb-px pointer-events-none" aria-hidden>
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(to bottom, transparent, #f4f4f1)' }}
                />
              </div>
              <div
                className={`relative shrink-0 px-4 py-3 flex ${
                  look.align === 'left' ? 'justify-start' : look.align === 'right' ? 'justify-end' : 'justify-center'
                }`}
                style={{ background: '#f4f4f1' }}
              >
                <div className="absolute inset-0 pointer-events-none" style={{ background: dockBg }} aria-hidden />
                <div className="relative">{previewLines}</div>
              </div>
            </div>
          ) : (
            <div className="relative h-[118px]">
              {scene}
              <div className="absolute top-2 right-2 flex items-center gap-0 rounded-lg border border-white/10 bg-black/80 px-0.5 py-0.5">
                <span className="w-5 h-5 rounded-md bg-white/15" />
                <span className="px-1.5 text-[9px] font-mono text-white/90">1.00x</span>
                <span className="w-5 h-5 rounded-md bg-white/5" />
              </div>
              <div
                className={`absolute inset-x-2 flex ${
                  subStyle.position === 'top' ? 'top-2' : 'bottom-2'
                } ${look.align === 'left' ? 'justify-start' : look.align === 'right' ? 'justify-end' : 'justify-center'}`}
              >
                {overlayCaption}
              </div>
            </div>
          )}
          <div className="h-1 bg-[#1a1c22]">
            <div className="h-full w-[28%] bg-blue-500/80" />
          </div>
        </div>
        {look.reducedTransparency && subStyle.blur && !below && (
          <p className="text-[10px] text-amber-400/90">Sistem saydamlığı kapalı — cam kapalı.</p>
        )}
      </div>
      </div>

      <div className="p-3 bg-[#111317] rounded-xl border border-[#1f2228] space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-zinc-300">Görünüm</div>
          <button
            type="button"
            onClick={() =>
              updateSubStyle({
                ...DEFAULT_SETTINGS.subStyle,
                layoutMode: subStyle.layoutMode,
                order: subStyle.order,
                placement: subStyle.placement,
                position: subStyle.position,
                dockColor: subStyle.dockColor,
                dockOpacity: subStyle.dockOpacity,
                dockAmbient: subStyle.dockAmbient,
                videoFit: subStyle.videoFit,
                edgeColor: subStyle.edgeColor,
              })
            }
            className="text-[11px] text-zinc-400 hover:text-zinc-200 min-h-8 px-2 rounded border border-[#272a32] focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            Sıfırla
          </button>
        </div>

        {!below && (
          <>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="bg-opacity" className="text-zinc-300 font-medium">
              Kutu şeffaflığı
            </label>
            <span className="font-mono text-[11px] text-zinc-400">%{subStyle.bgOpacity}</span>
          </div>
          <input
            id="bg-opacity"
            type="range"
            min="0"
            max="100"
            step="5"
            value={subStyle.bgOpacity}
            onChange={(e) => updateSubStyle({ bgOpacity: parseInt(e.target.value, 10) })}
            className="w-full"
          />
        </div>

        <div className="flex items-center justify-between p-2 min-h-8 bg-[#16181e] rounded-lg border border-[#20232a]">
          <span className="text-xs font-medium text-zinc-300" id="blur-label">
            Cam bulanıklığı
          </span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              aria-labelledby="blur-label"
              checked={subStyle.blur}
              onChange={(e) => updateSubStyle({ blur: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-8 h-4 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400" />
          </label>
        </div>

        <div className="space-y-1.5 pt-1 border-t border-[#1b1e24]">
          <span className="text-xs text-zinc-300 font-medium">Kutu rengi</span>
          <ColorSwatches value={look.boxColor} colors={BOX_COLORS} onChange={(c) => updateSubStyle({ boxColor: c })} />
        </div>
          </>
        )}

        <div className="space-y-1.5 pt-1 border-t border-[#1b1e24]">
          <span className="text-xs text-zinc-300 font-medium">Kenar (CEA-708)</span>
          <div className="grid grid-cols-5 gap-1 p-1 bg-[#181a1f] rounded-lg border border-[#272a32]">
            {EDGE_OPTIONS.map((opt) => {
              const selected = look.edge === opt.id;
              const previewShadow = edgeTextShadow(opt.id, subStyle.outlineWidth, look.edgeColor);
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={selected}
                  title={opt.name}
                  onClick={() => updateSubStyle({ edgeStyle: opt.id, textStroke: opt.id !== 'none' })}
                  className={`flex flex-col items-center gap-0.5 min-h-[52px] py-1.5 px-0.5 rounded-md focus-visible:ring-2 focus-visible:ring-blue-400 ${
                    selected ? 'ring-2 ring-blue-400 bg-[#282d38]' : 'hover:bg-[#1e2127] text-zinc-400'
                  }`}
                >
                  <span
                    className="text-base font-bold leading-none select-none"
                    style={{
                      color: look.primaryColor,
                      textShadow: previewShadow,
                    }}
                    aria-hidden
                  >
                    Aa
                  </span>
                  <span className={`text-[9px] leading-tight ${selected ? 'text-white font-medium' : ''}`}>
                    {opt.name}
                  </span>
                </button>
              );
            })}
          </div>
          {look.edge !== 'none' && (
            <>
              <div className="space-y-1.5">
                <span className="text-xs text-zinc-300 font-medium">Kenar rengi</span>
                <ColorSwatches
                  value={look.edgeColor}
                  colors={TEXT_COLORS}
                  onChange={(c) => updateSubStyle({ edgeColor: c })}
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <label htmlFor="outline-w">Kalınlık</label>
                  <span className="font-mono">{subStyle.outlineWidth}px</span>
                </div>
                <input
                  id="outline-w"
                  type="range"
                  min="1"
                  max="4"
                  step="1"
                  value={subStyle.outlineWidth}
                  onChange={(e) => updateSubStyle({ outlineWidth: parseInt(e.target.value, 10) })}
                  className="w-full"
                />
              </div>
            </>
          )}
        </div>

        <div className="space-y-1.5 pt-1 border-t border-[#1b1e24]">
          <span className="text-xs text-zinc-300 font-medium">Hizalama</span>
          <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#181a1f] rounded-lg border border-[#272a32]">
            {ALIGN_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => updateSubStyle({ align: opt.id })}
                className={`min-h-8 py-1.5 text-xs rounded-md focus-visible:ring-2 focus-visible:ring-blue-400 ${
                  look.align === opt.id ? chipOn : chipOff
                }`}
              >
                {opt.name}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5 pt-1 border-t border-[#1b1e24]">
          <label className="text-xs text-zinc-300 font-medium">Yazı tipi</label>
          <FontPicker
            value={SUBTITLE_FONTS.some((f) => f.id === subStyle.fontFamily) ? subStyle.fontFamily : 'Arial'}
            onChange={(id) => updateSubStyle({ fontFamily: id })}
          />
        </div>

        <div className="space-y-3 pt-1 border-t border-[#1b1e24]">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Orijinal ({look.primarySize}px)</span>
            </div>
            <ColorSwatches
              value={look.primaryColor}
              colors={TEXT_COLORS}
              onChange={(c) => updateSubStyle({ primaryColor: c })}
            />
            <input
              aria-label="Orijinal punto"
              type="range"
              min="13"
              max="26"
              value={look.primarySize}
              onChange={(e) => updateSubStyle({ primaryFontSize: parseInt(e.target.value, 10) })}
              className="w-full"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Çeviri ({look.secondarySize}px)</span>
            </div>
            <ColorSwatches
              value={look.secondaryColor}
              colors={TEXT_COLORS}
              onChange={(c) => updateSubStyle({ secondaryColor: c })}
            />
            <input
              aria-label="Çeviri punto"
              type="range"
              min="12"
              max="24"
              value={look.secondarySize}
              onChange={(e) => updateSubStyle({ secondaryFontSize: parseInt(e.target.value, 10) })}
              className="w-full"
            />
          </div>
        </div>

        <div className="space-y-1 pt-1 border-t border-[#1b1e24]">
          <span className="text-xs text-zinc-300 font-medium">Konum</span>
          <div className="grid grid-cols-2 gap-1 p-0.5 bg-[#181a1f] rounded-lg border border-[#272a32]">
            <button
              type="button"
              onClick={() => updateSubStyle({ placement: 'overlay' })}
              className={`min-h-8 py-1.5 text-xs rounded-md focus-visible:ring-2 focus-visible:ring-blue-400 ${
                !below ? chipOn : chipOff
              }`}
            >
              Video üstünde
            </button>
            <button
              type="button"
              onClick={() => updateSubStyle({ placement: 'below' })}
              className={`min-h-8 py-1.5 text-xs rounded-md focus-visible:ring-2 focus-visible:ring-blue-400 ${
                below ? chipOn : chipOff
              }`}
            >
              Video altında
            </button>
          </div>
          {below ? (
            <>
              <p className="text-[11px] text-zinc-500 leading-snug pt-0.5">
                Video yukarı kayar. Yazı alttaki kuyuda, resmin üstüne binmez. Tam ekranda da.
              </p>
              <div className="space-y-1 pt-1">
                <span className="text-xs text-zinc-300 font-medium">Video ölçekleme</span>
                <div className="grid grid-cols-2 gap-1 p-0.5 bg-[#181a1f] rounded-lg border border-[#272a32]">
                  <button
                    type="button"
                    onClick={() => updateSubStyle({ videoFit: 'cover' })}
                    className={`min-h-8 py-1.5 text-xs rounded-md focus-visible:ring-2 focus-visible:ring-blue-400 ${
                      (subStyle.videoFit || 'cover') === 'cover' ? chipOn : chipOff
                    }`}
                  >
                    Tam genişlik
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSubStyle({ videoFit: 'contain' })}
                    className={`min-h-8 py-1.5 text-xs rounded-md focus-visible:ring-2 focus-visible:ring-blue-400 ${
                      subStyle.videoFit === 'contain' ? chipOn : chipOff
                    }`}
                  >
                    Tam görüntü
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500 leading-snug">
                  {(subStyle.videoFit || 'cover') === 'cover'
                    ? 'Yan boşluk yok; kenarlar hafif kırpılabilir.'
                    : 'Tüm görüntü görünür; yanlarda şerit çıkabilir.'}
                </p>
              </div>
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between p-2 min-h-8 bg-[#16181e] rounded-lg border border-[#20232a]">
                  <div className="pr-2">
                    <span className="text-xs font-medium text-zinc-300" id="dock-ambient-label">
                      Videodan kuyu
                    </span>
                    <p className="text-[11px] text-zinc-500 leading-snug">
                      Kuyu, slaytın alt bandının rengi. Keskin çizgi yok; yumuşak geçiş.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      aria-labelledby="dock-ambient-label"
                      checked={subStyle.dockAmbient !== false}
                      onChange={(e) => updateSubStyle({ dockAmbient: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400" />
                  </label>
                </div>
                <span className="text-xs text-zinc-300 font-medium">
                  {subStyle.dockAmbient !== false ? 'Kuyu perdesi' : 'Kuyu rengi'}
                </span>
                <DockColorPresets
                  value={(subStyle.dockColor || '#000000').toLowerCase()}
                  opacity={subStyle.dockOpacity ?? 0}
                  onChange={(c) => updateSubStyle({ dockColor: c })}
                />
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="dock-opacity" className="text-zinc-300 font-medium">
                      Kuyu perdesi
                    </label>
                    <span className="font-mono text-[11px] text-zinc-400">%{subStyle.dockOpacity ?? 0}</span>
                  </div>
                  <input
                    id="dock-opacity"
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={subStyle.dockOpacity ?? 0}
                    onChange={(e) => updateSubStyle({ dockOpacity: parseInt(e.target.value, 10) })}
                    className="w-full"
                  />
                  <p className="text-[11px] text-zinc-500 leading-snug">
                    %0 slaytla aynı renk. %100 seçilen düz renk.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-zinc-400 pt-1">
                <label htmlFor="offset-y">Kenar boşluğu</label>
                <span className="font-mono">{subStyle.offsetY}px</span>
              </div>
              <input
                id="offset-y"
                type="range"
                min="10"
                max="140"
                step="2"
                value={subStyle.offsetY}
                onChange={(e) => updateSubStyle({ offsetY: parseInt(e.target.value, 10) })}
                className="w-full"
              />
              <div className="flex gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => updateSubStyle({ position: 'bottom' })}
                  className={`flex-1 min-h-8 text-xs rounded-md border focus-visible:ring-2 focus-visible:ring-blue-400 ${
                    subStyle.position !== 'top' ? 'bg-[#282d38] text-white' : 'text-zinc-400 border-[#272a32]'
                  }`}
                >
                  Alt
                </button>
                <button
                  type="button"
                  onClick={() => updateSubStyle({ position: 'top' })}
                  className={`flex-1 min-h-8 text-xs rounded-md border focus-visible:ring-2 focus-visible:ring-blue-400 ${
                    subStyle.position === 'top' ? 'bg-[#282d38] text-white' : 'text-zinc-400 border-[#272a32]'
                  }`}
                >
                  Üst
                </button>
              </div>
              <label className="flex items-center justify-between p-2 min-h-8 bg-[#16181e] rounded-lg border border-[#20232a] mt-1.5">
                <span className="text-xs font-medium text-zinc-300" id="pause-hover-label">
                  Kelimede duraklat
                </span>
                <span className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    aria-labelledby="pause-hover-label"
                    checked={subStyle.pauseOnHover !== false}
                    onChange={(e) => updateSubStyle({ pauseOnHover: e.target.checked })}
                    className="sr-only peer"
                  />
                  <span className="w-8 h-4 bg-zinc-700 rounded-full peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400" />
                </span>
              </label>
            </>
          )}
        </div>
      </div>

      <div className="p-3 bg-[#111317] rounded-xl border border-[#1f2228] space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
          <span>Mod ve sıra</span>
          <button
            type="button"
            onClick={() => updateSubStyle({ order: subStyle.order === 'target_top' ? 'source_top' : 'target_top' })}
            className="flex items-center gap-1 text-xs text-zinc-300 bg-[#1e2127] hover:bg-[#282c35] px-2 min-h-8 rounded border border-[#272a32] focus-visible:ring-2 focus-visible:ring-blue-400"
            title="Sıralamayı değiştir"
          >
            <ArrowUpDown className="w-3 h-3 text-blue-400" aria-hidden />
            <span>{subStyle.order === 'target_top' ? 'Çeviri üstte' : 'Orijinal üstte'}</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5 p-0.5 bg-[#181a1f] rounded-lg border border-[#272a32]">
          {(
            [
              { id: 'dual', label: 'Çift' },
              { id: 'target_only', label: 'Çeviri' },
              { id: 'source_only', label: 'Orijinal' },
            ] as { id: SubtitleLayoutMode; label: string }[]
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => updateSubStyle({ layoutMode: mode.id })}
              className={`min-h-8 py-1.5 text-xs font-medium rounded-md focus-visible:ring-2 focus-visible:ring-blue-400 ${
                subStyle.layoutMode === mode.id ? 'bg-[#282d38] text-white font-semibold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
