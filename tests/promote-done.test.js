/* After Apply promotions, a screen says what was saved (owner, 2026-11-19:
 * "rank update went through but no toast or new screen"). The result line used
 * to be overwritten at once by promoteDraw(), and the list came back one rank
 * higher and unchecked, so a save looked like nothing happened. Plain Node:
 *     node tests/promote-done.test.js
 */
'use strict';
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const grab = n => { const i = src.indexOf('function ' + n + '('); if (i < 0) throw new Error('no function ' + n);
  const a = src.lastIndexOf('async', i); const st = (a >= 0 && i - a <= 6) ? a : i; let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(st, k + 1); } };

let failed = 0;
const test = async (name, fn) => {
  try { await fn(); console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 3).join('\n       ')); }
};

function setup() {
  const els = {};
  const el = id => els[id] || (els[id] = { id, style: { display: '' }, innerHTML: '', value: '' });
  el('promote-area').style.display = '';
  el('promote-done').style.display = 'none';
  el('promote-date').value = '2026-11-19';
  const written = [], logged = [];
  // Two students hold the rank the screen thinks they hold; one was already
  // moved by somebody else, so the guarded update matches no row.
  const holds = { a: 'Yellow Belt', b: 'Senior Green Belt', c: 'Purple Belt', k: 'Cub Blue Belt' };
  const sb = { from(table) {
    if (table === 'rank_promotions') return { insert: async row => { logged.push(row); return { error: null }; } };
    let patch = null; const where = {};
    const q = {
      update(p) { patch = p; return q; },
      eq(col, v) { where[col] = v; return q; },
      async select() {
        if (holds[where.id] !== where.rank) return { data: [], error: null };
        holds[where.id] = patch.rank; written.push({ id: where.id, rank: patch.rank }); return { data: [{ id: where.id }], error: null };
      },
    };
    return q;
  } };
  const ctx = vm.createContext({
    document: { getElementById: el }, window: { scrollTo() { ctx.scrolled = true; } },
    confirm: () => true, alert: () => {}, sb, currentUser: { email: 'staff@example.com' },
    getRosterAsync: async () => {}, _rosterCache: {}, promoteDraw: () => { ctx.drawn = (ctx.drawn || 0) + 1; },
    PROMO: [
      { id: 'a', name: 'Sam <Sample>', isCubs: false, from: 'Yellow Belt', to: 'Senior Yellow Belt', on: true },
      { id: 'b', name: 'Pat Example', isCubs: false, from: 'Senior Green Belt', to: 'Purple Belt', on: true },
      { id: 'c', name: 'Lee Example', isCubs: false, from: 'Green Belt', to: 'Senior Green Belt', on: true },
      { id: 'k', name: 'Kit Example', isCubs: true, from: 'Blue Belt', to: 'Brown Belt', on: true },
      { id: 'd', name: 'Left Unchecked', isCubs: false, from: 'Orange Belt', to: 'Senior Orange Belt', on: false },
    ],
    RANK_ORDER: ['White Belt', 'Yellow Belt', 'Senior Yellow Belt', 'Orange Belt', 'Senior Orange Belt', 'Green Belt',
      'Senior Green Belt', 'Purple Belt', 'Senior Purple Belt'],
    CUBS_RANK_ORDER: ['White Belt', 'Yellow Belt', 'Orange Belt', 'Green Belt', 'Purple Belt', 'Blue Belt', 'Brown Belt', 'Red Belt'],
  });
  vm.runInContext(['getNextRank', 'escHtml', 'applyPromotions', 'promoteShowDone', 'promoteDoneClose'].map(grab).join('\n')
    + '\nvar rankShort = r => String(r == null ? "" : r).replace(/Senior/g, "Sr.");', ctx);
  return { ctx, el, written, logged };
}

(async () => {
  await test('Apply shows a done screen that lists who moved from what to what', async () => {
    const { ctx, el, written, logged } = setup();
    await ctx.applyPromotions();
    assert.strictEqual(el('promote-done').style.display, '', 'the done screen is showing');
    assert.strictEqual(el('promote-area').style.display, 'none', 'the list steps aside');
    assert.ok(ctx.scrolled, 'the page goes to the top so the screen is seen');
    const html = el('promote-done-body').innerHTML;
    assert.ok(html.includes('Promotions saved'), html);
    assert.ok(html.includes('3 students moved up in the CRM, rank date 11/19/2026.'), html);
    assert.ok(html.includes('<td>Sam &lt;Sample&gt;</td><td>Yellow Belt</td><td><strong>Sr. Yellow Belt</strong></td>'), 'names are escaped, ranks read short');
    assert.ok(html.includes('<td>Pat Example</td><td>Sr. Green Belt</td><td><strong>Purple Belt</strong></td>'), html);
    assert.ok(html.includes('<td>Kit Example</td><td>Cub Blue Belt</td><td><strong>Cub Brown Belt</strong></td>'), 'Cubs keep their prefix');
    assert.ok(html.includes('1 skipped') && html.includes('Lee Example'), 'the student already moved is named as skipped');
    assert.ok(!html.includes('Left Unchecked'), 'an unchecked student is not on the done screen');
    assert.deepStrictEqual(written.map(w => w.id), ['a', 'b', 'k']);
    assert.strictEqual(logged.length, 3, 'every promotion is recorded so it can be undone');
  });

  await test('the list behind it moves up only the students who moved, and nobody stays checked', async () => {
    const { ctx } = setup();
    await ctx.applyPromotions();
    const by = id => ctx.PROMO.find(p => p.id === id);
    assert.strictEqual(by('a').from, 'Senior Yellow Belt');
    assert.strictEqual(by('a').to, 'Orange Belt');
    assert.strictEqual(by('k').from, 'Brown Belt', 'a Cub moves on the Cubs ladder');
    assert.strictEqual(by('c').from, 'Green Belt', 'a skipped student keeps the rank shown before');
    assert.ok(ctx.PROMO.every(p => !p.on), 'nothing is left checked for a second press');
    assert.ok(ctx.drawn >= 1, 'the list is redrawn');
  });

  await test('Back to the list brings the list back', async () => {
    const { ctx, el } = setup();
    await ctx.applyPromotions();
    ctx.promoteDoneClose();
    assert.strictEqual(el('promote-done').style.display, 'none');
    assert.strictEqual(el('promote-area').style.display, '');
  });

  await test('reloading the Promote tab closes the done screen', () => {
    const body = grab('renderPromote');
    assert.ok(/getElementById\('promote-done'\)[\s\S]{0,80}display='none'/.test(body), 'renderPromote hides the done screen');
  });

  console.log(failed ? '\n' + failed + ' FAILED' : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
