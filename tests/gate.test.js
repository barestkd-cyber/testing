/* Every way into Testing checks the role (audit A19). Signing in always did;
 * a restored session and a password reset walked straight in. Plain Node:
 *     node tests/gate.test.js
 *
 * Since 2026-09-11 the three destructive actions (delete a testing, change a
 * result, clear the history) require the admin role, read live from profiles
 * through BTKD.getMyRole. They used to ask for a password compared against a
 * string in this public file. The second half checks that.
 */
'use strict';
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const grab = n => { const i = src.indexOf('function ' + n + '('); const a = src.lastIndexOf('async', i);
  const st = (a >= 0 && i - a <= 6) ? a : i; let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(st, k + 1); } };
async function scenario(role, path) {
  const shown = { app: 'none', login: 'none', loading: 'flex' }; let entered = false, signedOut = false, msg = '';
  const el = id => ({ get style() { const k = id === 'app' ? 'app' : id === 'login-screen' ? 'login' : id === 'loading-screen' ? 'loading' : null;
      return { set display(v) { if (k) shown[k] = v; } }; },
    set textContent(v) { msg = v; }, value: 'x@example.com' });
  const ctx = vm.createContext({
    document: { getElementById: el }, alert() {},
    sb: { from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: { role } }) }) },
    BTKD: { signIn: async () => ({ user: { id: 'u' }, error: null }), signOut: async () => { signedOut = true; },
            getSession: async () => ({ user: { id: 'u' } }), pickupSessionFromURL: async () => false,
            initResetHandler: async () => false, completePasswordReset: async () => ({ user: { id: 'u' }, error: null }) },
    enterApp: async () => { entered = true; }, currentUser: null,
  });
  vm.runInContext(['doLogin', 'isTestingStaff', 'refuseEntry', 'initAuth', 'submitNewPassword'].map(grab).join('\n'), ctx);
  if (path === 'login') await ctx.doLogin();
  if (path === 'restore') await ctx.initAuth();
  if (path === 'reset') { ctx.document.getElementById = id => (id === 'new-password-input' || id === 'new-password-confirm') ? { value: 'longenough' } : el(id); await ctx.submitNewPassword(); }
  return { entered, signedOut, msg };
}

// A thenable query builder: every chained call returns itself and awaiting it resolves.
function fakeSb(calls) {
  const chain = { delete() { return chain; }, update() { return chain; }, eq() { return chain; }, neq() { return chain; },
                  then(resolve) { resolve({ data: null, error: null }); } };
  return { from: (t) => { calls.push(t); return chain; } };
}
async function destructive(role, fn, args, confirmAnswer) {
  const calls = []; let prompted = false, alerted = '';
  const history = [{ id: 'h1', groups: [{ name: 'G', students: [{ name: 'A', result: 'pass' }] }] }];
  const ctx = vm.createContext({
    BTKD: { getMyRole: async () => role }, sb: fakeSb(calls),
    alert: (m) => { alerted = String(m); }, confirm: () => confirmAnswer, prompt: () => { prompted = true; return ''; },
    getRosterAsync: async () => {}, renderRoster() {}, refreshHistory: async () => {}, renderHistory() {},
    getHistory: () => history, openHistoryDetail() {}, clearDraft() {},
    _rosterCache: null, _historyCache: null, groups: [], currentTestingNames: null, spGroupState: {}, ffGroupState: {},
  });
  vm.runInContext(['requireAdmin', fn].map(grab).join('\n'), ctx);
  try { await ctx[fn].apply(null, args); } catch (e) { /* the tail reaches UI this stub does not model */ }
  return { calls, prompted, alerted, history };
}

(async () => {
  const assert = require("assert"); let failed = 0;
  for (const path of ["login", "restore", "reset"]) {
    try {
      const s = await scenario("student", path);
      assert.ok(!s.entered, "a student got into Testing by " + path);
      assert.ok(s.signedOut, "and was not signed out");
      assert.ok((await scenario("admin", path)).entered, "an admin was kept out by " + path);
      assert.ok((await scenario("instructor", path)).entered, "an instructor was kept out by " + path);
      console.log("  ok   " + path + ": students kept out, staff let in");
    } catch (e) { console.error("  FAIL " + path + ": " + e.message); failed++; process.exitCode = 1; }
  }

  const actions = [
    ['deleteHistory', ['h1'], ['testing_history', 'testing_sessions']],
    ['toggleResult', ['h1', 0, 0], ['testing_history']],
    ['clearAllData', [], ['testing_history', 'testing_sessions']],
  ];
  for (const [fn, args, tables] of actions) {
    try {
      for (const role of ['student', 'instructor']) {
        const r = await destructive(role, fn, args, true);
        assert.strictEqual(r.calls.length, 0, 'a ' + role + ' reached the database through ' + fn);
        assert.ok(/Only an admin/.test(r.alerted), fn + ' did not tell the ' + role + ' why');
        assert.ok(!r.prompted, fn + ' still asks for a password');
      }
      const declined = await destructive('admin', fn, args, false);
      assert.strictEqual(declined.calls.length, 0, fn + ' wrote after the admin said no at the confirm');
      const done = await destructive('admin', fn, args, true);
      for (const t of tables) assert.ok(done.calls.includes(t), fn + ' as admin never touched ' + t);
      assert.ok(!done.prompted, fn + ' still asks for a password');
      if (fn === 'toggleResult') assert.strictEqual(done.history[0].groups[0].students[0].result, 'no-change', 'the result did not flip');
      console.log('  ok   ' + fn + ': admin only, confirm respected');
    } catch (e) { console.error('  FAIL ' + fn + ': ' + e.message); failed++; process.exitCode = 1; }
  }

  try {
    for (const s of ['barestkd2024', 'DEFAULT_PW', 'getStoredPw', 'tkd_pw', 'pw-modal', 'prompt('])
      assert.ok(!src.includes(s), 'index.html still contains ' + s);
    console.log('  ok   no local password left in the page');
  } catch (e) { console.error('  FAIL source: ' + e.message); failed++; process.exitCode = 1; }

  const total = 3 + actions.length + 1;
  console.log("gate: " + (total - failed) + " passed, " + failed + " failed");
})();
