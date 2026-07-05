/**
 * Test Scenario format: parsing and frame expansion.
 *
 * A scenario is a folder recorded by record-scenario.lua (scaffolded by the CLI):
 *
 *   scenarios/<name>/
 *     recording.txt    frame-by-frame memory changes (sparse line format)
 *     meta.json        name, description, address labels, markers
 *     screenshots/     <frame>.png captured by the recorder
 *
 * recording.txt format (sparse, line-based):
 *   frame,0x0770:u8,0x35a4:u32,...          header: watched addresses + sizes
 *   120,0x0770=15,0x35a4=0                  first row: full snapshot
 *   903,0x0770=17,0x35a4=800                later rows: changed cells only
 *   960                                     bare frame: recording end marker
 *
 * A row applies from its frame number until the frame before the next row;
 * unlisted cells hold their previous value (0 before their first write).
 * The last row marks the final recorded frame, inclusive. Expanding held
 * values reproduces the exact per-frame sequence, which is required for
 * Delta operands and hit counting to behave like they did in the emulator.
 *
 * Every complete line is valid on its own, so a recording that stops at any
 * point (emulator crash included) stays readable; a torn final line is
 * dropped by the parser.
 *
 * This module is dependency-free and browser-safe; the Node-only file
 * loader lives in src/testing.js.
 */

import { bytesFromValues } from './engine/harness.js';

const SIZE_BYTES = { u8: 1, u16: 2, u32: 4 };

/**
 * Parse recording.txt. Returns:
 *   columns: [{ address, size }] in header order (size 'u8'|'u16'|'u32')
 *   rows:    [{ frame, values: number[] }] sorted by frame, values expanded
 *            to full per-row arrays (held cells filled in)
 */
export function parseRecording(text) {
  const lines = text.split('\n');
  /* a recording cut off mid-write may leave a torn final line */
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  if (!lines.length) throw new Error('empty recording');

  const header = lines[0].trim().split(',');
  if (header[0] !== 'frame')
    throw new Error(`recording header must start with "frame", got "${header[0]}"`);

  const columns = header.slice(1).map((cell) => {
    const match = cell.trim().match(/^0x([0-9a-fA-F]+):(u8|u16|u32)$/);
    if (!match) throw new Error(`bad column header "${cell}" (expected e.g. 0x0770:u8)`);
    return { address: parseInt(match[1], 16), size: match[2] };
  });

  const columnOf = new Map(columns.map((c, i) => [c.address, i]));
  const running = new Array(columns.length).fill(0);
  const rows = [];

  const parseLine = (line, lineNo) => {
    const cells = line.split(',');
    const frame = Number(cells[0]);
    if (!Number.isInteger(frame) || frame < 0)
      throw new Error(`line ${lineNo}: bad frame number "${cells[0]}"`);

    for (let i = 1; i < cells.length; i++) {
      const match = cells[i].match(/^0x([0-9a-fA-F]+)=(\d+)$/);
      if (!match) throw new Error(`line ${lineNo}: bad cell "${cells[i]}" (expected 0xADDR=value)`);
      const column = columnOf.get(parseInt(match[1], 16));
      if (column === undefined)
        throw new Error(`line ${lineNo}: address 0x${match[1]} is not in the header`);
      running[column] = Number(match[2]);
    }

    return { frame, values: [...running] };
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      rows.push(parseLine(line, i + 1));
    } catch (e) {
      /* tolerate a torn final line (interrupted write), reject anything else */
      if (i === lines.length - 1) break;
      throw e;
    }
  }

  if (!rows.length) throw new Error('recording has no data rows');
  rows.sort((a, b) => a.frame - b.frame);
  return { columns, rows };
}

/**
 * Serialize columns + full-value rows to the sparse format (used by tools).
 * The first row becomes a full snapshot; later rows list changed cells only;
 * rows with no changes serialize as a bare frame number.
 */
export function serializeRecording(columns, rows) {
  const addressOf = columns.map((c) => `0x${c.address.toString(16).padStart(4, '0')}`);
  const header = 'frame,' + columns.map((c, i) => `${addressOf[i]}:${c.size}`).join(',');

  const body = [];
  let previous = null;
  for (const row of rows) {
    const cells = [];
    row.values.forEach((v, i) => {
      if (!previous || previous[i] !== v) cells.push(`${addressOf[i]}=${v}`);
    });
    body.push([row.frame, ...cells].join(','));
    previous = row.values;
  }

  return [header, ...body].join('\n') + '\n';
}

