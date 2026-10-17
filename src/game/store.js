// Guarded localStorage: storage can be blocked (private windows, previews),
// so every read/write is wrapped and the game works without it.
const PREFIX = 'vaelmoor:';

export function load(key, fallback = null) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
