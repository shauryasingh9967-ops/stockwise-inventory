/* Stockwise UI - plain JavaScript, talks only to the real /api/products backend. */
(() => {
  'use strict';

  // ---------- helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n || 0);
  const num = (n) => new Intl.NumberFormat('en-IN').format(n || 0);
  const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '-');

  const ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15v3M12 9v9M17 5v13"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
    swap: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z"/>',
    wifi: '<path d="M1 1l22 22M16.7 11.1A11 11 0 0 1 21 13.5M5 13.5a11 11 0 0 1 5.2-2.7M2 8.8a16 16 0 0 1 4.2-2.6M10.7 5.1A16 16 0 0 1 22 8.8M8.5 16.4a6 6 0 0 1 7 0M12 20h.01"/>',
    coins: '<circle cx="12" cy="12" r="9"/><path d="M9 9h5a2 2 0 0 1 0 4H9m0 0h5M9 9v8"/>',
  };
  const ic = (n) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

  class ApiError extends Error {
    constructor(message, status, errors) { super(message); this.status = status; this.errors = errors || []; }
  }

  async function api(path, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await fetch('/api' + path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError('Cannot reach the server. Check that the backend is running.', 0);
    }
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON response */ }
    if (!res.ok) throw new ApiError((data && data.message) || `Request failed (${res.status})`, res.status, data && data.errors);
    return data;
  }

  function toast(msg, isErr) {
    const t = document.createElement('div');
    t.className = 'toast' + (isErr ? ' err' : '');
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }

  const view = $('#view');
  const dlg = $('#dlg');
  let seq = 0;               // guards against out-of-order responses
  let knownCategories = [];  // for the category filter / form suggestions
  let currentRender = () => {};

  const statusOf = (p) => (p.quantity === 0 ? ['out', 'Out of stock'] : p.quantity <= p.reorderLevel ? ['low', 'Low stock'] : ['ok', 'In stock']);
  const badge = (p) => { const [c, t] = statusOf(p); return `<span class="badge ${c}">${t}</span>`; };

  const skeleton = () => { view.innerHTML = '<div class="skeleton"></div><div class="skeleton" style="margin-top:14px;height:220px"></div>'; };
  const emptyState = (title, text, actionHtml = '') => `<div class="state">${ic('inbox')}<h3>${esc(title)}</h3><p>${esc(text)}</p>${actionHtml}</div>`;
  const errorState = (e) => `<div class="card"><div class="state err">${ic(e.status === 0 ? 'wifi' : 'alert')}<h3>Couldn't load data</h3><p>${esc(e.message)}</p><button class="btn" data-act="retry">Try again</button></div></div>`;

  // ---------- dialogs ----------
  function openDialog(html) { dlg.innerHTML = html; if (!dlg.open) dlg.showModal(); }
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
  const head = (t) => `<div class="dlg-head"><h2>${esc(t)}</h2><button class="icon-btn" data-close aria-label="Close">${ic('x')}</button></div>`;

  async function fetchProduct(id) {
    try { return await api('/products/' + id); } catch (e) { toast(e.message, true); return null; }
  }

  // ----- add / edit form -----
  function openProductForm(p) {
    const edit = !!p;
    const v = p || { name: '', sku: '', category: '', price: '', quantity: 0, reorderLevel: 10, supplier: '' };
    const f = (id, label, val, extra = '') =>
      `<div class="field"><label for="f-${id}">${label}</label><input class="input" id="f-${id}" name="${id}" value="${esc(val)}" ${extra}><div class="err-msg" id="e-${id}" role="alert"></div></div>`;
    openDialog(`${head(edit ? 'Edit product' : 'Add product')}
      <form id="pform" novalidate>
        <div class="dlg-body">
          <div id="formBanner"></div>
          <div class="form-grid">
            <div class="full">${f('name', 'Product name *', v.name, 'maxlength="100" autocomplete="off"')}</div>
            ${f('sku', 'SKU *', v.sku, 'maxlength="40" autocomplete="off"')}
            ${f('category', 'Category *', v.category, 'maxlength="50" list="cats" autocomplete="off"')}
            ${f('price', 'Price (INR) *', v.price, 'type="number" min="0" step="any" inputmode="decimal"')}
            ${f('quantity', 'Quantity *', v.quantity, 'type="number" min="0" step="1" inputmode="numeric"')}
            ${f('reorderLevel', 'Reorder level *', v.reorderLevel, 'type="number" min="0" step="1" inputmode="numeric"')}
            ${f('supplier', 'Supplier', v.supplier, 'maxlength="100" autocomplete="off"')}
          </div>
          <datalist id="cats">${knownCategories.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        </div>
        <div class="dlg-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" id="saveBtn">${edit ? 'Save changes' : 'Create product'}</button></div>
      </form>`);

    const form = $('#pform');
    const setErr = (field, msg) => {
      const el = $('#e-' + field); const inp = $('#f-' + field);
      if (!el) return false;
      el.textContent = msg || ''; inp.classList.toggle('invalid', !!msg); return !!msg;
    };

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(form).entries());
      Object.keys(d).forEach((k) => { d[k] = String(d[k]).trim(); });
      let bad = false;
      bad = setErr('name', d.name.length < 2 ? 'Enter a product name (at least 2 characters)' : '') || bad;
      bad = setErr('sku', !d.sku ? 'SKU is required' : '') || bad;
      bad = setErr('category', !d.category ? 'Category is required' : '') || bad;
      bad = setErr('price', d.price === '' || !(Number(d.price) >= 0) ? 'Enter a price of 0 or more' : '') || bad;
      bad = setErr('quantity', !/^\d+$/.test(d.quantity) ? 'Enter a whole number, 0 or more' : '') || bad;
      bad = setErr('reorderLevel', !/^\d+$/.test(d.reorderLevel) ? 'Enter a whole number, 0 or more' : '') || bad;
      if (bad) { $('#formBanner').innerHTML = ''; return; }

      const payload = { name: d.name, sku: d.sku, category: d.category, price: Number(d.price), quantity: Number(d.quantity), reorderLevel: Number(d.reorderLevel), supplier: d.supplier };
      const btn = $('#saveBtn'); btn.disabled = true; btn.textContent = 'Saving...';
      try {
        await api(edit ? '/products/' + p._id : '/products', { method: edit ? 'PUT' : 'POST', body: payload });
        dlg.close();
        toast(edit ? 'Product updated' : 'Product created');
        currentRender();
      } catch (e) {
        btn.disabled = false; btn.textContent = edit ? 'Save changes' : 'Create product';
        e.errors.forEach((x) => setErr(x.field, x.message));
        $('#formBanner').innerHTML = `<div class="banner">${esc(e.message)}</div>`;
      }
    });
    $('#f-name').focus();
  }

  // ----- details -----
  async function openDetails(id) {
    const p = await fetchProduct(id);
    if (!p) return;
    const row = (k, val) => `<dt>${k}</dt><dd>${val}</dd>`;
    openDialog(`${head('Product details')}
      <div class="dlg-body"><dl class="dl">
        ${row('Name', esc(p.name))}${row('SKU', esc(p.sku))}${row('Category', esc(p.category))}
        ${row('Price', money(p.price))}${row('Quantity', num(p.quantity))}${row('Reorder level', num(p.reorderLevel))}
        ${row('Supplier', esc(p.supplier) || '-')}${row('Status', badge(p))}
        ${row('Stock value', `${money(p.stockValue)} <span class="sub">(calculated: price x quantity)</span>`)}
        ${row('Created', when(p.createdAt))}${row('Last updated', when(p.updatedAt))}
      </dl></div>
      <div class="dlg-foot"><button class="btn" data-close>Close</button>
        <button class="btn" data-act="stock" data-id="${p._id}">${ic('swap')} Adjust stock</button>
        <button class="btn primary" data-act="edit" data-id="${p._id}">${ic('edit')} Edit</button></div>`);
  }

  // ----- stock adjustment -----
  async function openStock(id) {
    const p = await fetchProduct(id);
    if (!p) return;
    let mode = 'in';
    openDialog(`${head('Adjust stock')}
      <form id="sform" novalidate>
        <div class="dlg-body">
          <div id="sBanner"></div>
          <p style="margin:0 0 12px"><strong>${esc(p.name)}</strong><br><span class="sub">${esc(p.sku)} - current quantity: <strong>${num(p.quantity)}</strong></span></p>
          <div class="seg" role="group" aria-label="Adjustment type">
            <button type="button" data-mode="in" aria-pressed="true">Add stock (+)</button>
            <button type="button" data-mode="out" aria-pressed="false">Remove stock (-)</button>
          </div>
          <div class="field" style="margin-top:14px"><label for="amt">Units to <span id="verb">add</span></label>
            <input class="input" id="amt" type="number" min="1" step="1" value="1" inputmode="numeric"><div class="err-msg" id="amtErr" role="alert"></div></div>
          <div class="preview" id="prev"></div>
        </div>
        <div class="dlg-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" id="sBtn">Update stock</button></div>
      </form>`);

    const amt = $('#amt'), sBtn = $('#sBtn');
    const read = () => (/^\d+$/.test(amt.value.trim()) && Number(amt.value) >= 1 ? Number(amt.value) : null);
    function refresh() {
      const n = read();
      let err = '';
      if (n === null) err = 'Enter a whole number of 1 or more';
      else if (mode === 'out' && n > p.quantity) err = `Only ${num(p.quantity)} unit(s) in stock`;
      const result = n === null ? '-' : num(p.quantity + (mode === 'in' ? n : -n));
      $('#amtErr').textContent = err; amt.classList.toggle('invalid', !!err);
      $('#prev').className = 'preview' + (err ? ' bad' : '');
      $('#prev').innerHTML = `<span>Resulting quantity</span><span>${num(p.quantity)} &rarr; ${err ? '-' : result}</span>`;
      sBtn.disabled = !!err;
      $('#verb').textContent = mode === 'in' ? 'add' : 'remove';
    }
    dlg.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.mode;
      dlg.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      refresh();
    }));
    amt.addEventListener('input', refresh);
    refresh();

    $('#sform').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const n = read(); if (n === null || sBtn.disabled) return;
      sBtn.disabled = true; sBtn.textContent = 'Updating...';
      try {
        const r = await api(`/products/${p._id}/stock`, { method: 'PATCH', body: { change: mode === 'in' ? n : -n } });
        dlg.close();
        toast(`${r.product.name}: ${num(p.quantity)} -> ${num(r.product.quantity)} units`);
        currentRender();
      } catch (e) {
        sBtn.disabled = false; sBtn.textContent = 'Update stock';
        $('#sBanner').innerHTML = `<div class="banner">${esc(e.message)}</div>`;
      }
    });
    amt.select();
  }

  // ----- delete -----
  async function confirmDelete(id) {
    const p = await fetchProduct(id);
    if (!p) return;
    openDialog(`${head('Delete product')}
      <div class="dlg-body"><div id="dBanner"></div><p style="margin:0">Delete <strong>${esc(p.name)}</strong> (${esc(p.sku)})? This permanently removes it from the database and cannot be undone.</p></div>
      <div class="dlg-foot"><button class="btn" data-close>Cancel</button><button class="btn danger" id="delBtn">Delete product</button></div>`);
    $('#delBtn').addEventListener('click', async (ev) => {
      ev.target.disabled = true; ev.target.textContent = 'Deleting...';
      try {
        await api('/products/' + p._id, { method: 'DELETE' });
        dlg.close(); toast('Product deleted'); currentRender();
      } catch (e) {
        ev.target.disabled = false; ev.target.textContent = 'Delete product';
        $('#dBanner').innerHTML = `<div class="banner">${esc(e.message)}</div>`;
      }
    });
  }

  // ---------- reusable pieces ----------
  function bars(summary, valueKey, fmt) {
    const max = Math.max(...summary.map((s) => s[valueKey]), 1);
    return `<div class="bars">${summary.map((s) => `
      <div class="bar-row" title="${esc(s._id)}: ${s.totalItems} products, ${num(s.totalQuantity)} units, ${money(s.totalStockValue)} stock value, avg price ${money(s.avgPrice)}">
        <span class="bar-label">${esc(s._id)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(s[valueKey] / max) * 100}%"></div></div>
        <span class="bar-val">${fmt(s[valueKey])}</span></div>`).join('')}</div>`;
  }

  const actionBtns = (p) => `
    <button class="icon-btn" data-act="view" data-id="${p._id}" aria-label="View ${esc(p.name)}" title="View">${ic('eye')}</button>
    <button class="icon-btn" data-act="stock" data-id="${p._id}" aria-label="Adjust stock for ${esc(p.name)}" title="Adjust stock">${ic('swap')}</button>
    <button class="icon-btn" data-act="edit" data-id="${p._id}" aria-label="Edit ${esc(p.name)}" title="Edit">${ic('edit')}</button>
    <button class="icon-btn del" data-act="del" data-id="${p._id}" aria-label="Delete ${esc(p.name)}" title="Delete">${ic('trash')}</button>`;

  // ---------- pages ----------
  async function renderDashboard() {
    const my = ++seq; skeleton();
    try {
      const [sum, low] = await Promise.all([api('/products/summary'), api('/products/low-stock')]);
      if (my !== seq) return;
      knownCategories = sum.summary.map((s) => s._id);
      if (sum.categories === 0) {
        view.innerHTML = `<div class="card">${emptyState('Your inventory is empty', 'Add your first product to see totals, charts and alerts here.', '<button class="btn primary" data-act="add">Add product</button>')}</div>`;
        return;
      }
      const products = sum.summary.reduce((a, s) => a + s.totalItems, 0);
      const units = sum.summary.reduce((a, s) => a + s.totalQuantity, 0);
      const value = sum.summary.reduce((a, s) => a + s.totalStockValue, 0);
      const stat = (icon, label, val, cls = '') => `<div class="card stat ${cls}"><div class="label">${ic(icon)} ${label}</div><div class="value">${val}</div></div>`;
      view.innerHTML = `
        <div class="quick"><button class="btn primary" data-act="add">${ic('plus')} Add product</button><a class="btn" href="#/products">${ic('box')} Manage products</a><a class="btn" href="#/low-stock">${ic('alert')} Review low stock</a></div>
        <div class="grid-stats">
          ${stat('box', 'Total products', num(products))}
          ${stat('dashboard', 'Units in stock', num(units))}
          ${stat('coins', 'Inventory value', money(value))}
          ${stat('alert', 'Low-stock products', num(low.count), low.count ? 'warn' : '')}
        </div>
        <div class="grid-2">
          <div class="card card-pad"><h2>Stock value by category</h2>${bars(sum.summary, 'totalStockValue', money)}</div>
          <div class="card card-pad"><h2>Low-stock alerts</h2>
            ${low.count === 0 ? '<p class="sub" style="margin:0">Nothing needs restocking right now.</p>' : `<ul class="list">${low.lowStockItems.slice(0, 5).map((p) => `
              <li><div class="grow"><div class="pname">${esc(p.name)}</div><div class="sub">${esc(p.sku)} - ${num(p.quantity)} left (reorder at ${num(p.reorderLevel)})</div></div>
              ${badge(p)}<button class="btn sm" data-act="stock" data-id="${p._id}">Adjust</button></li>`).join('')}</ul>
              ${low.count > 5 ? `<a href="#/low-stock" class="sub">View all ${low.count} &rarr;</a>` : ''}`}
          </div>
        </div>`;
    } catch (e) { if (my === seq) view.innerHTML = errorState(e); }
  }

  // Products page keeps its filter state between renders
  const F = { search: '', category: '', minPrice: '', maxPrice: '', sortBy: 'createdAt', order: 'desc', page: 1, limit: 10 };
  const SORTS = [['createdAt', 'Newest'], ['name', 'Name'], ['sku', 'SKU'], ['category', 'Category'], ['price', 'Price'], ['quantity', 'Quantity'], ['reorderLevel', 'Reorder level']];
  const filtersActive = () => ['search', 'category', 'minPrice', 'maxPrice'].filter((k) => F[k] !== '').length;
  let searchTimer;

  async function renderProducts() {
    // category list for the filter dropdown (non-blocking)
    try { const s = await api('/products/summary'); knownCategories = s.summary.map((x) => x._id); } catch { /* shown by list request */ }
    view.innerHTML = `
      <div class="card filters">
        <div class="field search"><label for="fs">Search name or SKU</label><input class="input" id="fs" type="search" placeholder="e.g. table or FURN-" value="${esc(F.search)}"></div>
        <div class="field"><label for="fc">Category</label><select class="input" id="fc"><option value="">All categories</option>${knownCategories.map((c) => `<option ${F.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div class="field small"><label for="fmin">Min price</label><input class="input" id="fmin" type="number" min="0" step="any" value="${esc(F.minPrice)}"></div>
        <div class="field small"><label for="fmax">Max price</label><input class="input" id="fmax" type="number" min="0" step="any" value="${esc(F.maxPrice)}"></div>
        <div class="field"><label for="fsort">Sort by</label><select class="input" id="fsort">${SORTS.map(([k, l]) => `<option value="${k}" ${F.sortBy === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="ford">Order</label><select class="input" id="ford"><option value="asc" ${F.order === 'asc' ? 'selected' : ''}>Ascending</option><option value="desc" ${F.order === 'desc' ? 'selected' : ''}>Descending</option></select></div>
        <button class="btn" data-act="reset">Reset</button>
        <span id="activeNote"></span><span class="err-msg" id="fmsg"></span>
      </div>
      <div class="card" id="plist"></div>`;
    const bind = (id, key, ev = 'change') => $(id).addEventListener(ev, (e) => { F[key] = e.target.value; F.page = 1; syncControls(); loadProducts(); });
    $('#fs').addEventListener('input', (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { F.search = e.target.value.trim(); F.page = 1; syncControls(); loadProducts(); }, 300); });
    bind('#fc', 'category'); bind('#fsort', 'sortBy'); bind('#ford', 'order');
    $('#fmin').addEventListener('change', (e) => { F.minPrice = e.target.value; F.page = 1; if (syncControls()) loadProducts(); });
    $('#fmax').addEventListener('change', (e) => { F.maxPrice = e.target.value; F.page = 1; if (syncControls()) loadProducts(); });
    syncControls();
    loadProducts();
  }

  // returns false when filters are invalid (request is skipped)
  function syncControls() {
    const n = filtersActive();
    $('#activeNote').innerHTML = n ? `<span class="active-note">${n} filter${n > 1 ? 's' : ''} active</span>` : '';
    const bad = F.minPrice !== '' && F.maxPrice !== '' && Number(F.minPrice) > Number(F.maxPrice);
    $('#fmsg').textContent = bad ? 'Min price cannot be greater than max price' : '';
    return !bad;
  }

  async function loadProducts() {
    if (!syncControls()) return;
    const my = ++seq;
    const box = $('#plist');
    box.innerHTML = '<div class="skeleton" style="height:260px;border:0"></div>';
    const qs = new URLSearchParams();
    Object.entries(F).forEach(([k, v]) => { if (v !== '' && v !== null) qs.set(k, v); });
    try {
      const r = await api('/products?' + qs);
      if (my !== seq) return;
      if (r.total > 0 && r.page > r.totalPages) { F.page = r.totalPages; return loadProducts(); }
      if (r.total === 0) {
        box.innerHTML = filtersActive()
          ? emptyState('No products match your filters', 'Try different keywords or widen the price range.', '<button class="btn" data-act="reset">Reset filters</button>')
          : emptyState('No products yet', 'Your inventory is empty. Add the first product to get started.', '<button class="btn primary" data-act="add">Add product</button>');
        return;
      }
      const th = (key, label, cls = '') => {
        const on = F.sortBy === key;
        return `<th class="${cls}" aria-sort="${on ? (F.order === 'asc' ? 'ascending' : 'descending') : 'none'}"><button data-act="sort" data-key="${key}">${label}${on ? ic(F.order === 'asc' ? 'up' : 'down') : ''}</button></th>`;
      };
      const from = (r.page - 1) * r.limit + 1;
      box.innerHTML = `<div class="table-wrap"><table>
        <thead><tr>${th('name', 'Product')}${th('sku', 'SKU')}${th('category', 'Category')}${th('price', 'Price', 'num')}${th('quantity', 'Qty', 'num')}${th('reorderLevel', 'Reorder', 'num')}<th>Supplier</th><th>Status</th><th class="num">Actions</th></tr></thead>
        <tbody>${r.products.map((p) => `<tr>
          <td class="pname">${esc(p.name)}</td><td>${esc(p.sku)}</td><td>${esc(p.category)}</td>
          <td class="num">${money(p.price)}</td><td class="num">${num(p.quantity)}</td><td class="num">${num(p.reorderLevel)}</td>
          <td>${esc(p.supplier) || '-'}</td><td>${badge(p)}</td><td class="actions">${actionBtns(p)}</td></tr>`).join('')}</tbody></table></div>
        <div class="pager"><span class="sub">Showing ${from}-${from + r.count - 1} of ${num(r.total)}</span>
          <div class="ctrl">
            <label class="sub" for="plimit">Per page</label>
            <select class="input" id="plimit" style="width:auto">${[5, 10, 20, 50, 100].map((n) => `<option ${F.limit === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
            <button class="btn sm" data-act="page" data-p="${r.page - 1}" ${r.page <= 1 ? 'disabled' : ''}>Previous</button>
            <span>Page ${r.page} of ${r.totalPages}</span>
            <button class="btn sm" data-act="page" data-p="${r.page + 1}" ${r.page >= r.totalPages ? 'disabled' : ''}>Next</button>
          </div></div>`;
      $('#plimit').addEventListener('change', (e) => { F.limit = Number(e.target.value); F.page = 1; loadProducts(); });
    } catch (e) { if (my === seq) box.innerHTML = errorState(e); }
  }

  async function renderLowStock() {
    const my = ++seq; skeleton();
    try {
      const r = await api('/products/low-stock');
      if (my !== seq) return;
      if (r.count === 0) { view.innerHTML = `<div class="card">${emptyState('Everything is well stocked', 'No product is at or below its reorder level.')}</div>`; return; }
      view.innerHTML = `<p class="sub" style="margin-top:0">${r.count} product${r.count > 1 ? 's are' : ' is'} at or below its own reorder level, lowest stock first.</p>
        <div class="card"><div class="table-wrap"><table>
          <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th class="num">Qty</th><th class="num">Reorder level</th><th class="num">Short by</th><th>Supplier</th><th>Status</th><th class="num">Actions</th></tr></thead>
          <tbody>${r.lowStockItems.map((p) => `<tr>
            <td class="pname">${esc(p.name)}</td><td>${esc(p.sku)}</td><td>${esc(p.category)}</td>
            <td class="num">${num(p.quantity)}</td><td class="num">${num(p.reorderLevel)}</td><td class="num">${num(Math.max(p.reorderLevel - p.quantity, 0))}</td>
            <td>${esc(p.supplier) || '-'}</td><td>${badge(p)}</td>
            <td class="actions"><button class="icon-btn" data-act="view" data-id="${p._id}" aria-label="View ${esc(p.name)}" title="View">${ic('eye')}</button><button class="btn sm" data-act="stock" data-id="${p._id}">Restock</button></td></tr>`).join('')}</tbody></table></div></div>`;
    } catch (e) { if (my === seq) view.innerHTML = errorState(e); }
  }

  async function renderReports() {
    const my = ++seq; skeleton();
    try {
      const r = await api('/products/summary');
      if (my !== seq) return;
      if (r.categories === 0) { view.innerHTML = `<div class="card">${emptyState('No data to report', 'Add products to generate the category summary.', '<button class="btn primary" data-act="add">Add product</button>')}</div>`; return; }
      const t = r.summary.reduce((a, s) => ({ i: a.i + s.totalItems, q: a.q + s.totalQuantity, v: a.v + s.totalStockValue }), { i: 0, q: 0, v: 0 });
      view.innerHTML = `
        <div class="card card-pad" style="margin-bottom:16px"><h2>Stock value by category</h2>${bars(r.summary, 'totalStockValue', money)}<p class="sub" style="margin:12px 0 0">Hover a bar for details. ${r.categories} categories.</p></div>
        <div class="card"><div class="table-wrap"><table>
          <thead><tr><th>Category</th><th class="num">Products</th><th class="num">Total quantity</th><th class="num">Stock value</th><th class="num">Average price</th></tr></thead>
          <tbody>${r.summary.map((s) => `<tr><td class="pname">${esc(s._id)}</td><td class="num">${num(s.totalItems)}</td><td class="num">${num(s.totalQuantity)}</td><td class="num">${money(s.totalStockValue)}</td><td class="num">${money(s.avgPrice)}</td></tr>`).join('')}
          <tr><td class="pname">Total</td><td class="num pname">${num(t.i)}</td><td class="num pname">${num(t.q)}</td><td class="num pname">${money(t.v)}</td><td class="num">-</td></tr></tbody></table></div></div>`;
    } catch (e) { if (my === seq) view.innerHTML = errorState(e); }
  }

  // ---------- router & events ----------
  const ROUTES = {
    dashboard: { title: 'Dashboard', icon: 'dashboard', render: renderDashboard },
    products: { title: 'Products', icon: 'box', render: renderProducts },
    'low-stock': { title: 'Low stock', icon: 'alert', render: renderLowStock },
    reports: { title: 'Reports', icon: 'chart', render: renderReports },
  };

  $('#nav').innerHTML = Object.entries(ROUTES).map(([k, r]) => `<a href="#/${k}" data-route="${k}">${ic(r.icon)}<span>${r.title}</span></a>`).join('');
  $('#menuBtn').innerHTML = ic('menu');
  $('#addBtn').innerHTML = `${ic('plus')}<span class="txt">Add product</span>`;

  function route() {
    const key = (location.hash.replace('#/', '') || 'dashboard');
    const r = ROUTES[key] || ROUTES.dashboard;
    const k = ROUTES[key] ? key : 'dashboard';
    $('#pageTitle').textContent = r.title;
    document.title = `${r.title} - Stockwise`;
    document.querySelectorAll('#nav a').forEach((a) => (a.dataset.route === k ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    document.body.classList.remove('menu-open');
    currentRender = r.render;
    r.render();
  }
  window.addEventListener('hashchange', route);

  $('#menuBtn').addEventListener('click', () => document.body.classList.toggle('menu-open'));
  $('#scrim').addEventListener('click', () => document.body.classList.remove('menu-open'));
  $('#addBtn').addEventListener('click', () => openProductForm());

  async function openEdit(id) { const p = await fetchProduct(id); if (p) openProductForm(p); }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const { act, id } = b.dataset;
    if (act === 'add') openProductForm();
    else if (act === 'view') openDetails(id);
    else if (act === 'edit') openEdit(id);
    else if (act === 'stock') openStock(id);
    else if (act === 'del') confirmDelete(id);
    else if (act === 'retry') currentRender();
    else if (act === 'page') { F.page = Number(b.dataset.p); loadProducts(); }
    else if (act === 'sort') {
      const k = b.dataset.key;
      if (F.sortBy === k) F.order = F.order === 'asc' ? 'desc' : 'asc'; else { F.sortBy = k; F.order = 'asc'; }
      F.page = 1; $('#fsort').value = k; $('#ford').value = F.order; loadProducts();
    } else if (act === 'reset') {
      Object.assign(F, { search: '', category: '', minPrice: '', maxPrice: '', sortBy: 'createdAt', order: 'desc', page: 1 });
      renderProducts();
    }
  });

  route();
})();
