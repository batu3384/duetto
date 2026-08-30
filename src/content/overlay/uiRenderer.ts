import { ExtensionSettings, SubtitleCue } from '../../types';
import { shadowOverlay } from './shadowRoot';
import { playerHook } from '../playerHook';
import { keyIsConfigured, saveSettings } from '../../services/storage';
import { TECHNICAL_GLOSSARY } from '../../services/translator/glossary';
import { captionLook, readCssPx } from '../../services/subtitleLook';
import { applyVideoDock } from './videoDock';
import { captureCurrentNote } from '../captureNote';
import { subtitleManager } from '../subtitleManager';

const SPEED_STEPS = [0.75, 1, 1.25, 1.5, 1.75, 2];

function nextSpeed(cur: number): number {
  const i = SPEED_STEPS.findIndex((s) => s > cur + 0.04);
  return i < 0 ? SPEED_STEPS[0] : SPEED_STEPS[i];
}

export function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function wordTokensHtml(
  text: string,
  opts: { lockOn: boolean; custom: Set<string>; toTarget: boolean }
): string {
  return text
    .split(' ')
    .map((w) => {
      if (!w) return '';
      const cleanWord = w.replace(/[^\p{L}\p{N}_-]/gu, '').toLowerCase();
      const isTech =
        opts.lockOn &&
        opts.toTarget &&
        !!cleanWord &&
        (TECHNICAL_GLOSSARY.has(cleanWord) || opts.custom.has(cleanWord));
      const safeDisplay = escapeHtml(w);
      if (!cleanWord) return safeDisplay;
      const safeWord = escapeHtml(cleanWord);
      return `<span class="sub-word${isTech ? ' term-locked' : ''}" tabindex="0" data-word="${safeWord}" data-raw="${escapeHtml(w)}" data-to-target="${opts.toTarget ? '1' : '0'}">${safeDisplay}</span>`;
    })
    .join(' ');
}

function pendingTranslationMessage(settings: ExtensionSettings): { text: string; isError: boolean } {
  const sourceError = subtitleManager.getSourceError();
  if (sourceError) return { text: sourceError, isError: true };
  const hint = subtitleManager.getTranslationHint();
  const hasKey = keyIsConfigured(settings);
  if (hint) {
    const isError =
      /gerekli|geçersiz|kotası|istek sınırı|başarısız|hata|yanıt alınamadı|yanıt vermedi|izni yok|bulunamadı/i.test(hint) || !hasKey;
    return { text: hint, isError };
  }
  if (!hasKey) {
    return { text: 'Gemini anahtarı gerekli — uzantı simgesi → Gemini', isError: true };
  }
  if (subtitleManager.isTranslatingNow()) {
    return { text: 'Çeviri yapılıyor…', isError: false };
  }
  return { text: '', isError: false };
}

function translatePhraseViaBg(text: string, targetLang: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'TRANSLATE_PHRASE', text, targetLang }, (res) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (res?.success && typeof res.text === 'string' && res.text) {
        resolve(res.text);
        return;
      }
      reject(new Error(res?.error || 'translate failed'));
    });
  });
}

export class UIRenderer {
  private currentCue: SubtitleCue | null = null;
  private settings: ExtensionSettings | null = null;
  private wordDictCache: Map<string, { trans: string; isTech: boolean }> = new Map();
  private wordInflight: Map<string, Promise<string>> = new Map();
  private hoverTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private isDragging: boolean = false;
  private dragStartY: number = 0;
  private dragStartOffset: number = 42;
  private dragFromTop: boolean = false;
  private dragMoved: boolean = false;
  private holdPause: boolean = false;
  private tooltipGen: number = 0;
  private lastPaintKey: string = '';
  private dragMove: ((e: MouseEvent) => void) | null = null;
  private dragUp: ((e: MouseEvent) => void) | null = null;

  public updateSettings(settings: ExtensionSettings): void {
    this.settings = settings;
    this.lastPaintKey = '';
    this.renderSubtitle(this.currentCue);
    this.renderToolbar();
  }

  public resetInteraction(opts?: { resume?: boolean }): void {
    this.isDragging = false;
    if (this.dragMove) window.removeEventListener('mousemove', this.dragMove);
    if (this.dragUp) window.removeEventListener('mouseup', this.dragUp);
    this.dragMove = null;
    this.dragUp = null;
    if (opts?.resume === false) this.holdPause = false;
    else this.releasePause();
    this.hideWordTooltip();
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.lastPaintKey = '';
  }

