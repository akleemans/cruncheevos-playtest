/**
 * Parser for RetroAchievements code notes files. Two formats are supported,
 * auto-detected:
 *
 * 1. Local notes ("<gameid>-User.txt", RAIntegration's unsaved-notes file):
 *      N0:0x0770:"[8-bit] Game state\r\n0x01 = ..."
 *
 * 2. JSON ("<gameid>-Notes.json" from RAIntegration's RACache/Data folder,
 *    or the API_GetCodeNotes web API):
 *      [{ "User": "...", "Address": "0x000770", "Note": "[8-bit] ..." }, ...]
 *    optionally wrapped as { "CodeNotes": [...] }.
 *
 *    NOTE: "<gameid>.json" in RACache/Data is the game *patch data* (title,
 *    rich presence, achievement sets) and contains no code notes - the
 *    parser rejects it with a pointer to the right file.
 *
 * The size tag at the start of a note ("[8-bit]", "[16-bit]", "[32-bit]",
 * "[16-bit BE]", ...) determines how many bytes the value spans.
 */

/** @typedef {{ address: number, sizeBits: number, bytes: number, label: string, note: string }} CodeNote */

const SIZE_TAG = /^\s*\[(\d+)[\s-]?bit(?:s)?( BE)?\]\s*/i;

function makeNote(address, note) {
  let sizeBits = 8;
  let rest = note;
  const sizeMatch = note.match(SIZE_TAG);
  if (sizeMatch) {
    sizeBits = parseInt(sizeMatch[1], 10);
    rest = note.slice(sizeMatch[0].length);
  }

  /* first line of the remaining text is the short label */
  const label = rest.split('\n')[0].trim();

  return {
    address,
    sizeBits,
    bytes: Math.ceil(sizeBits / 8),
    label,
    note,
  };
}

function parseJsonNotes(data) {
  let entries = data;
  if (!Array.isArray(entries)) {
    entries = data.CodeNotes ?? data.codeNotes;
    if (!Array.isArray(entries)) {
      if (data.Sets || data.RichPresencePatch !== undefined) {
        throw new Error('this is the game patch data file, not code notes - ' +
          'use "<gameid>-Notes.json" from RACache/Data (or API_GetCodeNotes)');
      }
      throw new Error('unrecognized JSON code notes format (expected an array ' +
        'of {Address, Note} or a {CodeNotes: [...]} wrapper)');
    }
  }

  const notes = [];
  for (const entry of entries) {
    const rawAddress = entry.Address ?? entry.address;
    const rawNote = entry.Note ?? entry.note;
    if (rawAddress === undefined || !rawNote || !String(rawNote).trim()) continue;

    const address = typeof rawAddress === 'number'
      ? rawAddress
      : parseInt(String(rawAddress).trim(), /^0x/i.test(String(rawAddress).trim()) ? 16 : 10);
    if (!Number.isFinite(address)) continue;

    notes.push(makeNote(address, String(rawNote).replace(/\r\n/g, '\n')));
  }
  return notes;
}

/**
 * Parse a code notes file (format auto-detected, see module docs). Returns
 * an array of CodeNote sorted by address. In the text format, lines that
 * are not notes (version header, game title, local achievement definitions)
 * are ignored.
 */
export function parseCodeNotes(text) {
  let notes;

  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    notes = parseJsonNotes(JSON.parse(trimmed));
  } else {
    notes = [];
    for (const line of text.split('\n')) {
      const match = line.match(/^N0:0x([0-9a-fA-F]+):"(.*)"\s*$/);
      if (!match) continue;

      /* local notes store newlines as literal \r\n escape sequences */
      const note = match[2].replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
      notes.push(makeNote(parseInt(match[1], 16), note));
    }
  }

  notes.sort((a, b) => a.address - b.address);
  return notes;
}

/**
 * Derive a watch list (what the Lua recorder should track) from code notes:
 * [{ address, size }] with size 'u8' | 'u16' | 'u32'.
 * 24-bit notes are widened to u32 (mirrors the engine's shared-size reads).
 */
export function codeNotesToWatchlist(notes) {
  return notes.map(({ address, bytes }) => ({
    address,
    size: bytes <= 1 ? 'u8' : bytes === 2 ? 'u16' : 'u32',
  }));
}
