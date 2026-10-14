package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	_ "modernc.org/sqlite"

	"github.com/fzn0x/verisign/internal/auth"
	"github.com/fzn0x/verisign/internal/config"
	"github.com/fzn0x/verisign/internal/document"
	"github.com/fzn0x/verisign/internal/store"
)

const (
	host     = "verisign.example.com"
	password = "a long owner password"
)

type harness struct {
	t      *testing.T
	srv    *Server
	cookie *http.Cookie
	now    time.Time
}

func newHarness(t *testing.T) *harness {
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
	cfg := config.Config{
		PublicOrigin:  "https://" + host,
		OwnerPassword: password,
		DefaultIssuer: document.Issuer{Organization: "Midori Research", Signatory: "A. Signatory"},
	}
	h := &harness{t: t, now: time.Date(2026, 10, 14, 9, 0, 0, 0, time.UTC)}
	h.srv = New(store.New(db), func() config.Config { return cfg })
	h.srv.now = func() time.Time { return h.now }
	return h
}

type response struct {
	code   int
	body   map[string]any
	header http.Header
}

func (h *harness) do(method, path, body string, mutate ...func(*http.Request)) response {
	h.t.Helper()
	var req *http.Request
	if body == "" {
		req = httptest.NewRequest(method, "https://"+host+path, nil)
	} else {
		req = httptest.NewRequest(method, "https://"+host+path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("CF-Connecting-IP", "203.0.113.7")
	if h.cookie != nil {
		req.AddCookie(h.cookie)
	}
	for _, m := range mutate {
		m(req)
	}
	rec := httptest.NewRecorder()
	h.srv.ServeHTTP(rec, req)
	res := response{code: rec.Code, header: rec.Header()}
	if rec.Body.Len() > 0 {
		if err := json.Unmarshal(rec.Body.Bytes(), &res.body); err != nil {
			h.t.Fatalf("%s %s: invalid JSON %q", method, path, rec.Body.String())
		}
	}
	for _, c := range rec.Result().Cookies() {
		if c.Name == auth.CookieName {
			h.cookie = c
			if c.MaxAge < 0 {
				h.cookie = nil
			}
		}
	}
	return res
}

func (h *harness) expect(res response, code int) response {
	h.t.Helper()
	if res.code != code {
		h.t.Fatalf("status = %d, want %d; body %v", res.code, code, res.body)
	}
	return res
}

func errCode(res response) string {
	e, _ := res.body["error"].(map[string]any)
	code, _ := e["code"].(string)
	return code
}

var digestA = strings.Repeat("ab", 64)

func TestSigningAndVerification(t *testing.T) {
	h := newHarness(t)

	h.expect(h.do("GET", "/api/studio/documents", ""), http.StatusUnauthorized)
	h.expect(h.do("POST", "/api/auth/login", `{"password":"nope"}`), http.StatusUnauthorized)
	h.expect(h.do("POST", "/api/auth/login", `{"password":"`+password+`"}`), http.StatusOK)
	if h.cookie == nil {
		t.Fatal("no session cookie after sign-in")
	}
	sess := h.expect(h.do("GET", "/api/auth/session", ""), http.StatusOK)
	if sess.body["authenticated"] != true {
		t.Fatalf("session = %v", sess.body)
	}

	created := h.expect(h.do("POST", "/api/studio/documents",
		`{"fileName":"Offer letter.pdf","pageCount":2,"fileSize":1000}`), http.StatusCreated)
	id := created.body["id"].(string)
	if created.body["verifyUrl"] != "https://"+host+"/v/"+id || created.body["status"] != "pending" {
		t.Fatalf("created = %v", created.body)
	}

	pending := h.expect(h.do("GET", "/api/documents/"+strings.ToLower(id), ""), http.StatusOK)
	if pending.body["status"] != "pending" {
		t.Fatalf("pending = %v", pending.body)
	}

	h.expect(h.do("POST", "/api/studio/documents/"+id+"/finalize",
		`{"sha512":"`+digestA+`","fileSize":1200,"stamp":{"page":3,"x":0.5,"y":0.5,"sizeMm":22}}`),
		http.StatusUnprocessableEntity)
	issued := h.expect(h.do("POST", "/api/studio/documents/"+id+"/finalize",
		`{"sha512":"`+strings.ToUpper(digestA)+`","fileSize":1200,"stamp":{"page":2,"x":0.8,"y":0.85,"sizeMm":22}}`),
		http.StatusOK)
	if issued.body["status"] != "issued" || issued.body["sha512"] != digestA {
		t.Fatalf("issued = %v", issued.body)
	}

	// Public view never discloses the digest.
	h.cookie = nil
	public := h.expect(h.do("GET", "/api/documents/"+id, ""), http.StatusOK)
	if _, leaked := public.body["sha512"]; leaked {
		t.Fatal("public document exposes sha512")
	}
	if public.body["serial"] != document.Serial(id) {
		t.Fatalf("serial = %v", public.body["serial"])
	}

	miss := h.expect(h.do("POST", "/api/documents/"+id+"/verify", `{"sha512":"`+strings.Repeat("cd", 64)+`"}`), http.StatusOK)
	if miss.body["match"] != false || miss.body["recordedSha512"] != nil {
		t.Fatalf("mismatch = %v", miss.body)
	}
	hit := h.expect(h.do("POST", "/api/documents/"+id+"/verify", `{"sha512":"`+digestA+`"}`), http.StatusOK)
	if hit.body["match"] != true || hit.body["recordedSha512"] != digestA {
		t.Fatalf("match = %v", hit.body)
	}
	h.expect(h.do("POST", "/api/documents/"+id+"/verify", `{"sha512":"short"}`), http.StatusUnprocessableEntity)

	found := h.expect(h.do("POST", "/api/lookup", `{"sha512":"`+digestA+`"}`), http.StatusOK)
	if found.body["id"] != id {
		t.Fatalf("lookup = %v", found.body)
	}
	if errCode(h.expect(h.do("POST", "/api/lookup", `{"sha512":"`+strings.Repeat("ef", 64)+`"}`), http.StatusNotFound)) != "no_record" {
		t.Fatal("unknown digest lookup")
	}
	h.expect(h.do("GET", "/api/documents/not-an-id", ""), http.StatusNotFound)
}

func TestRevokeAndList(t *testing.T) {
	h := newHarness(t)
	h.expect(h.do("POST", "/api/auth/login", `{"password":"`+password+`"}`), http.StatusOK)
	var ids []string
	for range 3 {
		h.now = h.now.Add(time.Minute)
		res := h.expect(h.do("POST", "/api/studio/documents", `{"fileName":"doc.pdf","pageCount":1}`), http.StatusCreated)
		ids = append(ids, res.body["id"].(string))
	}
	h.expect(h.do("POST", "/api/studio/documents/"+ids[0]+"/revoke", `{"reason":"x"}`), http.StatusConflict)
	h.expect(h.do("POST", "/api/studio/documents/"+ids[0]+"/finalize",
		`{"sha512":"`+digestA+`","fileSize":10,"stamp":{"page":1,"x":0,"y":0,"sizeMm":20}}`), http.StatusOK)
	h.expect(h.do("POST", "/api/studio/documents/"+ids[0]+"/revoke", `{"reason":"  "}`), http.StatusUnprocessableEntity)
	revoked := h.expect(h.do("POST", "/api/studio/documents/"+ids[0]+"/revoke", `{"reason":"Superseded by a corrected letter"}`), http.StatusOK)
	if revoked.body["status"] != "revoked" || revoked.body["revocationReason"] != "Superseded by a corrected letter" {
		t.Fatalf("revoked = %v", revoked.body)
	}

	page := h.expect(h.do("GET", "/api/studio/documents?limit=2", ""), http.StatusOK)
	docs := page.body["documents"].([]any)
	if len(docs) != 2 || page.body["nextCursor"] != ids[1] {
		t.Fatalf("page = %v", page.body)
	}
	counts := page.body["counts"].(map[string]any)
	if counts["revoked"] != float64(1) || counts["pending"] != float64(2) {
		t.Fatalf("counts = %v", counts)
	}
	rest := h.expect(h.do("GET", "/api/studio/documents?limit=2&before="+ids[1], ""), http.StatusOK)
	if len(rest.body["documents"].([]any)) != 1 || rest.body["nextCursor"] != nil {
		t.Fatalf("rest = %v", rest.body)
	}

	h.expect(h.do("DELETE", "/api/studio/documents/"+ids[2], ""), http.StatusNoContent)
	h.expect(h.do("DELETE", "/api/studio/documents/"+ids[0], ""), http.StatusConflict)

	h.expect(h.do("POST", "/api/auth/logout", `{}`), http.StatusOK)
	h.expect(h.do("GET", "/api/studio/documents", ""), http.StatusUnauthorized)
}

func TestIssuerSettings(t *testing.T) {
	h := newHarness(t)
	h.expect(h.do("POST", "/api/auth/login", `{"password":"`+password+`"}`), http.StatusOK)
	got := h.expect(h.do("GET", "/api/studio/issuer", ""), http.StatusOK)
	if got.body["saved"] != false || got.body["organization"] != "Midori Research" {
		t.Fatalf("default issuer = %v", got.body)
	}
	h.expect(h.do("PUT", "/api/studio/issuer", `{"organization":"","signatory":"x"}`), http.StatusUnprocessableEntity)
	h.expect(h.do("PUT", "/api/studio/issuer",
		`{"organization":"Midori Research","signatory":"B. Signatory","role":"Editor","url":"https://midoriresearch.com"}`), http.StatusOK)
	public := h.expect(h.do("GET", "/api/issuer", ""), http.StatusOK)
	if public.body["signatory"] != "B. Signatory" {
		t.Fatalf("public issuer = %v", public.body)
	}
}

func TestLoginRateLimit(t *testing.T) {
	h := newHarness(t)
	for range auth.MaxFailedLogins {
		h.expect(h.do("POST", "/api/auth/login", `{"password":"wrong"}`), http.StatusUnauthorized)
	}
	limited := h.expect(h.do("POST", "/api/auth/login", `{"password":"`+password+`"}`), http.StatusTooManyRequests)
	if limited.header.Get("Retry-After") == "" {
		t.Fatal("no Retry-After header")
	}
	h.now = h.now.Add(auth.FailedLoginWindow + time.Second)
	h.expect(h.do("POST", "/api/auth/login", `{"password":"`+password+`"}`), http.StatusOK)
}

func TestRequestGuards(t *testing.T) {
	h := newHarness(t)
	wrongHost := h.do("GET", "/api/issuer", "", func(r *http.Request) { r.Host = "verisign.someone.workers.dev" })
	h.expect(wrongHost, http.StatusMisdirectedRequest)
	h.expect(h.do("GET", "/api/issuer", "", func(r *http.Request) { r.Host = "localhost:8787" }), http.StatusOK)

	crossSite := h.do("POST", "/api/auth/login", `{"password":"`+password+`"}`,
		func(r *http.Request) { r.Header.Set("Origin", "https://evil.example") })
	if errCode(h.expect(crossSite, http.StatusForbidden)) != "cross_origin" {
		t.Fatal("cross-origin login allowed")
	}
	h.expect(h.do("POST", "/api/auth/login", "password="+password,
		func(r *http.Request) { r.Header.Set("Content-Type", "application/x-www-form-urlencoded") }),
		http.StatusUnsupportedMediaType)
	h.expect(h.do("GET", "/api/nope", ""), http.StatusNotFound)
	res := h.do("GET", "/api/issuer", "")
	if res.header.Get("Cache-Control") != "no-store" {
		t.Fatal("API responses must not be cached")
	}
}
