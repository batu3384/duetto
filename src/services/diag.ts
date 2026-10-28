const KEY = 'duetto_diag';
const CAP = 50;

function storage(): chrome.storage.LocalStorageArea | null {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;
  return chrome.storage.local;
}

export function pushDiag(message: string): void {
  const area = storage();
  if (!area) return;
  const line = `${new Date().toISOString()} ${message}`.replace(/\s+/g, ' ').slice(0, 240);
  area.get(KEY, (bag) => {
    void chrome.runtime?.lastError;
    const prev = Array.isArray(bag?.[KEY]) ? bag[KEY].filter((item): item is string => typeof item === 'string') : [];
    void area.set({ [KEY]: [line, ...prev].slice(0, CAP) });
  });
}

export function getDiag(): Promise<string[]> {
  const area = storage();
  if (!area) return Promise.resolve([]);
  return new Promise((resolve) => {
    area.get(KEY, (bag) => {
      void chrome.runtime?.lastError;
      const prev = Array.isArray(bag?.[KEY]) ? bag[KEY].filter((item): item is string => typeof item === 'string') : [];
      resolve(prev.slice(0, CAP));
    });
  });
}

export function diagToText(lines: string[]): string {
  return lines.length ? lines.join('\n') : 'Kayıt yok';
}