/**
 * A loaded Test Scenario: recorded memory over a frame range, plus metadata
 * (description, address labels, named markers).
 */
export class Scenario {
  constructor({ meta = {}, columns, rows }) {
    if (!rows.length) throw new Error('scenario has no recorded frames');
    this.meta = meta;
    this.columns = columns;
    this.rows = rows;
    this.firstFrame = rows[0].frame;
    this.lastFrame = rows[rows.length - 1].frame;
    this.length = this.lastFrame - this.firstFrame + 1;

    /* label lookup from meta.addresses: [{address, label, ...}] */
    this._labels = new Map();
    for (const entry of meta.addresses ?? []) {
      const addr = typeof entry.address === 'string' ? parseInt(entry.address, 16) : entry.address;
      this._labels.set(addr, entry.label ?? '');
    }

    this._values = null;
    this._frames = null;
  }

  get name() { return this.meta.name ?? ''; }
  get description() { return this.meta.description ?? ''; }
  get markers() { return this.meta.markers ?? {}; }

  /** Frame number of a named marker. Throws when missing (typo protection). */
  marker(name) {
    const frame = this.markers[name];
    if (frame === undefined)
      throw new Error(`scenario "${this.name}" has no marker "${name}" (has: ${Object.keys(this.markers).join(', ') || 'none'})`);
    return frame;
  }

  label(address) { return this._labels.get(address) ?? ''; }

  indexOfFrame(frameNumber) {
    if (frameNumber < this.firstFrame || frameNumber > this.lastFrame)
      throw new Error(`frame ${frameNumber} outside scenario range ${this.firstFrame}..${this.lastFrame}`);
    return frameNumber - this.firstFrame;
  }

  frameNumberAt(index) { return this.firstFrame + index; }

  /**
   * Per-frame value arrays (held rows expanded). Unchanged frames reuse the
   * same array instance, so `values[i] !== values[i-1]` means "changed".
   */
  get values() {
    if (!this._values) {
      const values = new Array(this.length);
      let rowIndex = 0;
      for (let i = 0; i < this.length; i++) {
        const frame = this.firstFrame + i;
        while (rowIndex + 1 < this.rows.length && this.rows[rowIndex + 1].frame <= frame)
          rowIndex++;
        values[i] = this.rows[rowIndex].values;
      }
      this._values = values;
    }
    return this._values;
  }

  /** Per-frame sparse byte maps, ready to feed to the trigger runtime. */
  get frames() {
    if (!this._frames) {
      const byteCache = new Map(); /* values array -> byte map */
      this._frames = this.values.map((vals) => {
        let bytes = byteCache.get(vals);
        if (!bytes) {
          const entries = {};
          this.columns.forEach((col, i) => {
            entries[col.address] = { value: vals[i], size: SIZE_BYTES[col.size] };
          });
          bytes = bytesFromValues(entries);
          byteCache.set(vals, bytes);
        }
        return bytes;
      });
    }
    return this._frames;
  }

  /** Raw value of one watched address at a frame number. */
  valueAt(frameNumber, address) {
    const col = this.columns.findIndex((c) => c.address === address);
    if (col < 0) throw new Error(`address 0x${address.toString(16)} is not in this recording`);
    return this.values[this.indexOfFrame(frameNumber)][col];
  }

  /**
   * A sub-scenario covering [fromFrame, toFrame] (inclusive, emulator frame
   * numbers). Held values at the boundaries are preserved.
   */
  slice(fromFrame, toFrame = this.lastFrame) {
    this.indexOfFrame(fromFrame);
    this.indexOfFrame(toFrame);
    if (toFrame < fromFrame) throw new Error('slice: toFrame < fromFrame');

    const prevailingAt = (frame) => {
      let row = this.rows[0];
      for (const r of this.rows) {
        if (r.frame > frame) break;
        row = r;
      }
      return row;
    };

    const rows = [
      { frame: fromFrame, values: prevailingAt(fromFrame).values },
      ...this.rows.filter((r) => r.frame > fromFrame && r.frame < toFrame),
      { frame: toFrame, values: prevailingAt(toFrame).values },
    ];

    return new Scenario({ meta: this.meta, columns: this.columns, rows });
  }
}
