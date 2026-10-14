// Package api is the JSON HTTP API served by the Worker under /api/.
package api

import (
	"context"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/fzn0x/verisign/internal/config"
	"github.com/fzn0x/verisign/internal/document"
	"github.com/fzn0x/verisign/internal/store"
)

// Store is the persistence the API needs; *store.Store implements it.
type Store interface {
	CreateDocument(ctx context.Context, d *document.Document) error
	GetDocument(ctx context.Context, id string) (*document.Document, error)
	FindBySHA512(ctx context.Context, digest string) (*document.Document, error)
	FinalizeDocument(ctx context.Context, id string, f document.Finalization, at time.Time) error
	RevokeDocument(ctx context.Context, id, reason string, at time.Time) error
	DeletePending(ctx context.Context, id string) error
	PurgeStalePending(ctx context.Context, before time.Time) error
	ListDocuments(ctx context.Context, q store.ListQuery) ([]document.Document, error)
	CountByStatus(ctx context.Context) (map[document.Status]int, error)
	GetIssuer(ctx context.Context) (*document.Issuer, error)
	PutIssuer(ctx context.Context, i document.Issuer, at time.Time) error
	CreateSession(ctx context.Context, tokenHash string, created, expires time.Time) error
	SessionValid(ctx context.Context, tokenHash string, now time.Time) (bool, error)
	DeleteSession(ctx context.Context, tokenHash string) error
	PurgeExpired(ctx context.Context, now, attemptsBefore time.Time) error
	RecordFailedLogin(ctx context.Context, client string, at time.Time) error
	CountFailedLogins(ctx context.Context, client string, since time.Time) (int, error)
	ClearFailedLogins(ctx context.Context, client string) error
}

// pendingTTL is how long an unfinished signing may hold a reserved ID.
const pendingTTL = 24 * time.Hour

// Server routes and serves the API.
type Server struct {
	store  Store
	config func() config.Config
	now    func() time.Time
	mux    *http.ServeMux
}

// New builds the API. cfg is called per request because Worker bindings
// are only readable inside a request context.
func New(st Store, cfg func() config.Config) *Server {
	s := &Server{store: st, config: cfg, now: time.Now, mux: http.NewServeMux()}

	s.mux.HandleFunc("GET /api/issuer", s.publicIssuer)
	s.mux.HandleFunc("GET /api/documents/{id}", s.getDocument)
	s.mux.HandleFunc("POST /api/documents/{id}/verify", s.verifyDocument)
	s.mux.HandleFunc("POST /api/lookup", s.lookupDigest)

	s.mux.HandleFunc("GET /api/auth/session", s.session)
	s.mux.HandleFunc("POST /api/auth/login", s.login)
	s.mux.HandleFunc("POST /api/auth/logout", s.logout)

	s.mux.Handle("GET /api/studio/documents", s.owner(s.listDocuments))
	s.mux.Handle("POST /api/studio/documents", s.owner(s.createDocument))
	s.mux.Handle("GET /api/studio/documents/{id}", s.owner(s.studioDocument))
	s.mux.Handle("POST /api/studio/documents/{id}/finalize", s.owner(s.finalizeDocument))
	s.mux.Handle("POST /api/studio/documents/{id}/revoke", s.owner(s.revokeDocument))
	s.mux.Handle("DELETE /api/studio/documents/{id}", s.owner(s.discardDocument))
	s.mux.Handle("GET /api/studio/issuer", s.owner(s.getIssuer))
	s.mux.Handle("PUT /api/studio/issuer", s.owner(s.putIssuer))

	s.mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "not_found", "No such endpoint.")
	})
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if v := recover(); v != nil {
			log.Printf("api: panic: %v", v)
			writeError(w, http.StatusInternalServerError, "internal", "Something went wrong on the server.")
		}
	}()

	h := w.Header()
	h.Set("Cache-Control", "no-store")
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Referrer-Policy", "strict-origin-when-cross-origin")

	cfg := s.config()
	if !s.allowedHost(cfg, r) {
		writeError(w, http.StatusMisdirectedRequest, "wrong_host", "This app is only served from its own domain.")
		return
	}
	if !safeMethod(r.Method) && !sameOrigin(r) {
		writeError(w, http.StatusForbidden, "cross_origin", "Cross-site requests are not allowed.")
		return
	}
	s.mux.ServeHTTP(w, r)
}

// requestHost returns the host the client addressed.
func requestHost(r *http.Request) string {
	if r.Host != "" {
		return r.Host
	}
	return r.URL.Host
}

// allowedHost rejects requests that reach the Worker under any host other
// than the configured public origin (for example a workers.dev URL).
// Loopback hosts stay open for local development.
func (s *Server) allowedHost(cfg config.Config, r *http.Request) bool {
	want := cfg.PublicHost()
	if want == "" {
		return true
	}
	host := requestHost(r)
	if strings.EqualFold(host, want) {
		return true
	}
	name := host
	if h, _, err := net.SplitHostPort(host); err == nil {
		name = h
	}
	return name == "localhost" || name == "127.0.0.1" || name == "::1"
}

func safeMethod(m string) bool {
	return m == http.MethodGet || m == http.MethodHead || m == http.MethodOptions
}

// sameOrigin is the CSRF guard for state-changing requests: a browser
// always sends Origin or Sec-Fetch-Site on these, and both must point at
// this host. JSON bodies are also required, which forms cannot send.
func sameOrigin(r *http.Request) bool {
	if origin := r.Header.Get("Origin"); origin != "" {
		u, err := url.Parse(origin)
		return err == nil && strings.EqualFold(u.Host, requestHost(r))
	}
	switch r.Header.Get("Sec-Fetch-Site") {
	case "", "same-origin", "none":
		return true
	}
	return false
}

// owner wraps handlers that require a signed-in owner.
func (s *Server) owner(next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ok, err := s.signedIn(r)
		if err != nil {
			writeInternal(w, "session", err)
			return
		}
		if !ok {
			writeError(w, http.StatusUnauthorized, "unauthenticated", "Sign in to continue.")
			return
		}
		next(w, r)
	})
}