  public renderSubtitle(cue: SubtitleCue | null): void {
    const prevId = this.currentCue?.id;
    this.currentCue = cue;
    const container = shadowOverlay.getSubtitleContainer();
    if (!container) return;
    this.updateSourceStatus();

    if (!cue || !this.settings?.dualSubtitlesEnabled) {
      this.releasePause();
      this.hideWordTooltip();
      container.innerHTML = '';
      container.style.display = 'none';
      this.lastPaintKey = '';
      return;
    }

    if (cue.id !== prevId) {
      this.hideWordTooltip();
    }

    container.style.display = 'flex';
    const { subStyle } = this.settings;
    const look = captionLook(subStyle);
    const below = subStyle.placement === 'below';
    container.classList.toggle('align-left', look.align === 'left');
    container.classList.toggle('align-right', look.align === 'right');
    container.classList.toggle('dock-below', below);
    container.classList.toggle('pos-bottom', !below && subStyle.position !== 'top');
    container.classList.toggle('pos-top', !below && subStyle.position === 'top');

    if (!this.isDragging) {
      const y = Number.isFinite(subStyle.offsetY) ? subStyle.offsetY : 42;
      this.applyPlacement(container, below, subStyle.position === 'top', y);
    }

    const paintKey = [
      cue.id,
      cue.translation || '',
      cue.text,
      subtitleManager.getSourceLabel(),
      JSON.stringify(subStyle),
      this.settings.termLockEnabled,
      this.settings.customProtectedTerms.join(','),
      this.settings.geminiKeyConfigured || this.settings.geminiApiKey ? '1' : '0',
      subtitleManager.getTranslationHint() || '',
      subtitleManager.isTranslatingNow() ? '1' : '0',
    ].join('|');
    if (paintKey === this.lastPaintKey) return;
    this.lastPaintKey = paintKey;

    const custom = new Set((this.settings.customProtectedTerms || []).map((t) => t.toLowerCase()));
    const lockOn = this.settings.termLockEnabled && subStyle.termHighlight !== false;

    const wordsHtml = wordTokensHtml(cue.text, { lockOn, custom, toTarget: true });
    const stroke =
      look.edge !== 'none' ? `-webkit-text-stroke:0.4px ${look.edgeColor};paint-order:stroke fill;` : '';
    const typeStyle = `font-family:${look.font};text-shadow:${look.shadow};${stroke}`;
    const layoutMode = subStyle.layoutMode || 'dual';

    const originalBlock = `
      <div class="sub-primary" style="font-size:${look.primarySize}px;color:${look.primaryColor};${typeStyle}">
        ${wordsHtml}
      </div>
    `;

    let translationBlock = '';
    if (cue.translation) {
      const safeTranslation = wordTokensHtml(cue.translation, { lockOn: false, custom, toTarget: false });
      translationBlock = `<div class="sub-secondary" style="font-size:${look.secondarySize}px;color:${look.secondaryColor};${typeStyle}">${safeTranslation}</div>`;
    } else if (layoutMode !== 'source_only') {
      const pending = pendingTranslationMessage(this.settings);
      if (pending.text) {
        const pendingClass = pending.isError ? 'sub-error' : '';
        const pendingColor = pending.isError ? '#ecc8c8' : look.secondaryColor;
        const pendingRole = pending.isError ? 'alert' : 'status';
        const pendingLive = pending.isError ? 'assertive' : 'polite';
        translationBlock = `<div class="sub-secondary sub-pending ${pendingClass}" role="${pendingRole}" aria-live="${pendingLive}" style="font-size:${look.secondarySize}px;color:${pendingColor};${typeStyle}">${escapeHtml(pending.text)}</div>`;
      }
    }

    let contentHtml = '';
    const order = subStyle.order || 'source_top';

    if (layoutMode === 'source_only') {
      contentHtml = originalBlock;
    } else if (layoutMode === 'target_only') {
      contentHtml = translationBlock || originalBlock;
    } else if (order === 'target_top') {
      contentHtml = `${translationBlock}${originalBlock}`;
    } else {
      contentHtml = `${originalBlock}${translationBlock}`;
    }

    let boxStyle = '';
    let frostHtml = '';
    if (below || look.zero) {
      boxStyle = 'background:transparent;box-shadow:none;border:none;padding:8px 22px 10px;';
    } else {
      const shadowAlpha = (look.alpha * 0.55).toFixed(2);
      const borderAlpha = Math.max(0.1, look.alpha * 0.32).toFixed(2);
      boxStyle = `box-shadow:0 8px 28px rgba(0,0,0,${shadowAlpha});border:1px solid rgba(255,255,255,${borderAlpha});`;
      if (look.blur) {
        boxStyle += 'background:transparent;';
        frostHtml = `<div class="sub-box-frost" style="backdrop-filter:blur(18px) saturate(1.35);-webkit-backdrop-filter:blur(18px) saturate(1.35);background:${look.boxFill};"></div>`;
      } else {
        boxStyle += `background:${look.boxFill};`;
      }
    }

    container.innerHTML = `
      <div class="sub-box" id="sub-drag-box" title="${escapeHtml(
        subtitleManager.getSourceLabel() ? `Kaynak altyazı: ${subtitleManager.getSourceLabel()}` : ''
      )}" style="${boxStyle}">
        ${frostHtml}
        <div class="sub-box-inner">${contentHtml}</div>
      </div>
    `;

    this.attachWordHoverListeners(container);
    this.attachCopyListener(container);
    this.ensureHoverLeave(container);
    if (this.holdPause && !container.matches(':hover')) this.releasePause();
    if (!below) this.attachDragListener(container);
  }

