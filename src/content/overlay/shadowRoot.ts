import { bundledFontFaceCss } from '../../services/subtitleLook';

/**
 * Shadow DOM overlay host for Duetto video captions.
 */

export class ShadowOverlayHost {
  private hostElement: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private subtitleContainer: HTMLElement | null = null;
  private toolbarContainer: HTMLElement | null = null;
  private toastContainer: HTMLElement | null = null;
  private wordTooltipContainer: HTMLElement | null = null;
  private ambientContainer: HTMLElement | null = null;
  private toastTimer: number | null = null;
  private hotCleanup: (() => void) | null = null;

  public init(videoContainer: HTMLElement): ShadowRoot {
    if (this.shadowRoot && this.hostElement && videoContainer.contains(this.hostElement)) {
      return this.shadowRoot;
    }

    this.destroy();

    this.hostElement = document.createElement('div');
    this.hostElement.id = 'duetto-overlay-host';
    this.hostElement.style.position = 'absolute';
    this.hostElement.style.inset = '0';
    this.hostElement.style.pointerEvents = 'none';
    this.hostElement.style.zIndex = '2147483647';
    this.hostElement.style.width = '100%';
    this.hostElement.style.height = '100%';
    this.hostElement.style.overflow = 'visible';

    this.shadowRoot = this.hostElement.attachShadow({ mode: 'closed' });

    const fontCss =
      typeof chrome !== 'undefined' && chrome.runtime?.getURL
        ? bundledFontFaceCss((file) => chrome.runtime.getURL(`fonts/${file}`))
        : '';

    const style = document.createElement('style');
    style.textContent = fontCss + `
      :host {
        font-family: Arial, Helvetica, sans-serif;
        color-scheme: dark;
        --duetto-focus: #82a9ef;
        --duetto-brand: #2f6fe4;
        --duetto-chrome: rgba(14, 20, 36, 0.88);
        pointer-events: none;
      }
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      /* Unified Subtitle Container */
      .sub-container {
        position: absolute;
        left: 0;
        right: 0;
        margin-inline: auto;
        bottom: 42px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        width: max-content;
        max-width: 88%;
        z-index: 15;
        pointer-events: none;
      }
      .sub-container.align-left {
        align-items: flex-start;
        text-align: left;
        margin-inline: 3% auto;
      }
      .sub-container.align-right {
        align-items: flex-end;
        text-align: right;
        margin-inline: auto 3%;
      }
      .sub-container.pos-bottom {
        top: auto;
        bottom: var(--duetto-sub-y, 42px);
        transition: bottom 0.18s ease;
      }
      :host(.player-hot) .sub-container.pos-bottom:not(.dock-below) {
        bottom: calc(var(--duetto-sub-y, 42px) + 52px);
      }
      .sub-container.pos-top {
        bottom: auto;
      }
      .sub-container.dock-below {
        bottom: 0 !important;
        top: auto !important;
        min-height: var(--duetto-dock-h, 96px);
        height: var(--duetto-dock-h, 96px);
        max-width: 92%;
        justify-content: center;
        overflow: visible;
        transition: none;
        z-index: 15;
        padding: 4px 12px 12px;
      }

      .dock-ambient {
        display: none;
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: calc(var(--duetto-dock-h, 96px) + var(--duetto-dock-seam, 16px));
        overflow: hidden;
        z-index: 6;
        pointer-events: none;
      }
      :host(.dock-on) .dock-ambient {
        display: block;
      }
      .dock-probe {
        position: absolute;
        width: 48px;
        height: 28px;
        opacity: 0;
        pointer-events: none;
      }
      .dock-fade {
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
        height: var(--duetto-dock-seam, 16px);
        background: linear-gradient(to bottom, rgb(0 0 0 / 0), var(--duetto-dock-match, transparent));
        opacity: 0;
      }
      .dock-fill {
        position: absolute;
        left: 0;
        right: 0;
        top: var(--duetto-dock-seam, 16px);
        bottom: 0;
        background: var(--duetto-dock-match, transparent);
        opacity: 0;
      }
      :host(.dock-ready) .dock-fade,
      :host(.dock-ready) .dock-fill {
        opacity: 1;
        transition: opacity 0.18s ease;
      }
      .dock-scrim {
        position: absolute;
        left: 0;
        right: 0;
        top: var(--duetto-dock-seam, 16px);
        bottom: 0;
        background: var(--duetto-dock-bg, transparent);
        z-index: 1;
      }

      .sub-box {
        pointer-events: auto;
        position: relative;
        isolation: auto;
        overflow: visible;
        padding: 8px 16px;
        border-radius: 8px;
        display: inline-flex;
        flex-direction: column;
        gap: 4px;
        max-width: 100%;
        line-height: 1.35;
        cursor: grab;
        user-select: text;
      }
      .sub-box-frost {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        z-index: 0;
      }
      .sub-box-inner {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .dock-below .sub-box {
        padding: 8px 22px 10px;
        gap: 6px;
      }
      .dock-below .sub-primary,
      .dock-below .sub-secondary {
        line-height: 1.42;
      }
      .sub-box:active {
        cursor: grabbing;
      }

      .sub-primary {
        font-weight: 700;
        letter-spacing: 0;
        text-wrap: balance;
        overflow-wrap: anywhere;
        paint-order: stroke fill;
      }
      :host(.dock-light) .sub-primary,
      :host(.dock-light) .sub-secondary {
        -webkit-text-stroke: 0.55px #000;
      }

      .sub-word {
        display: inline-block;
        cursor: pointer;
        padding: 0 2px;
        margin: 0 1px;
        border-radius: 4px;
        position: relative;
      }
      .sub-word:hover {
        background: rgba(255, 255, 255, 0.14);
        color: #ffffff !important;
        text-decoration: none;
      }
      :host(.dock-light) .sub-word:hover {
        background: rgba(0, 0, 0, 0.08);
        color: inherit !important;
      }
      .sub-word:focus-visible {
        outline: 2px solid var(--duetto-focus);
        outline-offset: 2px;
        background: rgba(47, 111, 228, 0.35);
      }
      .sub-word.term-locked {
        color: var(--duetto-focus);
        font-weight: 600;
      }

      /* Secondary Subtitle (Translation) */
      .sub-secondary {
        font-weight: 700;
        letter-spacing: 0.1px;
        text-wrap: balance;
        overflow-wrap: anywhere;
      }
      .sub-secondary.sub-pending {
        font-weight: 500;
        font-style: italic;
        opacity: 0.45;
      }
      .sub-secondary.sub-pending.sub-error {
        font-style: normal;
        font-weight: 600;
        opacity: 0.88;
      }

      /* Hover Tooltip */
      .word-tooltip {
        position: absolute;
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        padding: 8px 10px;
        min-width: 128px;
        font-size: 11px;
        z-index: 100;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s ease;
        display: flex;
        flex-direction: column;
        gap: 3px;
        white-space: nowrap;
        overflow: visible;
      }
      .tooltip-frost {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        z-index: 0;
        background: var(--duetto-chrome);
        backdrop-filter: blur(12px) saturate(1.1);
        -webkit-backdrop-filter: blur(12px) saturate(1.1);
      }
      .word-tooltip.visible {
        opacity: 1;
      }
      .tooltip-body {
        position: relative;
        z-index: 1;
      }
      .word-tooltip-arrow {
        position: absolute;
        bottom: -5px;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-top: 5px solid rgba(14, 20, 36, 0.96);
      }
      .tooltip-word {
        color: #9aa4b5;
        font-weight: 500;
        font-size: 10px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .tooltip-trans {
        color: #ffffff;
        font-weight: 600;
        font-size: 14px;
      }
      .tooltip-tag {
        font-size: 9px;
        background: rgba(47, 111, 228, 0.28);
        color: var(--duetto-focus);
        padding: 1px 4px;
        border-radius: 3px;
        font-weight: 600;
        text-transform: uppercase;
      }

      /* Floating Action Toolbar */
      .toolbar {
        position: absolute;
        top: 10px;
        right: 10px;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 0;
        max-width: min(calc(100% - 16px), 420px);
        background: var(--duetto-chrome);
        padding: 2px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        opacity: 0;
        transition: opacity 0.15s ease;
        z-index: 20;
        pointer-events: auto;
      }
      :host(.player-hot) .toolbar, .toolbar.show {
        opacity: 1;
      }
      .tool-btn {
        background: transparent;
        border: none;
        color: #e8ebf2;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 6px;
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease;
      }
      .tool-btn.tool-txt {
        width: auto;
        min-width: 28px;
        padding: 0 6px;
        font-size: 10px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .tool-sep {
        width: 1px;
        height: 14px;
        background: rgba(255, 255, 255, 0.12);
        margin: 0 2px;
      }
      .tool-btn:focus-visible {
        outline: 2px solid var(--duetto-focus);
        outline-offset: 2px;
      }
      .tool-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #ffffff;
      }
      .tool-btn.active {
        background: color-mix(in srgb, var(--duetto-brand) 28%, transparent);
        color: #ffffff;
      }
      .speed-badge {
        font-size: 10px;
        font-weight: 700;
        color: #ffffff;
        padding: 0 7px;
        height: 28px;
        display: flex;
        align-items: center;
        font-variant-numeric: tabular-nums;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        background: transparent;
        border: none;
        cursor: pointer;
        border-radius: 6px;
      }
      .speed-badge:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      .speed-badge:focus-visible {
        outline: 2px solid var(--duetto-focus);
        outline-offset: 2px;
      }
      .toast {
        position: absolute;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--duetto-chrome);
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.12);
        padding: 6px 14px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        opacity: 0;
        transition: opacity 0.2s ease;
        z-index: 30;
      }
      .toast.visible {
        opacity: 1;
      }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          transition-duration: 0.01ms !important;
          animation-duration: 0.01ms !important;
        }
      }
    `;
    this.shadowRoot.appendChild(style);

    this.subtitleContainer = document.createElement('div');
    this.subtitleContainer.className = 'sub-container';

    this.toolbarContainer = document.createElement('div');
    this.toolbarContainer.className = 'toolbar';

    this.toastContainer = document.createElement('div');
    this.toastContainer.className = 'toast';

    this.wordTooltipContainer = document.createElement('div');
    this.wordTooltipContainer.className = 'word-tooltip';
    this.wordTooltipContainer.innerHTML =
      '<div class="tooltip-frost"></div><div class="word-tooltip-arrow"></div><div class="tooltip-body"></div>';

    this.ambientContainer = document.createElement('div');
    this.ambientContainer.className = 'dock-ambient';
    this.ambientContainer.setAttribute('aria-hidden', 'true');
    const fade = document.createElement('div');
    fade.className = 'dock-fade';
    const fill = document.createElement('div');
    fill.className = 'dock-fill';
    const scrim = document.createElement('div');
    scrim.className = 'dock-scrim';
    this.ambientContainer.appendChild(fade);
    this.ambientContainer.appendChild(fill);
    this.ambientContainer.appendChild(scrim);

    this.shadowRoot.appendChild(this.ambientContainer);
    this.shadowRoot.appendChild(this.subtitleContainer);
    this.shadowRoot.appendChild(this.toolbarContainer);
    this.shadowRoot.appendChild(this.toastContainer);
    this.shadowRoot.appendChild(this.wordTooltipContainer);

    videoContainer.appendChild(this.hostElement);
    this.bindPlayerHot(videoContainer);
    return this.shadowRoot;
  }

