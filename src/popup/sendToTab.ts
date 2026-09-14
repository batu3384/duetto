export function isUdemyPageUrl(url: string): boolean {
  return /^https?:\/\/(?:[^/]*\.)?udemy\.com\//i.test(url || '');
}

export function sendToUdemyTab(message: Record<string, unknown>, cb?: (res: unknown) => void): void {
  if (typeof chrome === 'undefined' || !chrome.tabs) return;
  const deliver = (tabId: number) => {
    chrome.tabs.sendMessage(tabId, message, (res) => {
      void chrome.runtime.lastError;
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
      if (!tab?.id) {
        cb?.(undefined);
        return;
      }
      deliver(tab.id);
    });
  });
}
