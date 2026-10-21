export function isUdemyPageUrl(url: string): boolean {
  return /^https?:\/\/(?:[^/]*\.)?udemy\.com\//i.test(url || '');
}

export function tabSendFailure(hasTab: boolean, lastError: string | null): string | null {
  if (!hasTab) return 'Açık Udemy ders sekmesi yok.';
  if (lastError) return 'Duetto bu sekmede yanıt vermedi. Sayfayı yenile.';
  return null;
}

let sendErrorHandler: ((message: string) => void) | null = null;

export function setSendErrorHandler(handler: ((message: string) => void) | null): void {
  sendErrorHandler = handler;
}

function reportSendError(message: string): void {
  sendErrorHandler?.(message);
}

export function sendToUdemyTab(message: Record<string, unknown>, cb?: (res: unknown) => void): void {
  if (typeof chrome === 'undefined' || !chrome.tabs) {
    reportSendError(tabSendFailure(false, null) || 'Açık Udemy ders sekmesi yok.');
    cb?.(undefined);
    return;
  }
  const deliver = (tabId: number) => {
    chrome.tabs.sendMessage(tabId, message, (res) => {
      const failure = tabSendFailure(true, chrome.runtime.lastError?.message || null);
      if (failure) {
        reportSendError(failure);
        cb?.(undefined);
        return;
      }
      cb?.(res);
    });
  };
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const active = tabs[0];
    if (active?.id && isUdemyPageUrl(active.url || '')) {
      deliver(active.id);
      return;
    }
    chrome.tabs.query({ url: ['https://*.udemy.com/*'] }, (found) => {
      const tab = found.find((item) => item.active) || found[0];
      const failure = tabSendFailure(!!tab?.id, null);
      if (!tab?.id || failure) {
        reportSendError(failure || 'Açık Udemy ders sekmesi yok.');
        cb?.(undefined);
        return;
      }
      deliver(tab.id);
    });
  });
}
