/* ============================================================
   Shared people picker — one real source for every "assign a person"
   dropdown (event in-charge, committee leader, management lead, pooja
   coordinator). Aggregates from the central Devotees register plus any
   committee / management / sevarthi records, deduped by mobile, and offers
   each committee itself as an assignable entity. No hard-coded names.
   ============================================================ */
(function () {
  if (typeof window === 'undefined') return;

  function fullName(o) {
    if (!o) return '';
    return (o.name || ((o.firstName || '') + ' ' + (o.lastName || '')).trim()).trim();
  }

  /* → [{ id, name, mobile, city, kind:'person'|'committee' }] sorted by name */
  window.templePeople = function () {
    var seen = {};
    var out = [];
    function add(id, name, mobile, city, kind) {
      name = (name || '').trim();
      if (!name) return;
      var key = (kind === 'committee' ? 'c:' + id : (String(mobile || '').replace(/\D/g, '') || 'n:' + name.toLowerCase()));
      if (seen[key]) { if (id && !seen[key].id) seen[key].id = id; return; }
      var rec = { id: id || ('PP-' + key), name: name, mobile: mobile || '', city: city || '', kind: kind || 'person' };
      seen[key] = rec;
      out.push(rec);
    }

    if (typeof state !== 'undefined' && Array.isArray(state.devotees))
      state.devotees.forEach(function (d) { add(d.id, d.name, d.phone || d.mobile, d.city, 'person'); });
    if (typeof CMT !== 'undefined' && Array.isArray(CMT.members))
      CMT.members.forEach(function (m) { add(m.devoteeId || m.id, fullName(m), m.mobile, m.city, 'person'); });
    if (typeof MG !== 'undefined' && Array.isArray(MG.members))
      MG.members.forEach(function (m) { add(m.devoteeId || m.id, fullName(m), m.mobile, m.city, 'person'); });
    if (typeof POOJA !== 'undefined' && Array.isArray(POOJA.sevarthis))
      POOJA.sevarthis.forEach(function (s) { add(s.devoteeId || s.id, fullName(s), s.mobile, s.city, 'person'); });

    out.sort(function (a, b) { return a.name.localeCompare(b.name); });

    // committees as assignable entities (kept after the people, prefixed)
    if (typeof CMT !== 'undefined' && Array.isArray(CMT.committees)) {
      CMT.committees.forEach(function (c) {
        add('CMT:' + c.id, (typeof tData === 'function' ? tData(c.name) : c.name), '', '', 'committee');
      });
    }
    return out;
  };

  /** Resolve an id (person or 'CMT:<id>') to { id, name, mobile, ... } or null. */
  window.personById = function (id) {
    if (!id) return null;
    var all = window.templePeople();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  };

  /** <option> string for a <select>. Keeps a previously-saved value even if the
      person is no longer in the list; nudges the admin when the list is empty. */
  window.personOptions = function (selectedId, placeholder) {
    var all = window.templePeople();
    var html = '<option value="">' + (placeholder || '— none —') + '</option>';
    var matched = false;
    all.forEach(function (p) {
      var sel = p.id === selectedId ? ' selected' : '';
      if (sel) matched = true;
      var label = (p.kind === 'committee' ? '👥 ' : '') + p.name + (p.mobile ? ' · ' + p.mobile : '');
      html += '<option value="' + p.id + '"' + sel + '>' + label + '</option>';
    });
    if (selectedId && !matched) html += '<option value="' + selectedId + '" selected>' + selectedId + '</option>';
    if (!all.length) html += '<option value="" disabled>' +
      (typeof window.t === 'function' ? window.t('pp_empty', 'Add people in Devotees / Committee first') : 'Add people in Devotees / Committee first') +
      '</option>';
    return html;
  };
})();
