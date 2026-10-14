package store

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	_ "modernc.org/sqlite"

	"github.com/fzn0x/verisign/internal/document"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })
	schema, err := os.ReadFile("../../migrations/0001_initial.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(string(schema)); err != nil {
		t.Fatal(err)
	}
	return New(db)
}

var (
	ctx    = context.Background()
	t0     = time.Date(2026, 10, 14, 9, 30, 0, 0, time.UTC)
	issuer = document.Issuer{Organization: "Midori Research", Signatory: "A. Signatory", Role: "Editor", URL: "https://midoriresearch.com"}
)

func digest(c byte) string { return strings.Repeat(string(c), 128) }

func createPending(t *testing.T, s *Store, id string, at time.Time) {
	t.Helper()
	err := s.CreateDocument(ctx, &document.Document{
		ID: id, Title: "Letter " + id, FileName: id + ".pdf", PageCount: 2, Issuer: issuer, CreatedAt: at,
	})
	if err != nil {
		t.Fatal(err)
	}
}

func finalization(c byte) document.Finalization {
	return document.Finalization{SHA512: digest(c), FileSize: 2048, Stamp: document.Stamp{Page: 1, X: 0.7, Y: 0.8, SizeMM: 22}}
}

func TestDocumentLifecycle(t *testing.T) {
	s := newTestStore(t)
	createPending(t, s, "AAAAAAAAAAAA", t0)

	d, err := s.GetDocument(ctx, "AAAAAAAAAAAA")
	if err != nil {
		t.Fatal(err)
	}
	if d.Status != document.StatusPending || d.IssuedAt != nil || d.Stamp != nil || d.Issuer != issuer {
		t.Fatalf("pending document = %+v", d)
	}

	if err := s.FinalizeDocument(ctx, d.ID, finalization('a'), t0.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	if err := s.FinalizeDocument(ctx, d.ID, finalization('b'), t0); !errors.Is(err, ErrConflict) {
		t.Fatalf("second finalize error = %v; want ErrConflict", err)
	}

	d, err = s.FindBySHA512(ctx, digest('a'))
	if err != nil {
		t.Fatal(err)
	}
	if d.Status != document.StatusIssued || d.IssuedAt == nil || !d.IssuedAt.Equal(t0.Add(time.Minute)) || d.Stamp.SizeMM != 22 {
		t.Fatalf("issued document = %+v", d)
	}

	if err := s.RevokeDocument(ctx, d.ID, "Superseded", t0.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if err := s.RevokeDocument(ctx, d.ID, "again", t0); !errors.Is(err, ErrConflict) {
		t.Fatalf("second revoke error = %v; want ErrConflict", err)
	}
	d, _ = s.GetDocument(ctx, d.ID)
	if d.Status != document.StatusRevoked || d.RevocationReason != "Superseded" || d.RevokedAt == nil {
		t.Fatalf("revoked document = %+v", d)
	}
	if err := s.DeletePending(ctx, d.ID); !errors.Is(err, ErrConflict) {
		t.Fatalf("deleting an issued document error = %v; want ErrConflict", err)
	}
	if _, err := s.GetDocument(ctx, "ZZZZZZZZZZZZ"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing document error = %v", err)
	}
	if err := s.RevokeDocument(ctx, "ZZZZZZZZZZZZ", "x", t0); !errors.Is(err, ErrNotFound) {
		t.Fatalf("revoking a missing document error = %v", err)
	}
}

func TestFinalizeRejectsDuplicateDigest(t *testing.T) {
	s := newTestStore(t)
	createPending(t, s, "AAAAAAAAAAAA", t0)
	createPending(t, s, "BBBBBBBBBBBB", t0)
	if err := s.FinalizeDocument(ctx, "AAAAAAAAAAAA", finalization('a'), t0); err != nil {
		t.Fatal(err)
	}
	if err := s.FinalizeDocument(ctx, "BBBBBBBBBBBB", finalization('a'), t0); !errors.Is(err, ErrDuplicateDigest) {
		t.Fatalf("duplicate digest error = %v", err)
	}
}

func TestListDocuments(t *testing.T) {
	s := newTestStore(t)
	ids := []string{"AAAAAAAAAAAA", "BBBBBBBBBBBB", "CCCCCCCCCCCC", "DDDDDDDDDDDD"}
	for i, id := range ids {
		createPending(t, s, id, t0.Add(time.Duration(i)*time.Minute))
	}
	if err := s.FinalizeDocument(ctx, "BBBBBBBBBBBB", finalization('b'), t0); err != nil {
		t.Fatal(err)
	}

	all, err := s.ListDocuments(ctx, ListQuery{Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 4 || all[0].ID != "DDDDDDDDDDDD" {
		t.Fatalf("newest first: got %d, first %s", len(all), all[0].ID)
	}

	page, _ := s.ListDocuments(ctx, ListQuery{Limit: 2, Before: "CCCCCCCCCCCC"})
	if len(page) != 2 || page[0].ID != "BBBBBBBBBBBB" || page[1].ID != "AAAAAAAAAAAA" {
		t.Fatalf("cursor page = %v", page)
	}

	issued, _ := s.ListDocuments(ctx, ListQuery{Limit: 10, Status: document.StatusIssued})
	if len(issued) != 1 || issued[0].ID != "BBBBBBBBBBBB" {
		t.Fatalf("status filter = %v", issued)
	}

	found, _ := s.ListDocuments(ctx, ListQuery{Limit: 10, Search: "letter cccc"})
	if len(found) != 1 {
		t.Fatalf("search = %v", found)
	}
	none, _ := s.ListDocuments(ctx, ListQuery{Limit: 10, Search: "100%_"})
	if len(none) != 0 {
		t.Fatalf("LIKE wildcards not escaped: %v", none)
	}

	counts, err := s.CountByStatus(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if counts[document.StatusPending] != 3 || counts[document.StatusIssued] != 1 || counts[document.StatusRevoked] != 0 {
		t.Fatalf("counts = %v", counts)
	}

	if err := s.PurgeStalePending(ctx, t0.Add(90*time.Second)); err != nil {
		t.Fatal(err)
	}
	counts, _ = s.CountByStatus(ctx)
	if counts[document.StatusPending] != 2 {
		t.Fatalf("after purge counts = %v", counts)
	}
}

func TestIssuer(t *testing.T) {
	s := newTestStore(t)
	if _, err := s.GetIssuer(ctx); !errors.Is(err, ErrNotFound) {
		t.Fatalf("empty issuer error = %v", err)
	}
	if err := s.PutIssuer(ctx, issuer, t0); err != nil {
		t.Fatal(err)
	}
	updated := issuer
	updated.Role = "Director"
	if err := s.PutIssuer(ctx, updated, t0); err != nil {
		t.Fatal(err)
	}
	got, err := s.GetIssuer(ctx)
	if err != nil || *got != updated {
		t.Fatalf("issuer = %+v, %v", got, err)
	}
}

func TestSessionsAndLoginAttempts(t *testing.T) {
	s := newTestStore(t)
	if err := s.CreateSession(ctx, "h1", t0, t0.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if ok, _ := s.SessionValid(ctx, "h1", t0.Add(30*time.Minute)); !ok {
		t.Fatal("fresh session invalid")
	}
	if ok, _ := s.SessionValid(ctx, "h1", t0.Add(2*time.Hour)); ok {
		t.Fatal("expired session valid")
	}
	if err := s.DeleteSession(ctx, "h1"); err != nil {
		t.Fatal(err)
	}
	if ok, _ := s.SessionValid(ctx, "h1", t0); ok {
		t.Fatal("deleted session valid")
	}

	for i := range 3 {
		if err := s.RecordFailedLogin(ctx, "1.2.3.4", t0.Add(time.Duration(i)*time.Minute)); err != nil {
			t.Fatal(err)
		}
	}
	if n, _ := s.CountFailedLogins(ctx, "1.2.3.4", t0.Add(time.Minute)); n != 2 {
		t.Fatalf("failed logins in window = %d", n)
	}
	if err := s.PurgeExpired(ctx, t0, t0.Add(90*time.Second)); err != nil {
		t.Fatal(err)
	}
	if n, _ := s.CountFailedLogins(ctx, "1.2.3.4", t0); n != 1 {
		t.Fatalf("after purge = %d", n)
	}
	if err := s.ClearFailedLogins(ctx, "1.2.3.4"); err != nil {
		t.Fatal(err)
	}
	if n, _ := s.CountFailedLogins(ctx, "1.2.3.4", t0); n != 0 {
		t.Fatalf("after clear = %d", n)
	}
}
