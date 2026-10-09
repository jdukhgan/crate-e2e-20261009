// Shared album contract. Imported by the browser UI and by the server so limits,
// labels and validation never drift. Plain ES module, no dependencies.

export const LIMITS = Object.freeze({ title: 160, artist: 120, notes: 4000 });

export const STATUSES = Object.freeze(['want_to_hear', 'listening', 'heard']);

export const STATUS_LABELS = Object.freeze({
  want_to_hear: 'Want to hear',
  listening: 'Listening',
  heard: 'Heard',
});

// Unicode code points, not UTF-16 units: an emoji or accented letter counts once.
export function countChars(value) {
  return Array.from(value ?? '').length;
}

export function isStatus(value) {
  return STATUSES.includes(value);
}

// Normalises and validates editor input. Title/artist are trimmed before the
// required and length checks; notes are kept literally (whitespace included).
// Returns { value, errors } where errors maps field -> human message.
export function validateAlbumInput(input, { partial = false } = {}) {
  const errors = {};
  const value = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(input ?? {}, key);

  for (const field of ['title', 'artist']) {
    if (!has(field)) {
      if (!partial) errors[field] = `${field === 'title' ? 'Title' : 'Artist'} is required.`;
      continue;
    }
    if (typeof input[field] !== 'string') {
      errors[field] = 'Enter text.';
      continue;
    }
    const trimmed = input[field].trim();
    const label = field === 'title' ? 'Title' : 'Artist';
    if (!trimmed) errors[field] = `${label} is required.`;
    else if (countChars(trimmed) > LIMITS[field]) {
      errors[field] = `${label} can be at most ${LIMITS[field]} characters.`;
    }
    value[field] = trimmed;
  }

  if (has('status')) {
    if (!isStatus(input.status)) errors.status = 'Choose Want to hear, Listening or Heard.';
    else value.status = input.status;
  } else if (!partial) {
    value.status = 'want_to_hear';
  }

  if (has('notes')) {
    if (input.notes !== null && typeof input.notes !== 'string') errors.notes = 'Enter text.';
    else if (countChars(input.notes ?? '') > LIMITS.notes) {
      errors.notes = `Notes can be at most ${LIMITS.notes} characters.`;
    } else value.notes = input.notes ?? '';
  } else if (!partial) {
    value.notes = '';
  }

  return { value, errors };
}
