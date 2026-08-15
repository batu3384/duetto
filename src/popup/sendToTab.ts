export function sendToUdemyTab(message: Record<string, unknown>, cb?: (res: unknown) => void): void {
  if (typeof chrome === 'undefined' || !chrome.tabs) return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    const url = tab?.url || '';
    if (!tab?.id || !/https?:\/\/([^/]*\.)?udemy\.com\//i.test(url)) {
      cb?.(undefined);
      return;
    }
    chrome.tabs.sendMessage(tab.id, message, (res) => {
      void chrome.runtime.lastError;
      cb?.(res);
    });
  });
}
