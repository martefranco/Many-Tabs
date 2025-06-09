// storage.js

const WRITE_DEBOUNCE_MS = 100;
let writeQueue = {};
let writeTimeout = null;

export const get = (key) =>
  new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => resolve(result));
  });

export const set = (obj) =>
  new Promise((resolve) => {
    chrome.storage.local.set(obj, () => resolve());
  });

export const clear = () =>
  new Promise((resolve) => {
    chrome.storage.local.clear(() => resolve());
  });

// Debounced write: accumulates changes and writes every 100ms max
export function queueWrite(obj) {
  Object.assign(writeQueue, obj);
  if (writeTimeout) clearTimeout(writeTimeout);
  writeTimeout = setTimeout(() => {
    chrome.storage.local.set(writeQueue, () => {
      writeQueue = {};
      writeTimeout = null;
    });
  }, WRITE_DEBOUNCE_MS);
}

// Placeholder for future migration logic
export function migrateSyncToLocal() {
  // To be implemented in v1.1
}
