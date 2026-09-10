/* Every way into Testing checks the role (audit A19). Signing in always did;
 * a restored session and a password reset walked straight in. Plain Node:
 *     node tests/gate.test.js
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
  console.log("gate: " + (3 - failed) + " passed, " + failed + " failed");
})();