/* ============================================================
   MAHA YAGNA SEVARTHI SIGNUPS — FORMS
   Registration settings (enable + open/close window) and per-row
   review (status/notes). Both use the generic openSheet() primitive
   (management-forms.js) — no dedicated modal markup needed.
   ============================================================ */

function openYagnaSettingsSheet() {
  if (typeof openSheet !== 'function') return;
  const s = YAGNA.settings;
  openSheet({
    title: window.t('yagna_settings_title', 'Maha Yagna Registration Settings'),
    body: `
      <div class="form-group">
        <label class="form-label" style="display:flex;align-items:center;gap:.5rem">
          <input type="checkbox" id="yagnaSetEnabled" ${s.enabled ? 'checked' : ''}>
          ${window.t('yagna_setting_enabled', 'Public registration page is open')}
        </label>
        <div class="mg-muted-xs">${window.t('yagna_setting_enabled_hint', 'When off, /yagna shows a closed message and the form is not shown.')}</div>
      </div>
      <div class="grid mg-2col-form">
        <div class="form-group">
          <label class="form-label" for="yagnaSetOpensAt">${window.t('yagna_opens_at', 'Opens')}</label>
          <input type="datetime-local" class="form-input" id="yagnaSetOpensAt" value="${yagnaEsc(s.opensAt || '')}">
        </div>
        <div class="form-group">
          <label class="form-label" for="yagnaSetClosesAt">${window.t('yagna_closes_at', 'Closes')}</label>
          <input type="datetime-local" class="form-input" id="yagnaSetClosesAt" value="${yagnaEsc(s.closesAt || '')}">
        </div>
      </div>
      <div class="mg-muted-xs">${window.t('yagna_setting_window_hint', 'Leave both blank to stay open the whole time the toggle above is on.')}</div>
    `,
    footer: `
      <button class="btn btn-outline" onclick="closeSheet()">${window.t('cancel', 'Cancel')}</button>
      <button class="btn btn-primary" onclick="saveYagnaSettings()">${window.t('save', 'Save')}</button>
    `,
  });
}

function saveYagnaSettings() {
  const enabled = !!document.getElementById('yagnaSetEnabled').checked;
  const opensAt = document.getElementById('yagnaSetOpensAt').value || null;
  const closesAt = document.getElementById('yagnaSetClosesAt').value || null;
  if (opensAt && closesAt && closesAt < opensAt) {
    yagnaToast(window.t('yagna_setting_bad_window', 'Closing time must be after the opening time.'));
    return;
  }
  const payload = { enabled, opensAt, closesAt };
  YAGNA.settings = payload;   // optimistic
  if (typeof closeSheet === 'function') closeSheet();
  renderYagnaSignups();

  if (window.API && window.API.online) {
    window.API.put('/settings/yagna-registration', payload)
      .then(r => { if (r && r.yagnaRegistration) YAGNA.settings = r.yagnaRegistration; renderYagnaSignups(); yagnaToast(window.t('yagna_settings_saved', 'Registration settings saved.')); })
      .catch(err => yagnaToast((err && err.message) || 'Save failed'));
  } else {
    yagnaToast(window.t('yagna_settings_saved', 'Registration settings saved.'));
  }
}

/* Statuses selectable in Phase 1 review — 'converted' is deliberately left
   out here (it stays valid in the DB/CHECK for the not-yet-built Phase 2
   approval step, migration 018) so staff can never mark something
   "converted" when no conversion logic exists behind it yet. */
const YAGNA_REVIEW_STATUSES = ['submitted', 'under_review', 'contacted', 'needs_follow_up', 'reviewed', 'rejected'];

