package api

import (
	"encoding/json"
	"errors"
	"log"
	"mime"
	"net/http"

	"github.com/fzn0x/verisign/internal/document"
)

// maxBodyBytes bounds every JSON request body. Requests carry metadata and
// digests only, never document bytes.
const maxBodyBytes = 16 << 10

type errorBody struct {
	Error apiError `json:"error"`
}

type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Field   string `json:"field,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("api: encode response: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, errorBody{Error: apiError{Code: code, Message: message}})
}

// writeValidation reports a domain validation error, or a generic bad
// request for anything else.
func writeValidation(w http.ResponseWriter, err error) {
	var ve *document.ValidationError
	if errors.As(err, &ve) {
		writeJSON(w, http.StatusUnprocessableEntity, errorBody{Error: apiError{
			Code: "invalid", Message: ve.Field + " " + ve.Message, Field: ve.Field,
		}})
		return
	}
	writeError(w, http.StatusBadRequest, "bad_request", "The request could not be read.")
}

func writeInternal(w http.ResponseWriter, op string, err error) {
	log.Printf("api: %s: %v", op, err)
	writeError(w, http.StatusInternalServerError, "internal", "Something went wrong on the server. Try again in a moment.")
}

// decodeJSON reads a bounded JSON body into v.
func decodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if mediaType != "application/json" {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "Send the request as application/json.")
		return false
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	if err := dec.Decode(v); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeError(w, http.StatusRequestEntityTooLarge, "too_large", "The request body is too large.")
			return false
		}
		writeError(w, http.StatusBadRequest, "bad_request", "The request body is not valid JSON.")
		return false
	}
	return true
}
