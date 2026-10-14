-- Signed document records. The PDF itself is never stored: only its
-- metadata, the issuer snapshot taken at signing time and the SHA-512
-- digest of the final stamped file.
CREATE TABLE documents (
  id                  TEXT PRIMARY KEY,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'issued', 'revoked')),
  title               TEXT NOT NULL,
  file_name           TEXT NOT NULL,
  file_size           INTEGER NOT NULL DEFAULT 0,
  page_count          INTEGER NOT NULL DEFAULT 0,
  sha512              TEXT,
  issuer_organization TEXT NOT NULL,
  issuer_signatory    TEXT NOT NULL,
  issuer_role         TEXT NOT NULL DEFAULT '',
  issuer_url          TEXT NOT NULL DEFAULT '',
  stamp_page          INTEGER,
  stamp_x             REAL,
  stamp_y             REAL,
  stamp_size_mm       REAL,
  created_at          TEXT NOT NULL,
  issued_at           TEXT,
  revoked_at          TEXT,
  revocation_reason   TEXT
);

CREATE UNIQUE INDEX documents_sha512 ON documents (sha512) WHERE sha512 IS NOT NULL;
CREATE INDEX documents_created_at ON documents (created_at DESC, id DESC);
CREATE INDEX documents_status ON documents (status);

-- The single issuer profile shown on verification pages and snapshotted
-- onto each document when it is created.
CREATE TABLE issuer (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  organization TEXT NOT NULL,
  signatory    TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT '',
  url          TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL
);

-- Owner sessions. Only a SHA-256 digest of the cookie token is stored.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX sessions_expires_at ON sessions (expires_at);

-- Failed sign-in attempts, used to rate-limit password guessing per client.
CREATE TABLE login_attempts (
  client       TEXT NOT NULL,
  attempted_at TEXT NOT NULL
);

CREATE INDEX login_attempts_client ON login_attempts (client, attempted_at);
