/* Thin fetch wrapper. Every call goes through here so the session,
   error shape and JSON parsing stay in exactly one place. */
(function (global) {
  'use strict';

  const BASE = '/api';

  /* The signed-in account, from the Google session (GET /api/auth/me).
     Loaded once by app.js before the first render; never from
     localStorage and never claimed by the browser — the server reads
     who you are from the session cookie on every request.
       { id, email, name, roles[], rank, pages[], isSuperadmin, impersonating } */
  let me = null;

  async function loadMe() {
    const r = await request('GET', '/auth/me');
    if (!r || !r.user) { toLogin(); return null; }
    me = { ...r.user, pages: r.pages || [], isSuperadmin: !!r.isSuperadmin,
           impersonating: !!r.impersonating };
    return me;
  }

  function currentUser() {
    return me || { id: null, name: '', email: '', roles: [], rank: 'none', pages: [] };
  }

  /* The session ended (signed out elsewhere, disabled, expired). */
  let leaving = false;
  function toLogin() {
    if (leaving) return;
    leaving = true;
    location.replace('/login');
  }

  async function request(method, path, body, query, retried) {
    let url = BASE + path;
    if (query) {
      const qs = new URLSearchParams(
        Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')
      ).toString();
      if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }

    const opts = {
      method,
      headers: { 'Accept': 'application/json' },
      credentials: 'same-origin',
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(url, opts);
    } catch (networkErr) {
      throw new Error('Cannot reach the server. Check that it is running.');
    }

    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch (e) { data = { raw: text }; } }

    if (res.status === 401 && !path.startsWith('/auth/')) toLogin();
    /* A risky action on a session that has not confirmed with Google lately:
       ask (reauth.js), then try the same request once more. */
    if (res.status === 403 && data && data.reauth && !retried && global.Reauth) {
      if (await global.Reauth.confirm(data.error)) return request(method, path, body, query, true);
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  /* A spreadsheet goes up as its own bytes, not as JSON and not as
     multipart: `fetch` sends a File as the body unchanged, and the
     server already has express.raw, so neither side needs an upload
     library — which the offline rule would have made awkward anyway.
     The name travels in a header because the body is only bytes, and
     the server uses it to tell a .xls apart from a real workbook. */
  async function postFile(path, file, query) {
    let url = BASE + path;
    const qs = new URLSearchParams(
      Object.entries(query || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    if (qs) url += '?' + qs;

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name || ''),
        },
        credentials: 'same-origin',
        body: file,
      });
    } catch (networkErr) {
      throw new Error('Cannot reach the server. Check that it is running.');
    }
    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch (e) { data = { raw: text }; } }
    if (res.status === 401 && !path.startsWith('/auth/')) toLogin();
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  global.API = {
    currentUser,
    loadMe,
    postFile,
    signOut: () => { location.href = BASE + '/auth/logout'; },
    get: (p, q) => request('GET', p, undefined, q),
    post: (p, b) => request('POST', p, b),
    put: (p, b) => request('PUT', p, b),
    patch: (p, b) => request('PATCH', p, b),
    del: (p, b) => request('DELETE', p, b),

    // Domain shortcuts — keeps page code readable.
    lookups: (type) => request('GET', '/lookups', undefined, { type }),
    addLookup: (type, value) => request('POST', '/lookups', { type, value }),
    dashboard: () => request('GET', '/dashboard'),
    categories: () => request('GET', '/poojas/categories'),
    poojas: (category) => request('GET', '/poojas', undefined, { category }),
    pooja: (id) => request('GET', `/poojas/${id}`),
    devotees: (params) => request('GET', '/devotees', undefined, params),
    devotee: (id) => request('GET', `/devotees/${id}`),
    bookings: (params) => request('GET', '/bookings', undefined, params),
    outstanding: (search) => request('GET', '/payments/outstanding', undefined, { search }),
    payments: (params) => request('GET', '/payments', undefined, params),
    paymentsByDay: (month) => request('GET', '/payments/by-day', undefined, { month }),
    donations: (params) => request('GET', '/donations', undefined, params),
    visits: (params) => request('GET', '/visits', undefined, params),
    calendar: (month) => request('GET', '/calendar', undefined, { month }),
    settings: () => request('GET', '/settings'),
    users: () => request('GET', '/users'),
    sessions: () => request('GET', '/sessions'),
    audit: (params) => request('GET', '/audit', undefined, params),

    importKinds: () => request('GET', '/import/kinds'),
    sevaNames: () => request('GET', '/import/seva-names'),
    /* A plain link, not a fetch — the browser's own download handling
       is what puts the file on disk with its name. */
    importTemplateUrl: (kind) => BASE + '/import/template/' + encodeURIComponent(kind),
    importPreview: (kind, file, opts) => postFile('/import/preview', file, { kind, ...opts }),
    importCommit: (kind, file, opts) => postFile('/import/commit', file, { kind, ...opts }),
  };
})(window);
