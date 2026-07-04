/**
 * Unit tests for the Test Scenario format, code notes parsing and the
 * conditionSpans helper.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRecording, serializeRecording, Scenario } from '../src/scenario-format.js';
import { parseCodeNotes, codeNotesToWatchlist } from '../src/code-notes.js';
import { conditionSpans } from '../src/trigger.js';

test('sparse recording parses, expands held cells, and round-trips', () => {
  const text = [
    'frame,0x0770:u8,0x35a4:u32',
    '100,0x0770=12,0x35a4=0',   /* full snapshot */
    '103,0x0770=15,0x35a4=500', /* both changed */
    '105,0x0770=16',            /* only one cell: atoms held at 500 */
    '106',                      /* bare frame: recording end marker */
  ].join('\n');

  const { columns, rows } = parseRecording(text);
  assert.deepEqual(columns, [
    { address: 0x0770, size: 'u8' },
    { address: 0x35a4, size: 'u32' },
  ]);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[2], { frame: 105, values: [16, 500] }); /* held cell filled in */
  assert.deepEqual(rows[3], { frame: 106, values: [16, 500] }); /* bare row holds all */

  const scenario = new Scenario({ columns, rows });
  assert.equal(scenario.firstFrame, 100);
  assert.equal(scenario.lastFrame, 106);
  assert.equal(scenario.length, 7);

  /* held frames repeat the previous row's values */
  assert.equal(scenario.valueAt(100, 0x0770), 12);
  assert.equal(scenario.valueAt(102, 0x0770), 12);
  assert.equal(scenario.valueAt(103, 0x0770), 15);
  assert.equal(scenario.valueAt(106, 0x35a4), 500);

  /* unchanged frames share the same values array (change detection) */
  assert.equal(scenario.values[0], scenario.values[2]);
  assert.notEqual(scenario.values[2], scenario.values[3]);

  /* byte maps expand multi-byte values little-endian */
  const frame3 = scenario.frames[3];
  assert.equal(frame3[0x0770], 15);
  assert.equal(frame3[0x35a4], 500 & 0xff);
  assert.equal(frame3[0x35a5], 500 >> 8);

  /* round trip */
  const serialized = serializeRecording(columns, rows);
  const { columns: c2, rows: r2 } = parseRecording(serialized);
  assert.deepEqual(c2, columns);
  assert.deepEqual(r2, rows);
  /* no-change rows serialize back to a bare frame */
  assert.match(serialized, /\n106\n$/);
});

test('recording tolerates a torn final line, rejects earlier garbage', () => {
  const good = 'frame,0x0000:u8\n10,0x0000=1\n20,0x0000=2\n30,0x00';
  const { rows } = parseRecording(good);
  assert.equal(rows.length, 2); /* torn last line dropped */
  assert.equal(rows[1].frame, 20);

  assert.throws(() => parseRecording('frame,0x0000:u8\n10,0x00\n20,0x0000=2'),
    /bad cell/);
  assert.throws(() => parseRecording('frame,0x0000:u8\n10,0x9999=1\n20,0x0000=2'),
    /not in the header/);
});

test('scenario markers and slicing', () => {
  const { columns, rows } = parseRecording(
    'frame,0x0000:u8\n0,0x0000=1\n50,0x0000=2\n100,0x0000=3\n150');
  const scenario = new Scenario({
    meta: { name: 'x', markers: { middle: 75 } },
    columns, rows,
  });

  assert.equal(scenario.marker('middle'), 75);
  assert.throws(() => scenario.marker('nope'), /no marker "nope"/);

  const sliced = scenario.slice(40, 120);
  assert.equal(sliced.firstFrame, 40);
  assert.equal(sliced.lastFrame, 120);
  assert.equal(sliced.valueAt(40, 0), 1);  /* held from frame 0 */
  assert.equal(sliced.valueAt(60, 0), 2);
  assert.equal(sliced.valueAt(120, 0), 3);
});

test('JSON code notes parse (RACache -Notes.json / API_GetCodeNotes)', () => {
  const json = JSON.stringify({
    CodeNotes: [
      { User: 'a', Address: '0x000770', Note: '[8-bit] Game state\r\n0x0f = In game' },
      { User: 'a', Address: '0x0035a4', Note: '[32-bit] Atoms collected' },
      { User: 'a', Address: '0x00360c', Note: 'Buttons pressed' },  /* no size tag: 8-bit */
      { User: 'a', Address: '0x001820', Note: '[16-bit] Pumpkin 1' },
      { User: 'a', Address: '0x009999', Note: '' },                 /* deleted note: skipped */
    ],
  });
  const notes = parseCodeNotes(json);
  assert.equal(notes.length, 4);
  assert.deepEqual(
    notes.map((n) => [n.address, n.sizeBits, n.label]),
    [
      [0x0770, 8, 'Game state'],
      [0x1820, 16, 'Pumpkin 1'],
      [0x35a4, 32, 'Atoms collected'],
      [0x360c, 8, 'Buttons pressed'],
    ]);

  /* a bare array works too */
  assert.equal(parseCodeNotes('[{"Address": 1904, "Note": "x"}]')[0].address, 1904);

  /* the patch data file is rejected with a helpful message */
  assert.throws(
    () => parseCodeNotes('{"Success":true,"GameId":5260,"RichPresencePatch":"","Sets":[]}'),
    /patch data file, not code notes/);

  /* the RAIntegration local-notes text format is still supported */
  const textNotes = parseCodeNotes(
    'N0:0x0770:"[8-bit] Game state\\r\\n0x0f = In game"\nN0:0x35a4:"[32-bit] Atoms"\n');
  assert.deepEqual(textNotes.map((n) => [n.address, n.sizeBits, n.label]),
    [[0x0770, 8, 'Game state'], [0x35a4, 32, 'Atoms']]);
  assert.equal(codeNotesToWatchlist(textNotes)[1].size, 'u32');
});

test('conditionSpans aligns with parsed groups and survives 0xS operands', () => {
  const definition = '0xS0004=1_P:0xH3598=3.1.S~0xH0001!=d0xH0001SR:0xH770=12';
  const spans = conditionSpans(definition);

  assert.equal(spans.length, 3);
  assert.deepEqual(spans[0].map((s) => s.text), ['0xS0004=1', 'P:0xH3598=3.1.']);
  assert.deepEqual(spans[1].map((s) => s.text), ['~0xH0001!=d0xH0001']);
  assert.deepEqual(spans[2].map((s) => s.text), ['R:0xH770=12']);

  /* empty core */
  const spans2 = conditionSpans('S0xH0001=1S');
  assert.equal(spans2.length, 3);
  assert.deepEqual(spans2[0], []);
  assert.equal(spans2[1].length, 1);
  assert.deepEqual(spans2[2], []);
});
