/* ============================================================
   Shared devotee "add / pick a person" widget — the SAME reusable
   form for Committee leader/member, Management lead/member, Pooja
   sevarthi/coordinator/guest. A person is a devotee; a role is a link.
   Loaded after people-picker.js.
   ============================================================ */
(function () {
  if (typeof window === 'undefined') return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var digits = function (v) { return String(v || '').replace(/\D/g, ''); };

  /* All people from the shared register, newest-first-friendly, as
     { id, name, mobile, city }. Kept in sync with the DB via state.devotees
     (hydrated from /api/devotees) plus anyone already referenced locally. */
  window.allPeople = function () {
    return (typeof templePeople === 'function' ? templePeople() : [])
      .filter(function (p) { return p.kind !== 'committee'; });
  };

  /* A checkbox roster: <div id=containerId> filled with tickable people.
     selectedIds  = array of ids to pre-tick (or [{id, role}] objects).
     roleOptions  = optional array of role names → each row gets a role <select>. */
  window.personCheckList = function (people, selectedIds, checkClass, roleOptions) {
    var sel = selectedIds || [];
    var selIds = sel.map(function (x) { return (x && x.id != null) ? x.id : x; });
    var roleOf = {};
    sel.forEach(function (x) { if (x && x.id != null && x.role) roleOf[x.id] = x.role; });
    var cls = checkClass || 'dp-check';
    if (!people.length) {
      return '<div class="mg-pad-note">No one in the register yet — use “+ Add new”.</div>';
    }
    var roleSel = function (id) {
      if (!roleOptions || !roleOptions.length) return '';
      var cur = roleOf[id] || roleOptions[0];
      return '<select class="form-select mg-inline-select ' + cls + '-role" data-for="' + esc(id) + '" onclick="event.preventDefault()">' +
        roleOptions.map(function (r) {
          return '<option value="' + esc(r) + '"' + (r === cur ? ' selected' : '') + '>' + esc(r) + '</option>';
        }).join('') + '</select>';
    };
    return '<div class="pj-people-list">' + people.map(function (p) {
      return '<label class="pj-people-row">' +
        '<input type="checkbox" class="' + cls + '" value="' + esc(p.id) + '"' +
          (selIds.indexOf(p.id) !== -1 ? ' checked' : '') + '>' +
        '<span class="pj-people-body"><strong>' + esc(p.name) + '</strong>' +
        '<small>' + (p.mobile ? esc(p.mobile) : '') + (p.city ? ' · ' + esc(p.city) : '') + '</small></span>' +
        roleSel(p.id) +
      '</label>';
    }).join('') + '</div>';
  };
  window.checkedIds = function (containerId, checkClass) {
    var box = document.getElementById(containerId);
    if (!box) return [];
    return Array.prototype.slice
      .call(box.querySelectorAll('.' + (checkClass || 'dp-check') + ':checked'))
      .map(function (c) { return c.value; });
  };
  /** [{ id, role }] for every ticked row (role from the row's <select>, if any). */
  window.checkedPeople = function (containerId, checkClass) {
    var box = document.getElementById(containerId);
    if (!box) return [];
    var cls = checkClass || 'dp-check';
    return Array.prototype.slice.call(box.querySelectorAll('.' + cls + ':checked')).map(function (c) {
      var rs = box.querySelector('.' + cls + '-role[data-for="' + c.value.replace(/"/g, '\\"') + '"]');
      return { id: c.value, role: rs ? rs.value : '' };
    });
  };

  /* The reusable "Add a new devotee" sheet. opts:
       { title?, prefillName?, roleHint?, onSaved(devotee) }
     Dedupes by mobile against the register; persists to /api/devotees when
     online, else pushes into state.devotees so it is immediately selectable. */
  window.openDevoteeSheet = function (opts) {
    opts = opts || {};
    if (typeof openSheet !== 'function') { if (typeof showToast === 'function') showToast('UI not ready'); return; }
    var nameParts = String(opts.prefillName || '').trim().split(/\s+/);
    var pf = nameParts.shift() || '';
    var pl = nameParts.join(' ');
    var commOpts = (typeof committeeNames === 'function' ? committeeNames() : [])
      .map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join('');

    openSheet({
      title: opts.title || 'Add a new person (devotee)',
      body:
        '<form id="dpForm" class="mg-2col-form">' +
          '<div class="form-group"><label class="form-label">First name *</label>' +
            '<input class="form-input" name="firstName" value="' + esc(pf) + '" required></div>' +
          '<div class="form-group"><label class="form-label">Last name</label>' +
            '<input class="form-input" name="lastName" value="' + esc(pl) + '"></div>' +
          '<div class="form-group"><label class="form-label">Contact number *</label>' +
            '<input class="form-input" name="mobile" maxlength="10" inputmode="numeric" placeholder="10-digit mobile" required oninput="dpMobileLookup()">' +
            '<div id="dpHint" class="mg-muted-xs" style="margin-top:.3rem"></div></div>' +
          '<div class="form-group"><label class="form-label">City</label><input class="form-input" name="city"></div>' +
          '<div class="form-group"><label class="form-label">State</label><input class="form-input" name="state" value="Gujarat"></div>' +
          '<div class="form-group"><label class="form-label">Committee / Samaj</label>' +
            '<input class="form-input" name="samaj" list="dpCommList" placeholder="which committee">' +
            '<datalist id="dpCommList">' + commOpts + '</datalist></div>' +
        '</form>',
      footer:
        '<button class="btn btn-outline" onclick="closeSheet()">Cancel</button>' +
        '<button class="btn btn-primary" id="dpSaveBtn" onclick="dpSubmit()">Save person</button>',
    });
    window.__dpOnSaved = (typeof opts.onSaved === 'function') ? opts.onSaved : function () {};
  };

  /* live "is this mobile already a devotee?" check */
  window.dpMobileLookup = function () {
    var f = document.getElementById('dpForm'); if (!f) return;
    var hint = document.getElementById('dpHint');
    var m = digits(f.mobile.value);
    if (m.length < 10) { hint.textContent = ''; return; }
    var hit = window.allPeople().filter(function (p) { return digits(p.mobile) === m; })[0];
    if (hit) {
      hint.innerHTML = '<span style="color:var(--success,#2E7D6B)">✓ Already a devotee: <strong>' +
        esc(hit.name) + '</strong>' + (hit.city ? ' · ' + esc(hit.city) : '') +
        '</span> — saving will just re-use this record.';
    } else {
      hint.innerHTML = '<span class="mg-muted-xs">New person — a devotee record will be created.</span>';
    }
  };

  window.dpSubmit = function () {
    var f = document.getElementById('dpForm'); if (!f) return;
    var first = f.firstName.value.trim();
    var last = f.lastName.value.trim();
    var mobile = digits(f.mobile.value);
    if (!first) { toast('First name is required'); return; }
    if (mobile.length !== 10) { toast('Contact number must be 10 digits'); return; }
    var name = (first + ' ' + last).trim();
    var city = f.city.value.trim();
    var st = f.state.value.trim() || 'Gujarat';   // NOT `state` — that's the global store
    var samaj = f.samaj.value.trim();

    // dedupe against the register
    var existing = window.allPeople().filter(function (p) { return digits(p.mobile) === mobile; })[0];
    if (existing) {
      finish({ id: existing.id, name: existing.name, mobile: existing.mobile, city: existing.city });
      return;
    }

    var online = !!(window.API && window.API.online);
    if (online) {
      window.API.post('/devotees', { name: name, mobile: mobile, city: city, state: st, samaj: samaj })
        .then(function (d) {
          pushLocal(d.id || d.code, name, mobile, city);
          finish({ id: d.id || d.code, name: name, mobile: mobile, city: city });
        })
        .catch(function (e) { toast((e && e.message) || 'Could not save'); });
    } else {
      var id = 'DEV-' + Date.now().toString().slice(-6);
      pushLocal(id, name, mobile, city);
      finish({ id: id, name: name, mobile: mobile, city: city });
    }

    function pushLocal(id, nm, mob, ct) {
      if (typeof state === 'undefined' || !Array.isArray(state.devotees)) return;
      if (!state.devotees.some(function (x) { return digits(x.phone || x.mobile) === digits(mob); })) {
        state.devotees.unshift({ id: id, name: nm, phone: mob, mobile: mob, city: ct, samaj: samaj, status: 'active', visits: 0 });
      }
    }
    function finish(dev) {
      try { if (typeof syncEntitySelects === 'function') syncEntitySelects(); } catch (e) {}
      if (typeof closeSheet === 'function') closeSheet();
      toast(dev.name + ' saved.');
      try { (window.__dpOnSaved || function () {})(dev); } catch (e) {}
    }
    function toast(m) { if (typeof showToast === 'function') showToast(m); else if (typeof pjToast === 'function') pjToast(m); }
  };
})();
