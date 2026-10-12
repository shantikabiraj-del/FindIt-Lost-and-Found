const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
let currentUser = null;
const categories = ['Electronics', 'Bags & Wallets', 'Keys', 'Clothing', 'Jewelry', 'Documents', 'Pets', 'Other'];
const esc = (value = '') => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed. Please try again.');
  return data;
}
function showMessage(target, message, type = 'error') {
  const el = typeof target === 'string' ? $(target) : target;
  if (el) el.innerHTML = `<div class="flash ${type}" role="status">${esc(message)}</div>`;
}
function dateLabel(date) {
  if (!date) return '';
  const d = new Date(`${String(date).slice(0,10)}T00:00:00`);
  return Number.isNaN(d.valueOf()) ? esc(date) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function nav() {
  const page = document.body.dataset.page;
  const authLinks = currentUser
    ? `<a href="/pages/dashboard">Dashboard</a><a href="/pages/matches">Matches</a>${currentUser.role === 'admin' ? '<a href="/pages/admin">Admin</a>' : ''}`
    : `<a href="/pages/login">Sign in</a>`;
  const actions = currentUser
    ? `<span style="font-size:12px;color:#657773">Hi, ${esc(currentUser.name.split(' ')[0])}</span><button class="btn btn-outline btn-sm" id="logoutBtn">Sign out</button>`
    : `<a class="btn btn-outline btn-sm" href="/pages/login">Sign in</a><a class="btn btn-primary btn-sm" href="/pages/register">Join free</a>`;
  const links = [
    ['browse','/pages/browse','Browse'], ['report-lost','/pages/report-lost','Report lost'], ['report-found','/pages/report-found','Report found']
  ].map(([key, href, label]) => `<a class="${page === key ? 'active' : ''}" href="${href}">${label}</a>`).join('');
  $('#site-header').innerHTML = `<div class="topbar"><div class="nav-wrap"><a class="brand" href="/"><span class="brand-icon">⌕</span>findit</a><button class="menu-toggle" aria-label="Toggle navigation" id="menuToggle">☰</button><nav class="nav-links" id="navLinks"><a class="${page === 'home' ? 'active' : ''}" href="/">Home</a>${links}${authLinks}</nav><div class="nav-actions">${actions}</div></div></div>`;
  $('#menuToggle')?.addEventListener('click', () => $('#navLinks').classList.toggle('open'));
  $('#logoutBtn')?.addEventListener('click', async () => { try { await api('/api/auth/logout', { method: 'POST' }); location.href = '/'; } catch (err) { alert(err.message); } });
}
function footer() { $('#site-footer').innerHTML = `<footer class="footer"><div class="footer-inner"><span>© ${new Date().getFullYear()} FindIt · Bringing lost things home.</span><span>Be kind. Meet safely. Verify ownership before handing items over.</span></div></footer>`; }
function itemCard(item, showOwner = false) {
  const icon = ({'Electronics':'📱','Bags & Wallets':'🎒','Keys':'🔑','Clothing':'🧥','Jewelry':'💍','Documents':'📄','Pets':'🐾','Other':'📦'})[item.category] || '📦';
  const photo = item.image_url ? `<img src="${esc(item.image_url)}" alt="${esc(item.title)}" loading="lazy" onerror="this.parentElement.innerHTML='📦'">` : icon;
  return `<article class="item-card"><div class="item-photo">${photo}</div><div class="item-content"><div class="badges"><span class="badge ${item.report_type}">${item.report_type === 'lost' ? 'Lost item' : 'Found item'}</span><span class="badge status">${esc(item.category)}</span></div><h3>${esc(item.title)}</h3><p class="item-desc">${esc(item.description)}</p><div class="item-meta"><span>⌖ ${esc(item.location)}</span><span>◷ ${dateLabel(item.item_date)}</span>${showOwner ? `<span>◉ Reported by ${esc(item.reporter_name)}</span>` : ''}</div><div class="item-bottom"><a class="text-link" href="mailto:${encodeURIComponent(item.contact_email)}?subject=${encodeURIComponent(`FindIt: ${item.title}`)}">Contact reporter →</a><span>${esc(item.status)}</span></div></div></article>`;
}
async function loadHome() {
  try {
    const { items } = await api('/api/items');
    const recent = items.slice(0, 3);
    $('#recentItems').innerHTML = recent.length ? recent.map(i => itemCard(i)).join('') : `<div class="empty-state"><div class="empty-icon">🔎</div><h3>Nothing posted yet</h3><p>Be the first to share a lost or found item with your community.</p></div>`;
  } catch (err) { $('#recentItems').innerHTML = `<p class="flash error">${esc(err.message)}</p>`; }
}
async function loadBrowse() {
  const list = $('#itemList');
  const params = new URLSearchParams();
  const q = $('#searchInput')?.value.trim(); const cat = $('#categoryFilter')?.value; const type = $('.chip.active')?.dataset.type || '';
  if (q) params.set('q', q); if (cat) params.set('category', cat); if (type) params.set('type', type);
  list.innerHTML = '<div class="loading">Finding reports…</div>';
  try {
    const { items } = await api(`/api/items?${params}`);
    list.innerHTML = items.length ? items.map(i => itemCard(i, true)).join('') : `<div class="empty-state"><div class="empty-icon">🧭</div><h3>No reports found</h3><p>Try a different search, or publish a report to help your community.</p><a class="btn btn-primary" style="margin-top:12px" href="/pages/report-lost">Create a report</a></div>`;
  } catch (err) { list.innerHTML = `<div class="flash error">${esc(err.message)}</div>`; }
}
function fillCategories() {
  $$('[data-categories]').forEach(select => { select.innerHTML = '<option value="">Choose a category</option>' + categories.map(c => `<option>${esc(c)}</option>`).join(''); });
}
function setupAuth() {
  const form = $('#authForm'); if (!form) return;
  form.addEventListener('submit', async event => {
    event.preventDefault(); showMessage('#formMessage', '');
    const body = Object.fromEntries(new FormData(form));
    const endpoint = form.dataset.mode === 'register' ? '/api/auth/register' : '/api/auth/login';
    try { await api(endpoint, { method: 'POST', body: JSON.stringify(body) }); location.href = '/pages/dashboard'; }
    catch (err) { showMessage('#formMessage', err.message); }
  });
}
function setupReport() {
  const form = $('#reportForm'); if (!form) return;
  fillCategories();
  const date = $('#itemDate'); if (date) { date.max = new Date().toISOString().slice(0,10); date.value = date.max; }
  form.addEventListener('submit', async event => {
    event.preventDefault(); showMessage('#formMessage', '');
    const body = Object.fromEntries(new FormData(form)); body.report_type = form.dataset.type;
    try { await api('/api/items', { method: 'POST', body: JSON.stringify(body) }); showMessage('#formMessage', 'Your report is live. Thanks for helping reunite someone with their belongings!', 'success'); form.reset(); if (date) date.value = date.max; }
    catch (err) { showMessage('#formMessage', err.message); if (err.message.startsWith('Please sign in')) location.href = '/pages/login'; }
  });
}
async function loadDashboard() {
  const out = $('#dashboardContent');
  try {
    const [{ items }, { matches }] = await Promise.all([api('/api/items/mine'), api('/api/matches')]);
    const open = items.filter(i => i.status === 'open').length;
    out.innerHTML = `<div class="stat-grid"><div class="stat-card"><span>My reports</span><strong>${items.length}</strong></div><div class="stat-card"><span>Active reports</span><strong>${open}</strong></div><div class="stat-card"><span>Potential matches</span><strong>${matches.length}</strong></div><div class="stat-card"><span>Account</span><strong style="font-size:19px">Member</strong></div></div><section class="panel"><div class="panel-head"><h2>Your reports</h2><a class="btn btn-primary btn-sm" href="/pages/report-lost">+ New report</a></div>${items.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Item</th><th>Type</th><th>Location</th><th>Date</th><th>Status</th><th>Update</th></tr></thead><tbody>${items.map(i => `<tr><td><strong>${esc(i.title)}</strong><br><span class="hint">${esc(i.category)}</span></td><td>${esc(i.report_type)}</td><td>${esc(i.location)}</td><td>${dateLabel(i.item_date)}</td><td>${esc(i.status)}</td><td>${i.status !== 'closed' ? `<button class="btn btn-soft btn-sm" data-close-item="${i.id}">Mark resolved</button>` : '—'}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state"><div class="empty-icon">🗂️</div><h3>Your dashboard starts here</h3><p>You haven't made a report yet.</p><a class="btn btn-primary" href="/pages/report-lost">Report an item</a></div>`}</section><section class="panel"><div class="panel-head"><h2>Potential matches</h2><a class="text-link" href="/pages/matches">See all →</a></div><p style="color:var(--muted);margin:0">${matches.length ? `${matches.length} possible matches found based on category and date. Review them on your Matches page.` : 'No potential matches yet. We will show possible matches when similar reports appear.'}</p></section>`;
    $$('[data-close-item]').forEach(btn => btn.addEventListener('click', async () => { try { await api(`/api/items/${btn.dataset.closeItem}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'closed' }) }); loadDashboard(); } catch (e) { alert(e.message); } }));
  } catch (err) { out.innerHTML = `<div class="empty-state"><h3>Dashboard unavailable</h3><p>${esc(err.message)}</p><a href="/pages/login" class="btn btn-primary">Sign in</a></div>`; }
}
async function loadMatches() {
  const out = $('#matchesContent');
  try {
    const { matches } = await api('/api/matches');
    if (!matches.length) { out.innerHTML = `<div class="empty-state"><div class="empty-icon">🤝</div><h3>No potential matches just yet</h3><p>We compare open reports in the same category within a 90-day window.</p><a class="btn btn-soft" href="/pages/browse">Browse reports</a></div>`; return; }
    out.innerHTML = `<div class="match-list">${matches.map(m => `<article class="match-card"><div class="match-side"><small>Lost report</small><h3>${esc(m.lost_title)}</h3><p>${esc(m.lost_category)} · ${esc(m.lost_location)}</p><p>${dateLabel(m.lost_date)}</p></div><div class="match-connector">↔</div><div class="match-side"><small>Found report</small><h3>${esc(m.found_title)}</h3><p>${esc(m.found_category)} · ${esc(m.found_location)}</p><p>${dateLabel(m.found_date)}</p></div><div class="match-actions"><span class="match-score">${m.score >= 4 ? 'Strong' : 'Possible'} match · same category and close date</span>${m.match_status ? `<span class="badge found">${esc(m.match_status)}</span>` : `<button class="btn btn-primary btn-sm" data-match-lost="${m.lost_id}" data-match-found="${m.found_id}">This could be mine</button>`}</div><div class="match-actions" style="grid-column:1/-1;border-top:0;padding-top:0;justify-content:flex-start;color:var(--muted);font-size:12px">Description: ${esc(m.lost_description.slice(0,130))}${m.lost_description.length > 130 ? '…' : ''} · <a class="text-link" href="mailto:${encodeURIComponent(m.found_contact)}">Contact finder</a></div></article>`).join('')}</div>`;
    $$('[data-match-lost]').forEach(btn => btn.addEventListener('click', async () => { try { const result = await api('/api/matches', { method: 'POST', body: JSON.stringify({ lost_item_id: btn.dataset.matchLost, found_item_id: btn.dataset.matchFound }) }); alert(result.message); loadMatches(); } catch (e) { alert(e.message); } }));
  } catch (err) { out.innerHTML = `<div class="empty-state"><h3>Sign in to see matches</h3><p>${esc(err.message)}</p><a class="btn btn-primary" href="/pages/login">Sign in</a></div>`; }
}
async function loadAdmin() {
  const out = $('#adminContent');
  try {
    const data = await api('/api/admin/overview'); const s = data.stats;
    out.innerHTML = `<div class="stat-grid"><div class="stat-card"><span>Community members</span><strong>${s.total_users}</strong></div><div class="stat-card"><span>Total reports</span><strong>${s.total_items || 0}</strong></div><div class="stat-card"><span>Open reports</span><strong>${s.open_items || 0}</strong></div><div class="stat-card"><span>Match requests</span><strong>${s.total_matches}</strong></div></div><section class="panel"><div class="panel-head"><h2>All reports</h2></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Report</th><th>Type</th><th>Reporter</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead><tbody>${data.items.length ? data.items.map(i => `<tr><td>${esc(i.title)}<br><span class="hint">${esc(i.category)}</span></td><td>${esc(i.report_type)}</td><td>${esc(i.reporter_name)}</td><td>${esc(i.location)}</td><td><select data-admin-status="${i.id}"><option ${i.status==='open'?'selected':''}>open</option><option ${i.status==='matched'?'selected':''}>matched</option><option ${i.status==='closed'?'selected':''}>closed</option></select></td><td><button class="btn btn-danger btn-sm" data-delete-item="${i.id}">Delete</button></td></tr>`).join('') : '<tr><td colspan="6">No reports yet.</td></tr>'}</tbody></table></div></section><section class="panel"><div class="panel-head"><h2>Community members</h2></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Access</th></tr></thead><tbody>${data.users.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${dateLabel(u.created_at)}</td><td><select data-user-role="${u.id}" ${u.id === currentUser.id ? 'disabled title="You cannot change your own role"' : ''}><option value="user" ${u.role==='user'?'selected':''}>user</option><option value="admin" ${u.role==='admin'?'selected':''}>admin</option></select></td></tr>`).join('')}</tbody></table></div></section>`;
    $$('[data-admin-status]').forEach(sel => sel.addEventListener('change', async () => { try { await api(`/api/admin/items/${sel.dataset.adminStatus}/status`, { method: 'PATCH', body: JSON.stringify({ status: sel.value }) }); } catch (e) { alert(e.message); } }));
    $$('[data-delete-item]').forEach(btn => btn.addEventListener('click', async () => { if (!confirm('Permanently delete this report?')) return; try { await api(`/api/admin/items/${btn.dataset.deleteItem}`, { method: 'DELETE' }); loadAdmin(); } catch (e) { alert(e.message); } }));
    $$('[data-user-role]').forEach(sel => sel.addEventListener('change', async () => { try { await api(`/api/admin/users/${sel.dataset.userRole}/role`, { method: 'PATCH', body: JSON.stringify({ role: sel.value }) }); } catch (e) { alert(e.message); loadAdmin(); } }));
  } catch (err) { out.innerHTML = `<div class="empty-state"><div class="empty-icon">🔒</div><h3>Admin access required</h3><p>${esc(err.message)}</p><a href="/pages/login" class="btn btn-primary">Sign in</a></div>`; }
}
async function init() {
  try { const { user } = await api('/api/auth/me'); currentUser = user; } catch (_) { currentUser = null; }
  nav(); footer();
  if (document.body.dataset.page === 'home') loadHome();
  if (document.body.dataset.page === 'browse') {
    fillCategories(); $('#searchInput').addEventListener('input', () => { clearTimeout(window.findItSearchTimer); window.findItSearchTimer = setTimeout(loadBrowse, 250); });
    $('#categoryFilter').addEventListener('change', loadBrowse);
    $$('.chip').forEach(chip => chip.addEventListener('click', () => { $$('.chip').forEach(c => c.classList.remove('active')); chip.classList.add('active'); loadBrowse(); })); loadBrowse();
  }
  setupAuth(); setupReport();
  if (document.body.dataset.page === 'dashboard') { if (!currentUser) location.href = '/pages/login'; else loadDashboard(); }
  if (document.body.dataset.page === 'matches') { if (!currentUser) location.href = '/pages/login'; else loadMatches(); }
  if (document.body.dataset.page === 'admin') { if (!currentUser) location.href = '/pages/login'; else loadAdmin(); }
}
document.addEventListener('DOMContentLoaded', init);