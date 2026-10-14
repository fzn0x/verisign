package api

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/fzn0x/verisign/internal/document"
	"github.com/fzn0x/verisign/internal/store"
)

const (
	defaultPageSize = 50
	maxPageSize     = 100
)

type listResponse struct {
	Documents  []studioDocument        `json:"documents"`
	Counts     map[document.Status]int `json:"counts"`
	NextCursor string                  `json:"nextCursor,omitempty"`
}

func (s *Server) listDocuments(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	query := store.ListQuery{
		Status: document.Status(q.Get("status")),
		Search: q.Get("q"),
		Limit:  defaultPageSize,
	}
	if query.Status != "" && !query.Status.Valid() {
		writeError(w, http.StatusBadRequest, "bad_request", "Unknown status filter.")
		return
	}
	if n, err := strconv.Atoi(q.Get("limit")); err == nil && n > 0 {
		query.Limit = min(n, maxPageSize)
	}
	if before := q.Get("before"); before != "" {
		id, ok := document.NormalizeID(before)
		if !ok {
			writeError(w, http.StatusBadRequest, "bad_request", "Invalid cursor.")
			return
		}
		query.Before = id
	}

	// Fetch one extra row to learn whether another page exists.
	query.Limit++
	docs, err := s.store.ListDocuments(r.Context(), query)
	if err != nil {
		writeInternal(w, "list documents", err)
		return
	}
	counts, err := s.store.CountByStatus(r.Context())
	if err != nil {
		writeInternal(w, "count documents", err)
		return
	}

	cfg := s.config()
	resp := listResponse{Documents: make([]studioDocument, 0, len(docs)), Counts: counts}
	if len(docs) == query.Limit {
		docs = docs[:len(docs)-1]
		resp.NextCursor = docs[len(docs)-1].ID
	}
	for i := range docs {
		resp.Documents = append(resp.Documents, toStudio(cfg, r, &docs[i]))
	}
	writeJSON(w, http.StatusOK, resp)
}

// createDocument reserves an ID and snapshots the issuer, so the browser
// can encode the verification URL into the QR before stamping.
func (s *Server) createDocument(w http.ResponseWriter, r *http.Request) {
	var draft document.Draft
	if !decodeJSON(w, r, &draft) {
		return
	}
	if err := draft.Validate(); err != nil {
		writeValidation(w, err)
		return
	}
	ctx := r.Context()
	cfg := s.config()
	issuer, _, err := s.currentIssuer(ctx, cfg)
	if err != nil {
		writeInternal(w, "issuer", err)
		return
	}
	if issuer.Validate() != nil {
		writeError(w, http.StatusConflict, "issuer_incomplete",
			"Add the organisation and signatory in Settings before signing.")
		return
	}
	now := s.now()
	if err := s.store.PurgeStalePending(ctx, now.Add(-pendingTTL)); err != nil {
		writeInternal(w, "purge pending", err)
		return
	}
	d := &document.Document{
		ID:        document.NewID(),
		Status:    document.StatusPending,
		Title:     draft.Title,
		FileName:  draft.FileName,
		FileSize:  draft.FileSize,
		PageCount: draft.PageCount,
		Issuer:    issuer,
		CreatedAt: now.UTC(),
	}
	if err := s.store.CreateDocument(ctx, d); err != nil {
		writeInternal(w, "create document", err)
		return
	}
	writeJSON(w, http.StatusCreated, toStudio(cfg, r, d))
}

func (s *Server) studioDocument(w http.ResponseWriter, r *http.Request) {
	d, ok := s.loadDocument(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, toStudio(s.config(), r, d))
}

// writeStoreError maps store sentinel errors to responses.
func writeStoreError(w http.ResponseWriter, op string, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "No document has this code.")
	case errors.Is(err, store.ErrConflict):
		writeError(w, http.StatusConflict, "wrong_state", "The document is not in a state that allows this.")
	case errors.Is(err, store.ErrDuplicateDigest):
		writeError(w, http.StatusConflict, "duplicate_digest", "Another document already has this exact fingerprint.")
	default:
		writeInternal(w, op, err)
	}
}

func (s *Server) finalizeDocument(w http.ResponseWriter, r *http.Request) {
	var f document.Finalization
	if !decodeJSON(w, r, &f) {
		return
	}
	d, ok := s.loadDocument(w, r)
	if !ok {
		return
	}
	if err := f.Validate(d.PageCount); err != nil {
		writeValidation(w, err)
		return
	}
	if err := s.store.FinalizeDocument(r.Context(), d.ID, f, s.now().UTC()); err != nil {
		writeStoreError(w, "finalize", err)
		return
	}
	s.respondWithDocument(w, r, d.ID)
}

type revokeRequest struct {
	Reason string `json:"reason"`
}

func (s *Server) revokeDocument(w http.ResponseWriter, r *http.Request) {
	var req revokeRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	reason, err := document.CleanText("reason", req.Reason, document.MaxReasonLen, true)
	if err != nil {
		writeValidation(w, err)
		return
	}
	d, ok := s.loadDocument(w, r)
	if !ok {
		return
	}
	if err := s.store.RevokeDocument(r.Context(), d.ID, reason, s.now().UTC()); err != nil {
		writeStoreError(w, "revoke", err)
		return
	}
	s.respondWithDocument(w, r, d.ID)
}

func (s *Server) discardDocument(w http.ResponseWriter, r *http.Request) {
	d, ok := s.loadDocument(w, r)
	if !ok {
		return
	}
	if err := s.store.DeletePending(r.Context(), d.ID); err != nil {
		writeStoreError(w, "discard", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) respondWithDocument(w http.ResponseWriter, r *http.Request, id string) {
	d, err := s.store.GetDocument(r.Context(), id)
	if err != nil {
		writeStoreError(w, "reload document", err)
		return
	}
	writeJSON(w, http.StatusOK, toStudio(s.config(), r, d))
}

type issuerResponse struct {
	document.Issuer
	// Saved is false while the profile still comes from environment defaults.
	Saved bool `json:"saved"`
}

func (s *Server) getIssuer(w http.ResponseWriter, r *http.Request) {
	issuer, saved, err := s.currentIssuer(r.Context(), s.config())
	if err != nil {
		writeInternal(w, "issuer", err)
		return
	}
	writeJSON(w, http.StatusOK, issuerResponse{Issuer: issuer, Saved: saved})
}

func (s *Server) putIssuer(w http.ResponseWriter, r *http.Request) {
	var issuer document.Issuer
	if !decodeJSON(w, r, &issuer) {
		return
	}
	if err := issuer.Validate(); err != nil {
		writeValidation(w, err)
		return
	}
	if err := s.store.PutIssuer(r.Context(), issuer, s.now().UTC()); err != nil {
		writeInternal(w, "save issuer", err)
		return
	}
	writeJSON(w, http.StatusOK, issuerResponse{Issuer: issuer, Saved: true})
}