  private updateSourceStatus(): void {
    const source = shadowOverlay.getToolbarContainer()?.querySelector('.tool-source') as HTMLElement | null;
    if (!source) return;
    const label = subtitleManager.getSourceLabel() || 'Kaynak yok';
    const error = subtitleManager.getSourceError();
    source.textContent = label;
    source.title = error || `Kaynak altyazı: ${label}`;
    source.setAttribute('aria-busy', subtitleManager.isSourceLoading() ? 'true' : 'false');
    source.classList.toggle('source-error', !!error);
  }

  private applyPlacement(container: HTMLElement, below: boolean, fromTop: boolean, offset: number): void {
    if (below) {
      container.style.top = 'auto';
      container.style.bottom = '0px';
      container.style.removeProperty('--duetto-sub-y');
      return;
    }
    if (fromTop) {
      container.style.top = `${offset}px`;
      container.style.bottom = 'auto';
      container.style.removeProperty('--duetto-sub-y');
      return;
    }
    container.style.top = 'auto';
    container.style.bottom = '';
    container.style.setProperty('--duetto-sub-y', `${offset}px`);
  }

  private attachCopyListener(container: HTMLElement): void {
    const box = container.querySelector('#sub-drag-box') as HTMLElement | null;
    if (!box) return;
    box.addEventListener('dblclick', () => {
      void this.copyCurrentCue();
    });
  }

