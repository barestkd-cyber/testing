/* ============================================================================
 * Testing's Progress tab shows only what is true (audit A09)
 * ----------------------------------------------------------------------------
 * Plain Node. Run from the testing repo root:   node tests/progress.test.js
 *
 * The tab's class counts, stripes and notes lived in a store that is never
 * loaded, so every student at a rank with a class minimum read "Not Eligible"
 * and "0/N classes", "Log this stripe" recorded nothing, and "Save Note" said
 * "Note saved" and kept nothing. On Pace is real (contacts.on_pace) and stays.
 * This renders the real functions against a page holding the real ids.
 * ========================================================================== */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function grab(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i === -1) throw new Error(name + ' not found');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
}

const els = {};
const el = (id) => (els[id] = els[id] || { id, innerHTML: '', value: '', style: {}, addEventListener() {} });
const roster = [
  { id: 'c1', name: 'Ayman Winters', rank: 'Green Belt', age: 11, type: 'tkd', on_pace: true },
  { id: 'c2', name: "Sean O'Brien", rank: 'Blue Belt', age: 14, type: 'tkd', on_pace: false },
];
const ctx = vm.createContext({
  document: { getElementById: el, querySelectorAll: () => [] },
  getRoster: () => roster,
  escHtml: (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  // Present so a stray reference cannot hide behind a ReferenceError: the
  // old card called these, and a class minimum of 20 is what made it say
  // "Not Eligible" for everyone.
  getClassReq: () => 20, getProgStudent: () => ({}), getStripeCount: () => ({ earned: 0, total: 3 }),
  toggleOnPace: () => {},
});
vm.runInContext(grab('renderProgress') + '\n' + grab('openProgSheet'), ctx);
vm.runInContext('renderProgress()', ctx);
const list = els['progress-list'].innerHTML;
// Opened lazily, INSIDE the sheet checks, so a sheet that throws is a failed
// check rather than a crash that hides every other result.
let sheet = null;
function openSheet() {
  if (!sheet) {
    vm.runInContext("openProgSheet(\"Sean O'Brien\")", ctx);
    sheet = { head: els['prog-sheet-header'].innerHTML, body: els['prog-sheet-body'].innerHTML };
  }
  return sheet;
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ok   ' + name); passed++; }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + (e && e.message)); failed++; process.exitCode = 1; }
}

test('the list renders', () => assert.ok(list.length > 0));
test('no student is declared ineligible from data that is never loaded', () =>
  assert.ok(!/Eligible/.test(list), 'the list still passes an eligibility verdict'));
test('no always-zero class count is shown', () =>
  assert.ok(!/\d+\/\d+ classes/.test(list), 'a class count is still rendered'));
test('On Pace, the one real flag, is offered for every student', () =>
  assert.strictEqual((list.match(/data-prog-pace=/g) || []).length, roster.length));
test('the sheet no longer offers to log what it never saves', () =>
  assert.ok(!/Log this stripe|Save Note|Note saved/.test(openSheet().body)));
test('the sheet says where the real records are kept', () =>
  assert.ok(/profile in the CRM/.test(openSheet().body)));
test('a name with an apostrophe still opens its sheet', () =>
  assert.ok(/O.{0,6}Brien/.test(openSheet().head)));

console.log('progress: ' + passed + ' passed, ' + failed + ' failed');
