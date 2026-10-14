package api

import (
	"context"
	"crypto/subtle"
	"errors"
	"net/http"
	"time"

	"github.com/fzn0x/verisign/internal/config"
	"github.com/fzn0x/verisign/internal/document"
	"github.com/fzn0x/verisign/internal/store"
)

// currentIssuer returns the saved issuer profile, falling back to the
// configured defaults.
func (s *Server) currentIssuer(ctx context.Context, cfg config.Config) (document.Issuer, bool, error) {
	i, err := s.store.GetIssuer(ctx)
	if errors.Is(err, store.ErrNotFound) {
		return cfg.DefaultIssuer, false, nil
	}
	if err != nil {
		return document.Issuer{}, false, err
	}
	return *i, true, nil
}

func (s *Server) publicIssuer(w http.ResponseWriter, r *http.Request) {
	issuer, _, err := s.currentIssuer(r.Context(), s.config())
	if err != nil {
		writeInternal(w, "issuer", err)
		return
	}
	writeJSON(w, http.StatusOK, issuer)
}

// loadDocument resolves the {id} path value and writes a 404 when the ID
// is malformed or unknown.
func (s *Server) loadDocument(w http.ResponseWriter, r *http.Request) (*document.Document, bool) {
	id, ok := document.NormalizeID(r.PathValue("id"))
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "No document has this code.")
		return nil, false
	}
	d, err := s.store.GetDocument(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "No document has this code.")
		return nil, false
	}
	if err != nil {
		writeInternal(w, "get document", err)
		return nil, false
	}
	return d, true
}

func (s *Server) getDocument(w http.ResponseWriter, r *http.Request) {
	d, ok := s.loadDocument(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, toPublic(s.config(), r, d))
}

type digestRequest struct {
	SHA512 string `json:"sha512"`
}

type verifyResponse struct {
	Match     bool            `json:"match"`
	Status    document.Status `json:"status"`
	CheckedAt time.Time       `json:"checkedAt"`
	// Recorded is returned only when the supplied digest matches, so the
	// verifier can see both strings side by side. It is never disclosed to
	// someone who does not already hold it.
	Recorded string `json:"recordedSha512,omitempty"`
	Supplied string `json:"suppliedSha512"`
}

func (s *Server) verifyDocument(w http.ResponseWriter, r *http.Request) {
	var req digestRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	supplied, err := document.NormalizeSHA512(req.SHA512)
	if err != nil {
		writeValidation(w, err)
		return
	}
	d, ok := s.loadDocument(w, r)
	if !ok {
		return
	}
	resp := verifyResponse{Status: d.Status, CheckedAt: s.now().UTC(), Supplied: supplied}
	if d.SHA512 != "" && subtle.ConstantTimeCompare([]byte(d.SHA512), []byte(supplied)) == 1 {
		resp.Match = true
		resp.Recorded = d.SHA512
	}
	writeJSON(w, http.StatusOK, resp)
}

// lookupDigest finds the document a file belongs to from its digest alone,
// for verifiers whose QR code is damaged or missing.
func (s *Server) lookupDigest(w http.ResponseWriter, r *http.Request) {
	var req digestRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	digest, err := document.NormalizeSHA512(req.SHA512)
	if err != nil {
		writeValidation(w, err)
		return
	}
	d, err := s.store.FindBySHA512(r.Context(), digest)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "no_record", "No document issued here has this fingerprint.")
		return
	}
	if err != nil {
		writeInternal(w, "lookup", err)
		return
	}
	writeJSON(w, http.StatusOK, toPublic(s.config(), r, d))
}