  private async copyCurrentCue(): Promise<void> {
    const cue = this.currentCue;
    if (!cue) {
      shadowOverlay.showToast('Kopyalanacak altyazı yok');
      return;
    }
    const text = [cue.text, cue.translation].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      shadowOverlay.showToast('Altyazı kopyalandı');
    } catch {
      shadowOverlay.showToast('Kopyalanamadı');
    }
  }

  private attachWordHoverListeners(container: HTMLElement): void {
    const wordSpans = container.querySelectorAll('.sub-word');
    wordSpans.forEach((span) => {
      const el = span as HTMLElement;
      const word = el.getAttribute('data-word');
      const rawWord = el.getAttribute('data-raw') || word || '';
      const toTarget = el.getAttribute('data-to-target') !== '0';
      if (!word) return;

      const open = () => {
        if (this.hideTimer) clearTimeout(this.hideTimer);
        this.holdPauseIfNeeded();
        this.hoverTimer = setTimeout(() => {
          this.showWordHoverTooltip(word, rawWord, el, toTarget);
        }, 80);
      };
      const close = () => {
        if (this.hoverTimer) clearTimeout(this.hoverTimer);
        this.hideTimer = setTimeout(() => {
          this.hideWordTooltip();
          this.releasePause();
        }, 180);
      };

      el.addEventListener('mouseenter', open);
      el.addEventListener('mouseleave', close);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.holdPauseIfNeeded();
        this.showWordHoverTooltip(word, rawWord, el, toTarget);
      });
      el.addEventListener('dblclick', (e) => e.stopPropagation());
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.holdPauseIfNeeded();
          this.showWordHoverTooltip(word, rawWord, el, toTarget);
        }
        if (e.key === 'Escape') {
          this.hideWordTooltip();
          this.releasePause();
        }
      });
    });
  }

  private ensureHoverLeave(container: HTMLElement): void {
    if (container.dataset.duettoLeave === '1') return;
    container.dataset.duettoLeave = '1';
    container.addEventListener('mouseleave', () => {
      if (this.hoverTimer) clearTimeout(this.hoverTimer);
      this.hideWordTooltip();
      this.releasePause();
    });
  }

  private holdPauseIfNeeded(): void {
    if (this.settings?.subStyle.pauseOnHover === false) return;
    const video = playerHook.findVideoElement();
    if (!video || video.paused) return;
    video.pause();
    this.holdPause = true;
  }

  private releasePause(): void {
    if (!this.holdPause) return;
    this.holdPause = false;
    const video = playerHook.findVideoElement();
    video?.play().catch(() => {});
  }

  private async showWordHoverTooltip(
    cleanWord: string,
    displayWord: string,
    element: HTMLElement,
    toTarget: boolean
  ): Promise<void> {
    const tooltip = shadowOverlay.getWordTooltipContainer();
    if (!tooltip) return;
    const gen = ++this.tooltipGen;

    const terms = (this.settings?.customProtectedTerms || []).map((t) => t.toLowerCase());
    const isTech =
      !!this.settings?.termLockEnabled &&
      toTarget &&
      (TECHNICAL_GLOSSARY.has(cleanWord.toLowerCase()) || terms.includes(cleanWord.toLowerCase()));
    const tl = toTarget ? this.settings?.targetLang || 'tr' : this.settings?.sourceLang || 'en';
    const cacheKey = `${tl}:${cleanWord}`;

    const place = () => {
      const rect = element.getBoundingClientRect();
      const hostEl = shadowOverlay.getHostElement();
      const hostRect = hostEl ? hostEl.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: 400 };
      const hostWidth = hostRect.width || window.innerWidth;
      const hostHeight = hostRect.height || 400;
      const tw = tooltip.offsetWidth || 160;
      const th = tooltip.offsetHeight || 48;
      const rawLeft = rect.left - hostRect.left + rect.width / 2 - tw / 2;
      const left = Math.max(8, Math.min(hostWidth - tw - 8, rawLeft));
      let top = rect.top - hostRect.top - th - 8;
      if (top < 8) top = rect.bottom - hostRect.top + 8;
      top = Math.max(8, Math.min(hostHeight - th - 8, top));
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
      tooltip.style.transform = 'none';
    };

    const bodyEl = tooltip.querySelector('.tooltip-body');
    if (!bodyEl) return;

    const safeDisplay = escapeHtml(displayWord);
    const techTag = isTech ? '<span class="tooltip-tag">Teknik Terim</span>' : '';

    if (this.wordDictCache.has(cacheKey)) {
      const cached = this.wordDictCache.get(cacheKey)!;
      if (gen !== this.tooltipGen) return;
      bodyEl.innerHTML = `
        <div class="tooltip-word">${safeDisplay} ${cached.isTech ? '<span class="tooltip-tag">Teknik Terim</span>' : ''}</div>
        <div class="tooltip-trans">${escapeHtml(cached.trans)}</div>
      `;
      tooltip.classList.add('visible');
      place();
      return;
    }

    bodyEl.innerHTML = `
      <div class="tooltip-word">${safeDisplay} ${techTag}</div>
      <div class="tooltip-trans" style="opacity: 0.6; font-size: 11px;">Anlam yükleniyor...</div>
    `;
    tooltip.classList.add('visible');
    place();

    try {
      const trans = await this.fetchPhrase(cleanWord, tl);
      if (gen !== this.tooltipGen) return;
      this.wordDictCache.set(cacheKey, { trans, isTech });
      bodyEl.innerHTML = `
        <div class="tooltip-word">${safeDisplay} ${techTag}</div>
        <div class="tooltip-trans">${escapeHtml(trans)}</div>
      `;
      place();
    } catch {
      if (gen !== this.tooltipGen) return;
      bodyEl.innerHTML = `
        <div class="tooltip-word">${safeDisplay}</div>
        <div class="tooltip-trans" style="color: #ecc8c8;">Çeviri alınamadı</div>
      `;
      place();
    }
  }

  private fetchPhrase(word: string, tl: string): Promise<string> {
    const key = `${tl}:${word}`;
    const cached = this.wordDictCache.get(key);
    if (cached) return Promise.resolve(cached.trans);
    let pending = this.wordInflight.get(key);
    if (!pending) {
      pending = translatePhraseViaBg(word, tl).finally(() => this.wordInflight.delete(key));
      this.wordInflight.set(key, pending);
    }
    return pending;
  }

  private hideWordTooltip(): void {
    this.tooltipGen += 1;
    const tooltip = shadowOverlay.getWordTooltipContainer();
    if (tooltip) {
      tooltip.classList.remove('visible');
    }
  }

  private attachDragListener(container: HTMLElement): void {
    const box = container.querySelector('#sub-drag-box') as HTMLElement;
    if (!box) return;

    box.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('.sub-word')) return;

      this.isDragging = true;
      this.dragMoved = false;
      this.dragStartY = e.clientY;
      this.dragFromTop = this.settings?.subStyle.position === 'top';
      const raw = this.dragFromTop
        ? container.style.top
        : container.style.getPropertyValue('--duetto-sub-y') || container.style.bottom;
      this.dragStartOffset = readCssPx(raw, Number.isFinite(this.settings?.subStyle.offsetY) ? this.settings!.subStyle.offsetY : 42);
      e.preventDefault();

      this.dragMove = (moveEvent: MouseEvent) => {
        if (!this.isDragging) return;
        const down = moveEvent.clientY - this.dragStartY;
        if (Math.abs(down) > 4) this.dragMoved = true;
        const hostH = shadowOverlay.getHostElement()?.clientHeight || 400;
        const maxOff = Math.max(12, hostH - 72);
        const next = this.dragFromTop ? this.dragStartOffset + down : this.dragStartOffset - down;
        const clamped = Math.max(8, Math.min(maxOff, next));
        if (this.dragFromTop) {
          container.style.top = `${clamped}px`;
        } else {
          container.style.setProperty('--duetto-sub-y', `${clamped}px`);
        }
      };

      this.dragUp = async (upEvent: MouseEvent) => {
        if (!this.isDragging) return;
        this.isDragging = false;
        if (this.dragMove) window.removeEventListener('mousemove', this.dragMove);
        if (this.dragUp) window.removeEventListener('mouseup', this.dragUp);
        this.dragMove = null;
        this.dragUp = null;

        if (!this.dragMoved) return;

        const down = upEvent.clientY - this.dragStartY;
        const hostH = shadowOverlay.getHostElement()?.clientHeight || 400;
        const maxOff = Math.max(12, hostH - 72);
        const next = this.dragFromTop ? this.dragStartOffset + down : this.dragStartOffset - down;
        const finalOff = Math.max(8, Math.min(maxOff, next));

        if (this.settings) {
          this.settings.subStyle.offsetY = finalOff;
          await saveSettings({ subStyle: this.settings.subStyle });
        }
      };

      window.addEventListener('mousemove', this.dragMove);
      window.addEventListener('mouseup', this.dragUp);
    });
  }

  public renderToolbar(): void {
    const toolbar = shadowOverlay.getToolbarContainer();
    if (!toolbar) return;

    const speed = playerHook.getSpeed().toFixed(2);
    const isDualOn = this.settings?.dualSubtitlesEnabled;
    const below = this.settings?.subStyle.placement === 'below';
    const sourceLabel = subtitleManager.getSourceLabel() || 'Kaynak yok';
    const sourceError = subtitleManager.getSourceError();
    const sourceLoading = subtitleManager.isSourceLoading();

    toolbar.innerHTML = `
      <button type="button" class="tool-btn ${isDualOn ? 'active' : ''}" id="btn-toggle-sub" aria-pressed="${isDualOn ? 'true' : 'false'}" aria-label="Çift altyazı aç kapat" title="Çift Altyazı (D)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><path d="M8 9h8"></path><path d="M8 13h6"></path></svg>
      </button>
      <button type="button" class="tool-btn ${below ? 'active' : ''}" id="btn-dock" aria-pressed="${below ? 'true' : 'false'}" aria-label="Altyazıyı video altına al" title="Konum: ${below ? 'Video altında' : 'Video üstünde'}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="14" rx="2"></rect><path d="M3 21h18"></path></svg>
      </button>
      <span class="tool-source ${sourceError ? 'source-error' : ''}" role="status" aria-live="polite" aria-busy="${sourceLoading ? 'true' : 'false'}" title="${escapeHtml(
        sourceError || `Kaynak altyazı: ${sourceLabel}`
      )}">${escapeHtml(sourceLabel)}</span>
      <span class="tool-sep" aria-hidden="true"></span>
      <button type="button" class="tool-btn tool-txt" id="btn-back" aria-label="5 saniye geri" title="Geri 5s (J)">−5</button>
      <button type="button" class="speed-badge" id="badge-speed" aria-label="Oynatma hızını değiştir" title="Hız değiştir (tıkla). [ ve ] de çalışır">${speed}x</button>
      <button type="button" class="tool-btn tool-txt" id="btn-fwd" aria-label="5 saniye ileri" title="İleri 5s (L)">+5</button>
      <span class="tool-sep" aria-hidden="true"></span>
      <button type="button" class="tool-btn" id="btn-copy" aria-label="Altyazıyı kopyala" title="Altyazıyı kopyala">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      </button>
      <button type="button" class="tool-btn" id="btn-note" aria-label="Not al" title="Not al (S)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><path d="M17 21v-8H7v8"></path><path d="M7 3v5h8"></path></svg>
      </button>
      <button type="button" class="tool-btn" id="btn-pip" aria-label="Picture in Picture" title="Mini PiP (P)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"></rect><rect width="6" height="4" x="13" y="13" rx="1"></rect></svg>
      </button>
    `;

    toolbar.querySelector('#btn-toggle-sub')?.addEventListener('click', async () => {
      if (!this.settings) return;
      this.settings.dualSubtitlesEnabled = !this.settings.dualSubtitlesEnabled;
      const updated = await saveSettings({ dualSubtitlesEnabled: this.settings.dualSubtitlesEnabled });
      this.settings = updated;
      applyVideoDock(updated);
      shadowOverlay.showToast(updated.dualSubtitlesEnabled ? 'Çift Altyazı: Açık' : 'Çift Altyazı: Kapalı');
      this.lastPaintKey = '';
      this.renderSubtitle(this.currentCue);
      this.renderToolbar();
    });

    toolbar.querySelector('#btn-dock')?.addEventListener('click', async () => {
      if (!this.settings) return;
      const next = this.settings.subStyle.placement === 'below' ? 'overlay' : 'below';
      this.settings.subStyle.placement = next;
      const updated = await saveSettings({ subStyle: this.settings.subStyle });
      this.settings = updated;
      applyVideoDock(updated);
      shadowOverlay.showToast(next === 'below' ? 'Altyazı: video altında' : 'Altyazı: video üstünde');
      this.lastPaintKey = '';
      this.renderSubtitle(this.currentCue);
      this.renderToolbar();
    });

    toolbar.querySelector('#btn-back')?.addEventListener('click', () => {
      playerHook.seek(-5);
      shadowOverlay.showToast('-5s');
    });
    toolbar.querySelector('#btn-fwd')?.addEventListener('click', () => {
      playerHook.seek(5);
      shadowOverlay.showToast('+5s');
    });

    toolbar.querySelector('#badge-speed')?.addEventListener('click', async () => {
      const next = nextSpeed(playerHook.getSpeed());
      playerHook.setSpeed(next);
      await saveSettings({ playbackSpeed: next });
      shadowOverlay.showToast(`Hız: ${next.toFixed(2)}x`);
      this.renderToolbar();
    });

    toolbar.querySelector('#btn-copy')?.addEventListener('click', () => {
      void this.copyCurrentCue();
    });
    toolbar.querySelector('#btn-note')?.addEventListener('click', () => {
      void captureCurrentNote();
    });
    toolbar.querySelector('#btn-pip')?.addEventListener('click', () => {
      playerHook.togglePiP();
    });
  }
}

export const uiRenderer = new UIRenderer();
