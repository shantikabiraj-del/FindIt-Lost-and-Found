# FindIt — Community Lost & Found

A ready-to-run starter project built with HTML, CSS, browser JavaScript, Node.js/Express, and MySQL. It includes a responsive home page, registration/login, lost/found report forms, searchable browse page, potential matches, member dashboard, and an admin console.

## Requirements

- Node.js 18 or newer
- MySQL 8 or compatible MySQL server
- npm

## Run locally

1. Create the database and tables. In a terminal, from this project folder, run:

   ```sh
   mysql -u root -p < schema.sql
   ```

   If your MySQL user is not `root`, replace it with your database user. Enter the MySQL password when prompted.

2. Create your local configuration file:

   ```sh
   cp .env.example .env
   ```

   Edit `.env` and set `DB_USER`, `DB_PASSWORD`, and a long random `SESSION_SECRET`. `DB_NAME` should remain `findit_db` unless you also change the database name in `schema.sql`.

3. Install packages and start the server:

   ```sh
   npm install
   npm start
   ```

4. Open `http://localhost:3000` in your browser. The API and site are served by the same Express server. Keep MySQL running while using the site.

For auto-restart while developing, use `npm run dev` (Node 18.11+).

## Pages

- Home: `/`
- Login: `/pages/login`
- Register: `/pages/register`
- Report lost: `/pages/report-lost`
- Report found: `/pages/report-found`
- Browse items: `/pages/browse`
- Matches: `/pages/matches`
- Dashboard: `/pages/dashboard`
- Admin: `/pages/admin`

Create a regular account through Register first. To grant that account admin access, connect to MySQL and run this, substituting the email used during registration:

```sql
USE findit_db;
UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
```

Then sign out and back in so the new role is added to your session. Admin users can moderate reports and change other users' roles.

## Backend/API map

- `GET /api/health` — database connection health check
- `GET /api/auth/me`, `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
- `GET /api/items` — browse with optional `q`, `type`, and `category` query parameters
- `POST /api/items` — create a lost/found report (signed in)
- `GET /api/items/mine`, `PATCH /api/items/:id/status` — member dashboard and report status
- `GET /api/matches`, `POST /api/matches` — potential matches and match requests (signed in)
- `GET /api/admin/overview`, `PATCH /api/admin/items/:id/status`, `DELETE /api/admin/items/:id`, `PATCH /api/admin/users/:id/role` — admin-only tools

## Project layout

```text
findit/
├── server.js          # Express routes, authentication, MySQL access
├── schema.sql         # Database and tables
├── .env.example       # Local configuration template (copy to .env)
├── package.json
└── public/
    ├── app.js         # Page rendering and API integration
    ├── style.css      # Responsive styling
    ├── index.html
    ├── login.html
    ├── register.html
    ├── report-lost.html
    ├── report-found.html
    ├── browse.html
    ├── matches.html
    ├── dashboard.html
    └── admin.html
```

## Notes before deploying publicly

This is an educational starter, not a hardened production deployment. The default Express in-memory session store is suitable only for local development; use a persistent session store in production, set a strong secret, serve behind HTTPS, configure secure cookies and rate limiting, and review privacy/moderation requirements. Reports accept an optional publicly accessible image URL; image file uploads are not implemented. Public reports expose the contact email so neighbors can reach the reporter.