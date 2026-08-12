-- Users, roles and an audit trail for the record explorer.
--
-- IMPORTANT: this is AUTHORISATION, not authentication.
--
-- Authentication — proving you are who you say — is done by Cloudflare Access
-- before a request ever reaches the Worker. Access handles the login screen, the
-- one-time PIN or identity provider, session cookies, and expiry. Nothing in
-- this database stores a password, and nothing should ever be added that does.
--
-- What this table decides is what an already-identified person is allowed to do.
-- Access says "this is margaret@example.com". This table says whether Margaret
-- can see records, and whether she can add other people.
--
-- Why split it this way: an admin who wants to add a volunteer should not have
-- to log into the Cloudflare dashboard. They add an email here, and the app lets
-- that person in on their next visit. Cloudflare's own user list stays as the
-- outer gate; this is the inner one.

CREATE TABLE IF NOT EXISTS users (
  email        TEXT PRIMARY KEY,          -- lowercased; matches the Access identity header
  display_name TEXT,
  role         TEXT NOT NULL DEFAULT 'volunteer'
                 CHECK (role IN ('admin', 'volunteer', 'viewer')),
  -- 'viewer'    can search and read records
  -- 'volunteer' can also see who captured what, and flag problems
  -- 'admin'     can also add and remove users
  status       TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'suspended')),
  added_by     TEXT,                      -- email of the admin who added them
  added_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT,
  note         TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role) WHERE status = 'active';

-- Who did what. A museum needs to be able to answer "who removed this person's
-- access" and "who was looking at the collection" — not out of suspicion, but
-- because committees change and institutional memory doesn't survive otherwise.
CREATE TABLE IF NOT EXISTS access_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  actor    TEXT NOT NULL,                 -- email from the Access header
  action   TEXT NOT NULL,                 -- 'sign_in' | 'add_user' | 'remove_user' | 'change_role' | 'denied'
  target   TEXT,                          -- the user or record acted upon
  detail   TEXT,
  at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_access_log_at ON access_log(at);

-- The bootstrap problem: with an empty users table nobody is an admin, so nobody
-- can add the first admin. Rather than leave a back door open in code, the first
-- person to sign in is promoted to admin automatically — but ONLY while the
-- table is empty. Every later user must be added deliberately.
--
-- Make sure you are the first person to open the app.
CREATE VIEW IF NOT EXISTS user_summary AS
SELECT
  (SELECT COUNT(*) FROM users)                                    AS total,
  (SELECT COUNT(*) FROM users WHERE role = 'admin'
                                AND status = 'active')            AS admins,
  (SELECT COUNT(*) FROM users WHERE status = 'active')            AS active;
