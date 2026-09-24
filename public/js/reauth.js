/* "Confirm it is you" — Google again, before a risky action.

   The server refuses removing money, changing who has access, the old
   backup, the password-protected exports and "view as" unless this session
   proved who it is with Google in the last 15 minutes (middleware/auth.js
   needsFreshAuth → 403 { reauth: true }). api.js (and the export downloads)
   call Reauth.confirm() on that answer, then retry the request once.

   The Google button is the same Google Identity Services the login page
   uses, pre-filled with the signed-in email; the result goes to
   POST /api/auth/reconfirm, which accepts only the SAME account. If the
   Google popup cannot open (some phones), signing out and in again counts
   as confirming. Closing the sheet means "not now" — the action is not done. */
(function (global) {
  'use strict';

  let gisLoading = null;
  function loadGis() {
    if (global.google && google.accounts && google.accounts.id) return Promise.resolve();
    if (gisLoading) return gisLoading;
    gisLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { gisLoading = null; reject(new Error('Google sign-in could not load')); };
      document.head.appendChild(s);
    });
    return gisLoading;
  }

  let pending = null;          // one confirmation at a time, shared by every caller

  function confirm(message) {
    if (pending) return pending;
    pending = new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; pending = null; resolve(v); };
      const me = (global.API && API.currentUser()) || {};
      UI.openSheet({
        title: 'Confirm it is you',
        body: `
          <p style="margin-top:0">${UI.esc(message || 'This action needs you to confirm it is you.')}</p>
          <p class="small muted">Continue with Google as <strong>${UI.esc(me.email || 'your account')}</strong>.
            It is asked for removing money, changing who has access, the old backup and password-protected
            exports — so a laptop left signed in cannot do them.</p>
          <div id="reauthBtn" style="min-height:44px;margin:.9rem 0"></div>
          <div id="reauthMsg" class="small" role="status"></div>
          <p class="small muted" style="margin-bottom:0">Google not opening? <a href="/api/auth/logout">Sign out and sign in again</a>
            — that confirms it too.</p>`,
        footer: `<button class="btn btn-outline" data-sheet-close>Not now</button>`,
        async onMount(sheet) {
          sheet.addEventListener('close', () => finish(false), { once: true });
          const msg = document.getElementById('reauthMsg');
          try {
            const cfg = await API.get('/auth/config');
            await loadGis();
            google.accounts.id.initialize({
              client_id: cfg.googleClientId,
              auto_select: false,
              login_hint: me.email || undefined,
              ux_mode: 'popup',
              callback: async (r) => {
                msg.textContent = 'Checking…';
                try {
                  await API.post('/auth/reconfirm', { credential: r.credential });
                  UI.toast('Confirmed — carrying on', 'ok');
                  finish(true);
                  UI.closeSheet();
                } catch (err) {
                  msg.textContent = err.message;
                  msg.style.color = 'var(--danger)';
                }
              },
            });
            google.accounts.id.renderButton(document.getElementById('reauthBtn'),
              { theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill' });
          } catch (err) {
            msg.textContent = err.message + ' — use "Sign out and sign in again" below.';
          }
        },
      });
    });
    return pending;
  }

  global.Reauth = { confirm };
})(window);
