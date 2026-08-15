import { playerHook } from './playerHook';
import { shadowOverlay } from './overlay/shadowRoot';
import { uiRenderer } from './overlay/uiRenderer';
import { applyVideoDock } from './overlay/videoDock';
import { getPageSettings, saveSettings } from '../services/storage';
import { captureCurrentNote } from './captureNote';

export function setupKeyboardShortcuts(): () => void {
  const handleKeyDown = async (e: KeyboardEvent) => {
    const active = document.activeElement;
    if (
      active &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        (active as HTMLElement).isContentEditable)
    ) {
      return;
    }

    const settings = await getPageSettings();
    if (!settings.shortcutsEnabled) return;

    const key = e.key.toLowerCase();
    const noMod = !e.ctrlKey && !e.metaKey && !e.altKey;

    if (key === 's' && noMod) {
      e.preventDefault();
      await captureCurrentNote();
      return;
    }

    if (key === 'd' && noMod) {
      e.preventDefault();
      const newEnabled = !settings.dualSubtitlesEnabled;
      const updated = await saveSettings({ dualSubtitlesEnabled: newEnabled });
      uiRenderer.updateSettings(updated);
      applyVideoDock(updated);
      shadowOverlay.showToast(newEnabled ? 'Çift Altyazı: Açık' : 'Çift Altyazı: Kapalı');
      return;
    }

    if (key === 'p' && noMod) {
      e.preventDefault();
      await playerHook.togglePiP();
      return;
    }

    if (e.key === '[' && noMod) {
      e.preventDefault();
      const newSpeed = Math.max(0.25, Math.round((playerHook.getSpeed() - 0.1) * 100) / 100);
      playerHook.setSpeed(newSpeed);
      await saveSettings({ playbackSpeed: newSpeed });
      uiRenderer.renderToolbar();
      shadowOverlay.showToast(`Hız: ${newSpeed.toFixed(2)}x`);
      return;
    }

    if (e.key === ']' && noMod) {
      e.preventDefault();
      const newSpeed = Math.min(3.5, Math.round((playerHook.getSpeed() + 0.1) * 100) / 100);
      playerHook.setSpeed(newSpeed);
      await saveSettings({ playbackSpeed: newSpeed });
      uiRenderer.renderToolbar();
      shadowOverlay.showToast(`Hız: ${newSpeed.toFixed(2)}x`);
      return;
    }

    if (key === 'j' && noMod) {
      e.preventDefault();
      playerHook.seek(-5);
      shadowOverlay.showToast('-5s');
      return;
    }

    if (key === 'l' && noMod) {
      e.preventDefault();
      playerHook.seek(5);
      shadowOverlay.showToast('+5s');
      return;
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => {
    window.removeEventListener('keydown', handleKeyDown);
  };
}
