require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'findit_db',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: 'findit.sid',
  secret: process.env.SESSION_SECRET || 'development-only-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(express.static(path.join(__dirname, 'public')));

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const safeUser = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role });
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Please sign in to continue.' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  next();
}
function text(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
const itemFields = `i.id, i.user_id, i.report_type, i.title, i.category, i.description, i.location,
  i.item_date, i.contact_name, i.contact_email, i.image_url, i.status, i.created_at,
  u.name AS reporter_name`;

app.get('/api/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
}));

app.get('/api/auth/me', (req, res) => res.json({ user: req.session.user || null }));
app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const name = text(req.body.name, 100);
  const email = text(req.body.email, 190).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (name.length < 2 || !validEmail(email) || password.length < 8 || password.length > 200) {
    return res.status(400).json({ error: 'Enter your name, a valid email, and a password of at least 8 characters.' });
  }
  const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) return res.status(409).json({ error: 'An account with that email already exists.' });
  const hash = await bcrypt.hash(password, 12);
  const [result] = await pool.execute('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', [name, email, hash]);
  const user = { id: result.insertId, name, email, role: 'user' };
  req.session.user = user;
  res.status(201).json({ user });
}));
app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const email = text(req.body.email, 190).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const [rows] = await pool.execute('SELECT id, name, email, password_hash, role FROM users WHERE email = ?', [email]);
  if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  const user = safeUser(rows[0]);
  req.session.user = user;
  res.json({ user });
}));
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Could not sign out.' });
    res.clearCookie('findit.sid', { httpOnly: true, sameSite: 'lax' });
    res.json({ ok: true });
  });
});

