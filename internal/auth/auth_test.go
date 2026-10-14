package auth

import (
	"net/http/httptest"
	"testing"
	"time"
)

func TestCheckPassword(t *testing.T) {
	if !CheckPassword("correct horse battery", "correct horse battery") {
		t.Error("matching password rejected")
	}
	for _, attempt := range []string{"", "correct horse", "correct horse battery "} {
		if CheckPassword("correct horse battery", attempt) {
			t.Errorf("attempt %q accepted", attempt)
		}
	}
	if CheckPassword("", "") {
		t.Error("empty configured password accepted")
	}
}

func TestTokens(t *testing.T) {
	a, ha := NewToken()
	b, _ := NewToken()
	if a == b || len(a) != 43 {
		t.Fatalf("tokens %q %q", a, b)
	}
	if HashToken(a) != ha || ha == a {
		t.Fatal("digest does not match token")
	}
}

func TestCookieRoundTrip(t *testing.T) {
	c := SessionCookie("tok", time.Now().Add(SessionTTL))
	if !c.Secure || !c.HttpOnly || c.Path != "/" {
		t.Fatalf("cookie flags %+v", c)
	}
	req := httptest.NewRequest("GET", "/", nil)
	req.AddCookie(c)
	if TokenFrom(req) != "tok" {
		t.Fatal("token not read back")
	}
	if TokenFrom(httptest.NewRequest("GET", "/", nil)) != "" {
		t.Fatal("token from empty request")
	}
}
