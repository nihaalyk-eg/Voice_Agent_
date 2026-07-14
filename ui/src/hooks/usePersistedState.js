import { useState, useEffect } from 'react';

const PREFIX = 'zora:';

function readStored(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// Drop-in replacement for useState that persists to localStorage under the
// 'zora:' prefix, so settings (language, voice, agent config, etc.) survive
// a page reload instead of resetting to defaults every time.
export function usePersistedState(key, defaultValue) {
  const [value, setValue] = useState(() => readStored(key, defaultValue));

  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // localStorage unavailable (private browsing, quota exceeded) — settings just won't persist
    }
  }, [key, value]);

  return [value, setValue];
}