app.get('/api/items', asyncRoute(async (req, res) => {
  const filters = [];
  const params = [];
  const type = ['lost', 'found'].includes(req.query.type) ? req.query.type : '';
  if (type) { filters.push('i.report_type = ?'); params.push(type); }
  const category = text(req.query.category, 60);
  if (category) { filters.push('i.category = ?'); params.push(category); }
  const q = text(req.query.q, 100);
  if (q) {
    filters.push('(i.title LIKE ? OR i.description LIKE ? OR i.location LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  filters.push("i.status = 'open'");
  const [rows] = await pool.execute(
    `SELECT ${itemFields} FROM items i JOIN users u ON u.id = i.user_id WHERE ${filters.join(' AND ')} ORDER BY i.created_at DESC LIMIT 100`, params
  );
  res.json({ items: rows });
}));

app.post('/api/items', requireAuth, asyncRoute(async (req, res) => {
  const reportType = req.body.report_type;
  const title = text(req.body.title, 150);
  const category = text(req.body.category, 60);
  const description = text(req.body.description, 5000);
  const location = text(req.body.location, 180);
  const itemDate = text(req.body.item_date, 10);
  const contactName = text(req.body.contact_name, 100);
  const contactEmail = text(req.body.contact_email, 190).toLowerCase();
  const imageUrl = text(req.body.image_url, 2048) || null;
  if (!['lost', 'found'].includes(reportType) || title.length < 3 || !category || description.length < 10 || !location || !/^\d{4}-\d{2}-\d{2}$/.test(itemDate) || !contactName || !validEmail(contactEmail)) {
    return res.status(400).json({ error: 'Complete all required fields with valid details. Description must be at least 10 characters.' });
  }
  if (imageUrl && !/^https?:\/\//i.test(imageUrl)) return res.status(400).json({ error: 'Image link must start with http:// or https://.' });
  const [result] = await pool.execute(
    `INSERT INTO items (user_id, report_type, title, category, description, location, item_date, contact_name, contact_email, image_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.session.user.id, reportType, title, category, description, location, itemDate, contactName, contactEmail, imageUrl]
  );
  res.status(201).json({ id: result.insertId, message: 'Your report has been published.' });
}));

app.get('/api/items/mine', requireAuth, asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT ${itemFields} FROM items i JOIN users u ON u.id = i.user_id WHERE i.user_id = ? ORDER BY i.created_at DESC`, [req.session.user.id]
  );
  res.json({ items: rows });
}));
app.patch('/api/items/:id/status', requireAuth, asyncRoute(async (req, res) => {
  const status = req.body.status;
  if (!['open', 'matched', 'closed'].includes(status)) return res.status(400).json({ error: 'Invalid item status.' });
  const [result] = await pool.execute('UPDATE items SET status = ? WHERE id = ? AND user_id = ?', [status, req.params.id, req.session.user.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Report not found or not yours.' });
  res.json({ ok: true });
}));

app.get('/api/matches', requireAuth, asyncRoute(async (req, res) => {
  const userId = req.session.user.id;
  const [rows] = await pool.execute(
    `SELECT lost.id AS lost_id, lost.title AS lost_title, lost.category AS lost_category, lost.location AS lost_location,
       lost.item_date AS lost_date, lost.description AS lost_description, lost.contact_email AS lost_contact,
       found.id AS found_id, found.title AS found_title, found.category AS found_category, found.location AS found_location,
       found.item_date AS found_date, found.description AS found_description, found.contact_email AS found_contact,
       CASE WHEN LOWER(lost.category) = LOWER(found.category) THEN 2 ELSE 0 END +
       CASE WHEN LOWER(lost.location) = LOWER(found.location) THEN 2
            WHEN LOWER(lost.location) LIKE CONCAT('%', LOWER(found.location), '%') OR LOWER(found.location) LIKE CONCAT('%', LOWER(lost.location), '%') THEN 1 ELSE 0 END AS score
     FROM items lost
     JOIN items found ON found.report_type = 'found' AND found.status = 'open' AND lost.status = 'open'
       AND found.user_id <> lost.user_id
       AND LOWER(lost.category) = LOWER(found.category)
       AND DATEDIFF(lost.item_date, found.item_date) BETWEEN -90 AND 90
     WHERE lost.report_type = 'lost' AND lost.user_id = ?
     UNION
     SELECT lost.id AS lost_id, lost.title AS lost_title, lost.category AS lost_category, lost.location AS lost_location,
       lost.item_date AS lost_date, lost.description AS lost_description, lost.contact_email AS lost_contact,
       found.id AS found_id, found.title AS found_title, found.category AS found_category, found.location AS found_location,
       found.item_date AS found_date, found.description AS found_description, found.contact_email AS found_contact,
       CASE WHEN LOWER(lost.category) = LOWER(found.category) THEN 2 ELSE 0 END +
       CASE WHEN LOWER(lost.location) = LOWER(found.location) THEN 2
            WHEN LOWER(lost.location) LIKE CONCAT('%', LOWER(found.location), '%') OR LOWER(found.location) LIKE CONCAT('%', LOWER(lost.location), '%') THEN 1 ELSE 0 END AS score
     FROM items lost
     JOIN items found ON found.report_type = 'found' AND found.status = 'open' AND lost.status = 'open'
       AND found.user_id <> lost.user_id
       AND LOWER(lost.category) = LOWER(found.category)
       AND DATEDIFF(lost.item_date, found.item_date) BETWEEN -90 AND 90
     WHERE found.user_id = ?
     ORDER BY score DESC, lost_date DESC LIMIT 100`, [userId, userId]
  );
  const [submitted] = await pool.execute('SELECT lost_item_id, found_item_id, status FROM item_matches WHERE initiated_by = ?', [userId]);
  const states = new Map(submitted.map((m) => [`${m.lost_item_id}:${m.found_item_id}`, m.status]));
  res.json({ matches: rows.map((m) => ({ ...m, match_status: states.get(`${m.lost_id}:${m.found_id}`) || null })) });
}));
app.post('/api/matches', requireAuth, asyncRoute(async (req, res) => {
  const lostId = Number(req.body.lost_item_id);
  const foundId = Number(req.body.found_item_id);
  if (!Number.isInteger(lostId) || !Number.isInteger(foundId) || lostId === foundId) return res.status(400).json({ error: 'Invalid item pair.' });
  const [rows] = await pool.execute(
    `SELECT id, user_id, report_type, status FROM items WHERE id IN (?, ?)`, [lostId, foundId]
  );
  const lost = rows.find((r) => r.id === lostId);
  const found = rows.find((r) => r.id === foundId);
  if (!lost || !found || lost.report_type !== 'lost' || found.report_type !== 'found' || lost.status !== 'open' || found.status !== 'open' || (lost.user_id !== req.session.user.id && found.user_id !== req.session.user.id)) {
    return res.status(400).json({ error: 'You can only request a match involving one of your open reports.' });
  }
  await pool.execute(
    `INSERT INTO item_matches (lost_item_id, found_item_id, initiated_by) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE status = IF(status = 'dismissed', 'pending', status)`, [lostId, foundId, req.session.user.id]
  );
  res.status(201).json({ message: 'Match request recorded. Contact details are shown to help coordinate.' });
}));

app.get('/api/admin/overview', requireAuth, requireAdmin, asyncRoute(async (_req, res) => {
  const [[users]] = await pool.query('SELECT COUNT(*) AS total_users FROM users');
  const [[items]] = await pool.query('SELECT COUNT(*) AS total_items, SUM(status = \'open\') AS open_items, SUM(report_type = \'lost\') AS lost_reports, SUM(report_type = \'found\') AS found_reports FROM items');
  const [[matches]] = await pool.query('SELECT COUNT(*) AS total_matches FROM item_matches');
  const [recent] = await pool.query(`SELECT ${itemFields}, i.created_at FROM items i JOIN users u ON u.id = i.user_id ORDER BY i.created_at DESC LIMIT 50`);
  const [people] = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 100');
  res.json({ stats: { ...users, ...items, ...matches }, items: recent, users: people });
}));
app.patch('/api/admin/items/:id/status', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const status = req.body.status;
  if (!['open', 'matched', 'closed'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const [result] = await pool.execute('UPDATE items SET status = ? WHERE id = ?', [status, req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Report not found.' });
  res.json({ ok: true });
}));
app.delete('/api/admin/items/:id', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const [result] = await pool.execute('DELETE FROM items WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Report not found.' });
  res.json({ ok: true });
}));
app.patch('/api/admin/users/:id/role', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const role = req.body.role;
  if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  if (Number(req.params.id) === Number(req.session.user.id) && role !== 'admin') return res.status(400).json({ error: 'You cannot remove your own admin access.' });
  const [result] = await pool.execute('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'User not found.' });
  res.json({ ok: true });
}));

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/pages/:page', (req, res, next) => {
  const allowed = ['login', 'register', 'report-lost', 'report-found', 'browse', 'matches', 'dashboard', 'admin'];
  if (!allowed.includes(req.params.page)) return next();
  res.sendFile(path.join(__dirname, 'public', `${req.params.page}.html`));
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That record already exists.' });
  res.status(500).json({ error: 'Something went wrong. Check the server log for details.' });
});

app.listen(PORT, async () => {
  console.log(`FindIt is running at http://localhost:${PORT}`);
  try { await pool.query('SELECT 1'); console.log('MySQL connection ready.'); }
  catch (error) { console.error(`MySQL is not ready: ${error.message}`); }
});