// Package store persists documents, the issuer profile and owner sessions
// in SQLite through database/sql. In production the driver is Cloudflare
// D1; tests run the same queries against a local SQLite database.
//
// D1 has no interactive transactions, so every write here is a single
// statement whose WHERE clause carries its own precondition.
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/fzn0x/verisign/internal/document"
)

var (
	// ErrNotFound is returned when a record does not exist.
	ErrNotFound = errors.New("store: not found")
	// ErrConflict is returned when a record is not in the state an update requires.
	ErrConflict = errors.New("store: conflicting state")
	// ErrDuplicateDigest is returned when a digest is already recorded on another document.
	ErrDuplicateDigest = errors.New("store: digest already recorded")
)

// timeFormat is fixed-width so stored timestamps sort lexically.
const timeFormat = "2006-01-02T15:04:05.000Z"

func formatTime(t time.Time) string { return t.UTC().Format(timeFormat) }

func parseTime(s string) (time.Time, error) { return time.Parse(timeFormat, s) }

// Store is the SQLite-backed repository.
type Store struct {
	db *sql.DB
}

// New wraps an open database.
func New(db *sql.DB) *Store { return &Store{db: db} }

const documentColumns = `id, status, title, file_name, file_size, page_count, sha512,
	issuer_organization, issuer_signatory, issuer_role, issuer_url,
	stamp_page, stamp_x, stamp_y, stamp_size_mm,
	created_at, issued_at, revoked_at, revocation_reason`

type rowScanner interface {
	Scan(dest ...any) error
}

func scanDocument(row rowScanner) (*document.Document, error) {
	var (
		d                           document.Document
		status                      string
		digest, issuedAt, revokedAt sql.NullString
		reason                      sql.NullString
		stampPage                   sql.NullInt64
		stampX, stampY, stampSize   sql.NullFloat64
		createdAt                   string
	)
	err := row.Scan(&d.ID, &status, &d.Title, &d.FileName, &d.FileSize, &d.PageCount, &digest,
		&d.Issuer.Organization, &d.Issuer.Signatory, &d.Issuer.Role, &d.Issuer.URL,
		&stampPage, &stampX, &stampY, &stampSize,
		&createdAt, &issuedAt, &revokedAt, &reason)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	d.Status = document.Status(status)
	d.SHA512 = digest.String
	d.RevocationReason = reason.String
	if stampPage.Valid {
		d.Stamp = &document.Stamp{
			Page:   int(stampPage.Int64),
			X:      stampX.Float64,
			Y:      stampY.Float64,
			SizeMM: stampSize.Float64,
		}
	}
	if d.CreatedAt, err = parseTime(createdAt); err != nil {
		return nil, fmt.Errorf("store: created_at: %w", err)
	}
	for _, p := range []struct {
		src sql.NullString
		dst **time.Time
	}{{issuedAt, &d.IssuedAt}, {revokedAt, &d.RevokedAt}} {
		if !p.src.Valid {
			continue
		}
		t, err := parseTime(p.src.String)
		if err != nil {
			return nil, fmt.Errorf("store: timestamp: %w", err)
		}
		*p.dst = &t
	}
	return &d, nil
}

// CreateDocument inserts a pending document.
func (s *Store) CreateDocument(ctx context.Context, d *document.Document) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO documents
		(id, status, title, file_name, file_size, page_count,
		 issuer_organization, issuer_signatory, issuer_role, issuer_url, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		d.ID, string(document.StatusPending), d.Title, d.FileName, d.FileSize, d.PageCount,
		d.Issuer.Organization, d.Issuer.Signatory, d.Issuer.Role, d.Issuer.URL,
		formatTime(d.CreatedAt))
	return err
}

// GetDocument loads a document by canonical ID.
func (s *Store) GetDocument(ctx context.Context, id string) (*document.Document, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+documentColumns+` FROM documents WHERE id = ?`, id)
	return scanDocument(row)
}

// FindBySHA512 loads the completed document whose recorded digest matches.
func (s *Store) FindBySHA512(ctx context.Context, digest string) (*document.Document, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+documentColumns+` FROM documents WHERE sha512 = ?`, digest)
	return scanDocument(row)
}

// FinalizeDocument records the stamped file's digest and marks a pending
// document as issued.
func (s *Store) FinalizeDocument(ctx context.Context, id string, f document.Finalization, at time.Time) error {
	if other, err := s.FindBySHA512(ctx, f.SHA512); err == nil && other.ID != id {
		return ErrDuplicateDigest
	} else if err != nil && !errors.Is(err, ErrNotFound) {
		return err
	}
	res, err := s.db.ExecContext(ctx, `UPDATE documents
		SET status = 'issued', sha512 = ?, file_size = ?,
		    stamp_page = ?, stamp_x = ?, stamp_y = ?, stamp_size_mm = ?, issued_at = ?
		WHERE id = ? AND status = 'pending'`,
		f.SHA512, f.FileSize, f.Stamp.Page, f.Stamp.X, f.Stamp.Y, f.Stamp.SizeMM, formatTime(at), id)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return ErrDuplicateDigest
		}
		return err
	}
	return s.expectOne(ctx, res, id)
}

// RevokeDocument withdraws an issued document.
func (s *Store) RevokeDocument(ctx context.Context, id, reason string, at time.Time) error {
	res, err := s.db.ExecContext(ctx, `UPDATE documents
		SET status = 'revoked', revoked_at = ?, revocation_reason = ?
		WHERE id = ? AND status = 'issued'`, formatTime(at), reason, id)
	if err != nil {
		return err
	}
	return s.expectOne(ctx, res, id)
}

