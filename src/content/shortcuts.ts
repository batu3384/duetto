import { playerHook } from './playerHook';
import { shadowOverlay } from './overlay/shadowRoot';
import { uiRenderer } from './overlay/uiRenderer';
import { applyVideoDock } from './overlay/videoDock';
import { getPageSettings, saveSettings } from '../services/storage';
import { captureCurrentNote } from './captureNote';
import { isDuettoShortcutKey } from './shortcutKeys';

export { isDuettoShortcutKey } from './shortcutKeys';

let shortcutsEnabled = true;

export function setShortcutsEnabled(enabled: boolean): void {
  shortcutsEnabled = enabled;
}

async function runShortcut(e: KeyboardEvent): Promise<void> {
  const settings = await getPageSettings();
  if (!settings.shortcutsEnabled) return;
  const key = e.key.toLowerCase();

  if (key === 's') {
    await captureCurrentNote();
    return;
  }
  if (key === 'd') {
    const newEnabled = !settings.dualSubtitlesEnabled;
    const updated = await saveSettings({ dualSubtitlesEnabled: newEnabled });
    uiRenderer.updateSettings(updated);
    applyVideoDock(updated);
    shadowOverlay.showToast(newEnabled ? 'Çift Altyazı: Açık' : 'Çift Altyazı: Kapalı');
    return;
  }
  if (key === 'p') {
    await playerHook.togglePiP();
    return;
  }
  if (e.key === '[') {
    const newSpeed = Math.max(0.25, Math.round((playerHook.getSpeed() - 0.1) * 100) / 100);
    playerHook.setSpeed(newSpeed);
    await saveSettings({ playbackSpeed: newSpeed });
    uiRenderer.renderToolbar();
    shadowOverlay.showToast(`Hız: ${newSpeed.toFixed(2)}x`);
    return;
  }
  if (e.key === ']') {
    const newSpeed = Math.min(3.5, Math.round((playerHook.getSpeed() + 0.1) * 100) / 100);
    playerHook.setSpeed(newSpeed);
    await saveSettings({ playbackSpeed: newSpeed });
    uiRenderer.renderToolbar();
    shadowOverlay.showToast(`Hız: ${newSpeed.toFixed(2)}x`);
    return;
  }
  if (key === 'j') {
    playerHook.seek(-5);
    shadowOverlay.showToast('-5s');
    return;
  }
  if (key === 'l') {
    playerHook.seek(5);
    shadowOverlay.showToast('+5s');
  }
}

export function setupKeyboardShortcuts(): () => void {
  const handleKeyDown = (e: KeyboardEvent) => {
    const active = document.activeElement;
    if (
      active &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        (active as HTMLElement).isContentEditable)
    ) {
      return;
    }
    if (!shortcutsEnabled || !isDuettoShortcutKey(e.key, e.ctrlKey, e.metaKey, e.altKey)) return;
    e.preventDefault();
    e.stopPropagation();
    void runShortcut(e);
  };

  window.addEventListener('keydown', handleKeyDown, true);
  return () => {
    window.removeEventListener('keydown', handleKeyDown, true);
  };
}