function openYagnaReviewSheet(code) {
  const x = yagnaByCode(code);
  if (!x || typeof openSheet !== 'function') return;
  const similar = (typeof yagnaSimilarTo === 'function') ? yagnaSimilarTo(x) : [];
  openSheet({
    title: window.t('yagna_review_title', 'Review') + ' — ' + x.code,
    body: `
      <div class="mg-note-box" style="margin-bottom:1rem">
        <strong>${yagnaEsc((x.firstName + ' ' + x.lastName).trim())}</strong><br>
        ${yagnaEsc(x.samajName || '—')} &middot; ${yagnaEsc(x.city || '—')}${x.state ? ', ' + yagnaEsc(x.state) : ''}<br>
        ${window.t('mobile', 'Mobile')}: ${yagnaEsc(x.mobile)} &middot; ${window.t('yagna_contribution', 'Contribution')}: ${yagnaMoney(x.expectedContribution)}
      </div>
      ${similar.length ? `
      <div class="mg-note-box" style="margin-bottom:1rem;border-color:var(--warning,#B06A12)">
        <strong style="color:var(--warning,#B06A12)">⚠ ${window.t('yagna_similar_title', 'Possible duplicate registrations')}</strong>
        <div class="mg-muted-xs" style="margin:.3rem 0">${window.t('yagna_similar_body_hint', 'Same mobile, or same name + city, as another live registration. Review only — nothing is merged automatically.')}</div>
        ${similar.map(s => `<div class="mg-muted-xs">${yagnaEsc(s.code)} — ${yagnaEsc((s.firstName + ' ' + s.lastName).trim())} · ${yagnaEsc(s.mobile)} · ${yagnaEsc(s.city || '—')}</div>`).join('')}
      </div>` : ''}
      <div class="form-group">
        <label class="form-label" for="yagnaRevStatus">${window.t('status', 'Status')}</label>
        <select class="form-select" id="yagnaRevStatus">
          ${YAGNA_REVIEW_STATUSES.concat(x.status === 'converted' ? ['converted'] : []).map(st =>
            `<option value="${st}" ${x.status === st ? 'selected' : ''}>${yagnaStatusLabel(st)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="yagnaRevNotes">${window.t('notes', 'Notes')}</label>
        <textarea class="form-input" id="yagnaRevNotes" rows="3" placeholder="${window.t('yagna_notes_ph', 'Internal notes — e.g. duplicate of DEV-1023, mobile confirmed by phone…')}">${yagnaEsc(x.notes || '')}</textarea>
      </div>
    `,
    footer: `
      <button class="btn btn-outline" onclick="closeSheet()">${window.t('cancel', 'Cancel')}</button>
      <button class="btn btn-primary" onclick="saveYagnaReview('${yagnaEsc(x.code)}')">${window.t('save', 'Save')}</button>
    `,
  });
}

function saveYagnaReview(code) {
  const x = yagnaByCode(code);
  if (!x) return;
  const status = document.getElementById('yagnaRevStatus').value;
  const notes = document.getElementById('yagnaRevNotes').value;
  x.status = status; x.notes = notes;   // optimistic
  if (typeof closeSheet === 'function') closeSheet();
  renderYagnaSignups();

  if (window.API && window.API.online) {
    window.API.patch('/yagna-signups/' + code, { status, notes })
      .then(() => { if (window.__rehydrate) return window.__rehydrate('yagna'); })
      .then(() => yagnaToast(window.t('yagna_review_saved', 'Saved.')))
      .catch(err => yagnaToast((err && err.message) || 'Save failed'));
  } else {
    yagnaToast(window.t('yagna_review_saved', 'Saved.'));
  }
}

function yagnaDeleteConfirm(code) {
  const x = yagnaByCode(code);
  if (!x || typeof openConfirm !== 'function') return;
  openConfirm({
    title: window.t('yagna_delete_title', 'Delete Registration'),
    body: `<p>${yagnaEsc((x.firstName + ' ' + x.lastName).trim())} — ${yagnaEsc(x.code)}</p>`,
    confirmLabel: window.t('delete', 'Delete'),
    danger: true,
    onConfirm: () => {
      YAGNA.list = YAGNA.list.filter(r => r.code !== code);   // optimistic
      renderYagnaSignups();
      if (window.API && window.API.online) {
        window.API.del('/yagna-signups/' + code)
          .then(() => yagnaToast(window.t('yagna_deleted', 'Deleted.')))
          .catch(err => yagnaToast((err && err.message) || 'Delete failed'));
      } else {
        yagnaToast(window.t('yagna_deleted', 'Deleted.'));
      }
    },
  });
}
