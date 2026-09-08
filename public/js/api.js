/* Thin REST client for the SVMDS backend. Loaded before every module script.
   All calls send the session cookie; a 401 bounces to /login.
   When the backend is unreachable (app opened as a static file), API.online is
   false and modules keep running on their in-memory seed data. */
window.API = (function () {
  var BASE = '/api';

  async function req(method, path, body) {
    var res;
    try {
      res = await fetch(BASE + path, {
        method: method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
        credentials: 'include',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (netErr) {
      var e = new Error('network');
      e.offline = true;
      throw e;
    }

    if (res.status === 401) {
      window.location.replace('/login');
      throw new Error('unauthorized');
    }

    var data = null;
    try { data = await res.json(); } catch (_) {}

    if (!res.ok) {
      var err = new Error((data && data.error) || ('HTTP ' + res.status));
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  return {
    get:  function (p) { return req('GET', p); },
    post: function (p, b) { return req('POST', p, b === undefined ? {} : b); },
    put:  function (p, b) { return req('PUT', p, b === undefined ? {} : b); },
    del:  function (p) { return req('DELETE', p); },

    /* Populated by the inline auth gate in index.html (may be null in demo mode). */
    session: (typeof window !== 'undefined' && window.__SESSION) || null,
    online:  !!(typeof window !== 'undefined' && window.__SESSION),

    /** Convenience: does the logged-in user hold this role? */
    hasRole: function (role) {
      var s = this.session;
      return !!(s && s.user && s.user.roles && s.user.roles.indexOf(role) !== -1);
    },
    /** Convenience: may the logged-in user open this page id? */
    canOpen: function (pageId) {
      var s = this.session;
      if (!s || !s.pages) return true;               // demo mode → unrestricted
      return s.pages.indexOf('*') !== -1 || s.pages.indexOf(pageId) !== -1;
    },
  };
})();
