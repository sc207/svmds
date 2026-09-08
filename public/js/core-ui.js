/* ============================================================
   CORE PAGES — Devotees / Inventory / Expenses
   ------------------------------------------------------------
   Static page skeletons + their "Add" modals, moved out of
   index.html so index.html is just the app shell. Injected at
   script-eval time (this file loads after app.js, and the
   #...Root divs already exist), so app.js's DOMContentLoaded
   renderers (renderDevoteeTable / renderInventoryTable /
   renderExpensesTable) still find their <tbody> targets.
   ============================================================ */
(function () {
  if (typeof document === 'undefined') return;

  var pages = {
    devoteesRoot:  "\n        <div class=\"flex justify-between items-center mg-page-head\">\n          <div>\n            <h1 class=\"banner-title mg-page-title\">👥 Devotee Register</h1>\n            <p class=\"mg-page-sub\">Central person model &amp; profiles — used across donations, poojas and committees</p>\n          </div>\n          <button class=\"btn btn-primary\" onclick=\"openModal('modalAddDevotee')\">\n            <svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"12\" y1=\"5\" x2=\"12\" y2=\"19\"/><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"/></svg>\n            Register New Devotee\n          </button>\n        </div>\n        <div class=\"card\">\n          <div class=\"card-header flex justify-between items-center\">\n            <div class=\"flex gap-3 items-center\">\n              <input type=\"text\" class=\"form-input mg-inline-search\" id=\"devoteeSearch\" placeholder=\"Search by name, phone, city...\" oninput=\"filterDevotees()\">\n              <select class=\"form-select mg-inline-select\" id=\"devoteeSamajFilter\" onchange=\"filterDevotees()\">\n                <option value=\"all\">All Committees / Samaj</option>\n                <option value=\"Rabari Samaj\">Rabari Samaj</option>\n                <option value=\"Marvadi Samaj\">Marvadi Samaj</option>\n                <option value=\"General Committee\">General Committee</option>\n              </select>\n            </div>\n            <span class=\"mg-muted-xs\" id=\"devoteeCountLabel\">Showing 8 Devotees</span>\n          </div>\n          <div class=\"card-body\" style=\"padding:0;\">\n            <div class=\"mg-table-scroll\">\n              <table class=\"custom-table\" id=\"devoteeTable\">\n                <thead><tr>\n                  <th>Devotee ID</th><th>Full Name</th><th>Mobile Number</th><th>City / Location</th>\n                  <th>Committee / Samaj</th><th>Status</th><th>Actions</th>\n                </tr></thead>\n                <tbody id=\"devoteeTableBody\"></tbody>\n              </table>\n            </div>\n          </div>\n        </div>",
    inventoryRoot: "\n        <div class=\"flex justify-between items-center mg-page-head\">\n          <div>\n            <h1 class=\"banner-title mg-page-title\">📦 Inventory Management</h1>\n            <p class=\"mg-page-sub\">Track pooja materials, prasad, oil, incense &amp; temple supplies</p>\n          </div>\n          <button class=\"btn btn-primary\" onclick=\"openModal('modalAddInventory')\">\n            <svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"12\" y1=\"5\" x2=\"12\" y2=\"19\"/><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"/></svg>\n            Add Inventory Item\n          </button>\n        </div>\n        <div class=\"card\">\n          <div class=\"card-header flex justify-between items-center\">\n            <div class=\"card-title\">Pooja &amp; Temple Supplies Stock Register</div>\n            <button class=\"btn btn-outline mg-btn-xs\" onclick=\"showToast('Exporting Inventory Stock Log...')\">Export CSV</button>\n          </div>\n          <div class=\"card-body\" style=\"padding:0;\">\n            <div class=\"mg-table-scroll\">\n              <table class=\"custom-table\">\n                <thead><tr>\n                  <th>Item Code</th><th>Item Description</th><th>Category</th><th>Current Stock</th>\n                  <th>Minimum Threshold</th><th>Stock Status</th><th>Action</th>\n                </tr></thead>\n                <tbody id=\"inventoryTableBody\"></tbody>\n              </table>\n            </div>\n          </div>\n        </div>",
    expensesRoot:  "\n        <div class=\"flex justify-between items-center mg-page-head\">\n          <div>\n            <h1 class=\"banner-title mg-page-title\">💸 Expense Management</h1>\n            <p class=\"mg-page-sub\">Maintenance, electricity, cleaning &amp; pooja-material expenditure</p>\n          </div>\n          <button class=\"btn btn-primary\" onclick=\"openModal('modalAddExpense')\">\n            <svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"12\" y1=\"5\" x2=\"12\" y2=\"19\"/><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"/></svg>\n            Record Expense Voucher\n          </button>\n        </div>\n        <div class=\"card\">\n          <div class=\"card-header flex justify-between items-center\">\n            <div class=\"card-title\">Temple Operational Expense Vouchers</div>\n            <button class=\"btn btn-outline mg-btn-xs\" onclick=\"showToast('Exporting Expense Log...')\">Export CSV</button>\n          </div>\n          <div class=\"card-body\" style=\"padding:0;\">\n            <div class=\"mg-table-scroll\">\n              <table class=\"custom-table\">\n                <thead><tr>\n                  <th>Voucher ID</th><th>Expense Title</th><th>Category</th><th>Amount</th>\n                  <th>Date</th><th>Status</th><th>Action</th>\n                </tr></thead>\n                <tbody id=\"expensesTableBody\"></tbody>\n              </table>\n            </div>\n          </div>\n        </div>"
  };
  Object.keys(pages).forEach(function (id) {
    var el = document.getElementById(id);
    if (el && !el.innerHTML.trim()) el.innerHTML = pages[id];
  });

  if (!document.getElementById('modalAddDevotee')) {
    document.body.insertAdjacentHTML('beforeend', `
<!-- Modal 1: Register Devotee -->
<div class="modal-overlay" id="modalAddDevotee">
  <div class="modal-box">
    <div class="modal-header">
      <div class="modal-title">Register New Devotee</div>
      <button class="modal-close-btn" onclick="closeModal('modalAddDevotee')">&times;</button>
    </div>
    <div class="modal-body">
      <form id="addDevoteeForm" onsubmit="handleSaveDevotee(event)">
        <div class="form-group">
          <label class="form-label">Full Name *</label>
          <input type="text" class="form-input" id="inputDevoteeName" placeholder="e.g. Rameshbhai Rabari" required>
        </div>
        <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group">
            <label class="form-label">Mobile Number *</label>
            <input type="tel" class="form-input" id="inputDevoteePhone" placeholder="10-digit mobile" required>
          </div>
          <div class="form-group">
            <label class="form-label">Committee / Samaj</label>
            <select class="form-select" id="inputDevoteeSamaj">
              <option value="Rabari Samaj">Rabari Samaj</option>
              <option value="Marvadi Samaj">Marvadi Samaj</option>
              <option value="General Committee">General Committee</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">City / Location *</label>
          <input type="text" class="form-input" id="inputDevoteeCity" placeholder="Sanand, Ahmedabad" required>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal('modalAddDevotee')">Cancel</button>
      <button class="btn btn-primary" type="submit" form="addDevoteeForm">Save Devotee Record</button>
    </div>
  </div>
</div>


<!-- Modal 4: Record Expense -->
<div class="modal-overlay" id="modalAddExpense">
  <div class="modal-box">
    <div class="modal-header">
      <div class="modal-title">💸 Record Expense Voucher</div>
      <button class="modal-close-btn" onclick="closeModal('modalAddExpense')">&times;</button>
    </div>
    <div class="modal-body">
      <form id="addExpenseForm" onsubmit="handleSaveExpense(event)">
        <div class="form-group">
          <label class="form-label">Expense Title / Description *</label>
          <input type="text" class="form-input" id="inputExpenseTitle" placeholder="e.g. Electricity Bill Sept" required>
        </div>
        <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group">
            <label class="form-label">Amount (₹) *</label>
            <input type="number" class="form-input" id="inputExpenseAmount" placeholder="e.g. 5000" required>
          </div>
          <div class="form-group">
            <label class="form-label">Category</label>
            <select class="form-select" id="inputExpenseCategory">
              <option value="Maintenance">Maintenance</option>
              <option value="Electricity">Electricity</option>
              <option value="Cleaning">Cleaning</option>
              <option value="Pooja Materials">Pooja Materials</option>
              <option value="Prasad">Prasad</option>
            </select>
          </div>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal('modalAddExpense')">Cancel</button>
      <button class="btn btn-primary" type="submit" form="addExpenseForm">Save Expense</button>
    </div>
  </div>
</div>


<!-- Modal 5: Add Inventory -->
<div class="modal-overlay" id="modalAddInventory">
  <div class="modal-box">
    <div class="modal-header">
      <div class="modal-title">📦 Add Inventory Item</div>
      <button class="modal-close-btn" onclick="closeModal('modalAddInventory')">&times;</button>
    </div>
    <div class="modal-body">
      <form id="addInventoryForm" onsubmit="handleSaveInventory(event)">
        <div class="form-group">
          <label class="form-label">Item Description *</label>
          <input type="text" class="form-input" id="inputInventoryItem" placeholder="e.g. Pure Ghee Containers" required>
        </div>
        <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group">
            <label class="form-label">Category</label>
            <select class="form-select" id="inputInventoryCategory">
              <option value="Pooja Materials">Pooja Materials</option>
              <option value="Prasad">Prasad</option>
              <option value="Flowers">Flowers</option>
              <option value="Incense">Incense</option>
              <option value="Temple Supplies">Temple Supplies</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Current Stock *</label>
            <input type="text" class="form-input" id="inputInventoryStock" placeholder="e.g. 50 Kgs" required>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Minimum Threshold *</label>
          <input type="text" class="form-input" id="inputInventoryMinStock" placeholder="e.g. 10 Kgs" required>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal('modalAddInventory')">Cancel</button>
      <button class="btn btn-primary" type="submit" form="addInventoryForm">Save Item</button>
    </div>
  </div>
</div>

`);
  }
})();
