// Package auth implements the single-owner sign-in: a password checked
// against a Worker secret and opaque session tokens whose SHA-256 digests
// are stored server-side.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/sha512"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"time"
)

const (
	// CookieName uses the __Host- prefix so the browser only accepts it
	// from this exact host over HTTPS with Path=/.
	CookieName = "__Host-session"
	// SessionTTL is how long a sign-in lasts.
	SessionTTL = 7 * 24 * time.Hour
	// MaxFailedLogins within FailedLoginWindow locks a client out until
	// the oldest failure leaves the window.
	MaxFailedLogins   = 5
	FailedLoginWindow = 15 * time.Minute
)

// CheckPassword compares an attempt with the configured password in
// constant time. Both sides are hashed first so their lengths never leak.
func CheckPassword(configured, attempt string) bool {
	if configured == "" {
		return false
	}
	want := sha512.Sum512([]byte(configured))
	got := sha512.Sum512([]byte(attempt))
	return subtle.ConstantTimeCompare(want[:], got[:]) == 1
}

// NewToken returns a random session token and the digest to store.
func NewToken() (token, digest string) {
	var buf [32]byte
	if _, err := rand.Read(buf[:]); err != nil {
		panic("auth: crypto/rand failed: " + err.Error())
	}
	token = base64.RawURLEncoding.EncodeToString(buf[:])
	return token, HashToken(token)
}

// HashToken returns the stored digest of a session token.
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// SessionCookie carries a new session token.
func SessionCookie(token string, expires time.Time) *http.Cookie {
	return &http.Cookie{
		Name:     CookieName,
		Value:    token,
		Path:     "/",
		Expires:  expires,
		MaxAge:   int(SessionTTL.Seconds()),
		Secure:   true,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
	}
}

// ClearedCookie removes the session cookie.
func ClearedCookie() *http.Cookie {
	return &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		Secure:   true,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
	}
}

// TokenFrom extracts the session token from a request, or "".
func TokenFrom(r *http.Request) string {
	c, err := r.Cookie(CookieName)
	if err != nil {
		return ""
	}
	return c.Value
}