// DeletePending discards a document that was never completed.
func (s *Store) DeletePending(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM documents WHERE id = ? AND status = 'pending'`, id)
	if err != nil {
		return err
	}
	return s.expectOne(ctx, res, id)
}

// PurgeStalePending removes pending documents created before the cutoff.
func (s *Store) PurgeStalePending(ctx context.Context, before time.Time) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM documents WHERE status = 'pending' AND created_at < ?`, formatTime(before))
	return err
}

// expectOne turns a zero-row update into ErrNotFound or ErrConflict.
func (s *Store) expectOne(ctx context.Context, res sql.Result, id string) error {
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 1 {
		return nil
	}
	if _, err := s.GetDocument(ctx, id); err != nil {
		return err
	}
	return ErrConflict
}

// ListQuery filters and pages the owner's register.
type ListQuery struct {
	Status document.Status // empty for all
	Search string
	Limit  int
	// Before is the cursor: return documents created strictly before this
	// document's (created_at, id).
	Before string
}

// ListDocuments returns documents newest first.
func (s *Store) ListDocuments(ctx context.Context, q ListQuery) ([]document.Document, error) {
	var (
		where []string
		args  []any
	)
	if q.Status != "" {
		where = append(where, "status = ?")
		args = append(args, string(q.Status))
	}
	if term := strings.TrimSpace(q.Search); term != "" {
		like := "%" + escapeLike(term) + "%"
		where = append(where, `(title LIKE ? ESCAPE '\' OR file_name LIKE ? ESCAPE '\' OR id LIKE ? ESCAPE '\')`)
		args = append(args, like, like, like)
	}
	if q.Before != "" {
		where = append(where, `(created_at, id) < (SELECT created_at, id FROM documents WHERE id = ?)`)
		args = append(args, q.Before)
	}
	query := `SELECT ` + documentColumns + ` FROM documents`
	if len(where) > 0 {
		query += ` WHERE ` + strings.Join(where, " AND ")
	}
	query += ` ORDER BY created_at DESC, id DESC LIMIT ?`
	args = append(args, q.Limit)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	docs := []document.Document{}
	for rows.Next() {
		d, err := scanDocument(rows)
		if err != nil {
			return nil, err
		}
		docs = append(docs, *d)
	}
	return docs, rows.Err()
}

func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

// CountByStatus returns how many documents are in each state.
func (s *Store) CountByStatus(ctx context.Context) (map[document.Status]int, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT status, COUNT(*) FROM documents GROUP BY status`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	counts := map[document.Status]int{
		document.StatusPending: 0,
		document.StatusIssued:  0,
		document.StatusRevoked: 0,
	}
	for rows.Next() {
		var (
			status string
			n      int
		)
		if err := rows.Scan(&status, &n); err != nil {
			return nil, err
		}
		counts[document.Status(status)] = n
	}
	return counts, rows.Err()
}

// GetIssuer returns the stored issuer profile, or ErrNotFound when the
// owner has not saved one yet.
func (s *Store) GetIssuer(ctx context.Context) (*document.Issuer, error) {
	var i document.Issuer
	err := s.db.QueryRowContext(ctx, `SELECT organization, signatory, role, url FROM issuer WHERE id = 1`).
		Scan(&i.Organization, &i.Signatory, &i.Role, &i.URL)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &i, nil
}

// PutIssuer saves the issuer profile.
func (s *Store) PutIssuer(ctx context.Context, i document.Issuer, at time.Time) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO issuer (id, organization, signatory, role, url, updated_at)
		VALUES (1, ?, ?, ?, ?, ?)
		ON CONFLICT (id) DO UPDATE SET organization = excluded.organization,
		  signatory = excluded.signatory, role = excluded.role, url = excluded.url,
		  updated_at = excluded.updated_at`,
		i.Organization, i.Signatory, i.Role, i.URL, formatTime(at))
	return err
}

// CreateSession stores a session by token digest.
func (s *Store) CreateSession(ctx context.Context, tokenHash string, created, expires time.Time) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)`,
		tokenHash, formatTime(created), formatTime(expires))
	return err
}

// SessionValid reports whether a session exists and has not expired.
func (s *Store) SessionValid(ctx context.Context, tokenHash string, now time.Time) (bool, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sessions WHERE token_hash = ? AND expires_at > ?`,
		tokenHash, formatTime(now)).Scan(&n)
	return n == 1, err
}

// DeleteSession ends a session.
func (s *Store) DeleteSession(ctx context.Context, tokenHash string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE token_hash = ?`, tokenHash)
	return err
}

// PurgeExpired removes expired sessions and login attempts older than the cutoff.
func (s *Store) PurgeExpired(ctx context.Context, now, attemptsBefore time.Time) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at <= ?`, formatTime(now)); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `DELETE FROM login_attempts WHERE attempted_at < ?`, formatTime(attemptsBefore))
	return err
}

// RecordFailedLogin notes a failed sign-in from a client.
func (s *Store) RecordFailedLogin(ctx context.Context, client string, at time.Time) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO login_attempts (client, attempted_at) VALUES (?, ?)`, client, formatTime(at))
	return err
}

// CountFailedLogins counts a client's failed sign-ins since a time.
func (s *Store) CountFailedLogins(ctx context.Context, client string, since time.Time) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM login_attempts WHERE client = ? AND attempted_at >= ?`,
		client, formatTime(since)).Scan(&n)
	return n, err
}

// ClearFailedLogins forgets a client's failed sign-ins after a success.
func (s *Store) ClearFailedLogins(ctx context.Context, client string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM login_attempts WHERE client = ?`, client)
	return err
}