  private bindPlayerHot(box: HTMLElement): void {
    this.hotCleanup?.();
    const sync = () => {
      const vjs =
        box.closest('.video-js') ||
        (box.classList.contains('video-js') ? box : box.querySelector('.video-js'));
      const hot = box.matches(':hover') || !!(vjs && vjs.classList.contains('vjs-user-active'));
      this.hostElement?.classList.toggle('player-hot', hot);
    };
    box.addEventListener('mouseenter', sync);
    box.addEventListener('mouseleave', sync);
    const obs = new MutationObserver(sync);
    obs.observe(box, { attributes: true, attributeFilter: ['class'] });
    sync();
    this.hotCleanup = () => {
      box.removeEventListener('mouseenter', sync);
      box.removeEventListener('mouseleave', sync);
      obs.disconnect();
    };
  }

  public getSubtitleContainer(): HTMLElement | null {
    return this.subtitleContainer;
  }

  public getToolbarContainer(): HTMLElement | null {
    return this.toolbarContainer;
  }

  public getWordTooltipContainer(): HTMLElement | null {
    return this.wordTooltipContainer;
  }

  public getAmbientLayer(): HTMLElement | null {
    return this.ambientContainer;
  }

  public setDockMode(on: boolean): void {
    this.hostElement?.classList.toggle('dock-on', on);
    if (!on) {
      this.hostElement?.classList.remove('dock-light');
      this.hostElement?.classList.remove('dock-ready');
    }
  }

  public setDockLight(on: boolean): void {
    this.hostElement?.classList.toggle('dock-light', on);
  }

  public getHostElement(): HTMLElement | null {
    return this.hostElement;
  }

  public showToast(message: string, durationMs: number = 2000): void {
    if (!this.toastContainer) return;
    this.toastContainer.textContent = message;
    this.toastContainer.classList.add('visible');
    if (this.toastTimer != null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastContainer?.classList.remove('visible');
      this.toastTimer = null;
    }, durationMs);
  }

  public destroy(): void {
    this.hotCleanup?.();
    this.hotCleanup = null;
    if (this.toastTimer != null) {
      window.clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    this.hostElement?.remove();
    this.hostElement = null;
    this.shadowRoot = null;
    this.subtitleContainer = null;
    this.toolbarContainer = null;
    this.toastContainer = null;
    this.wordTooltipContainer = null;
    this.ambientContainer = null;
  }
}

export const shadowOverlay = new ShadowOverlayHost();
