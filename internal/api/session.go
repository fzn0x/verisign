package api

import (
	"net"
	"net/http"
	"strconv"

	"github.com/fzn0x/verisign/internal/auth"
)

func (s *Server) signedIn(r *http.Request) (bool, error) {
	token := auth.TokenFrom(r)
	if token == "" {
		return false, nil
	}
	return s.store.SessionValid(r.Context(), auth.HashToken(token), s.now())
}

// clientKey identifies a client for login rate limiting. Cloudflare sets
// CF-Connecting-IP on every request that reaches a Worker.
func clientKey(r *http.Request) string {
	if ip := r.Header.Get("CF-Connecting-IP"); ip != "" {
		return ip
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return "unknown"
}

type sessionResponse struct {
	Authenticated bool `json:"authenticated"`
	// SignInAvailable is false when no owner password is configured.
	SignInAvailable bool `json:"signInAvailable"`
}

func (s *Server) session(w http.ResponseWriter, r *http.Request) {
	ok, err := s.signedIn(r)
	if err != nil {
		writeInternal(w, "session", err)
		return
	}
	writeJSON(w, http.StatusOK, sessionResponse{Authenticated: ok, SignInAvailable: s.config().PasswordConfigured()})
}

type loginRequest struct {
	Password string `json:"password"`
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	cfg := s.config()
	if !cfg.PasswordConfigured() {
		writeError(w, http.StatusServiceUnavailable, "sign_in_unavailable",
			"Sign-in is disabled until an owner password of at least 12 characters is configured.")
		return
	}
	var req loginRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	ctx := r.Context()
	now := s.now()
	client := clientKey(r)

	failures, err := s.store.CountFailedLogins(ctx, client, now.Add(-auth.FailedLoginWindow))
	if err != nil {
		writeInternal(w, "count logins", err)
		return
	}
	if failures >= auth.MaxFailedLogins {
		w.Header().Set("Retry-After", strconv.Itoa(int(auth.FailedLoginWindow.Seconds())))
		writeError(w, http.StatusTooManyRequests, "rate_limited",
			"Too many attempts. Wait 15 minutes before trying again.")
		return
	}

	if !auth.CheckPassword(cfg.OwnerPassword, req.Password) {
		if err := s.store.RecordFailedLogin(ctx, client, now); err != nil {
			writeInternal(w, "record login", err)
			return
		}
		writeError(w, http.StatusUnauthorized, "wrong_password", "That password is not correct.")
		return
	}

	token, digest := auth.NewToken()
	expires := now.Add(auth.SessionTTL)
	if err := s.store.CreateSession(ctx, digest, now, expires); err != nil {
		writeInternal(w, "create session", err)
		return
	}
	if err := s.store.ClearFailedLogins(ctx, client); err != nil {
		writeInternal(w, "clear logins", err)
		return
	}
	if err := s.store.PurgeExpired(ctx, now, now.Add(-auth.FailedLoginWindow)); err != nil {
		writeInternal(w, "purge sessions", err)
		return
	}
	http.SetCookie(w, auth.SessionCookie(token, expires))
	writeJSON(w, http.StatusOK, sessionResponse{Authenticated: true, SignInAvailable: true})
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if token := auth.TokenFrom(r); token != "" {
		if err := s.store.DeleteSession(r.Context(), auth.HashToken(token)); err != nil {
			writeInternal(w, "delete session", err)
			return
		}
	}
	http.SetCookie(w, auth.ClearedCookie())
	writeJSON(w, http.StatusOK, sessionResponse{Authenticated: false, SignInAvailable: s.config().PasswordConfigured()})
}
