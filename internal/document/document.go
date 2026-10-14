// Package document holds the domain types and rules for signed documents:
// identifiers, digests and the issuer identity snapshotted onto each record.
package document

import (
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

// Status is the lifecycle state of a document record.
type Status string

const (
	// StatusPending is a record whose ID has been issued for stamping but
	// whose final digest has not been recorded yet.
	StatusPending Status = "pending"
	// StatusIssued is a completed record with a recorded SHA-512 digest.
	StatusIssued Status = "issued"
	// StatusRevoked is an issued record the owner has withdrawn.
	StatusRevoked Status = "revoked"
)

// Valid reports whether s is a known status.
func (s Status) Valid() bool {
	switch s {
	case StatusPending, StatusIssued, StatusRevoked:
		return true
	}
	return false
}

// Issuer is the identity shown on verification pages.
type Issuer struct {
	Organization string `json:"organization"`
	Signatory    string `json:"signatory"`
	Role         string `json:"role"`
	URL          string `json:"url"`
}

// Stamp records where the verification QR was placed. X and Y are the
// top-left corner as fractions of the page width and height.
type Stamp struct {
	Page   int     `json:"page"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	SizeMM float64 `json:"sizeMm"`
}

// Document is a signed document record.
type Document struct {
	ID               string     `json:"id"`
	Status           Status     `json:"status"`
	Title            string     `json:"title"`
	FileName         string     `json:"fileName"`
	FileSize         int64      `json:"fileSize"`
	PageCount        int        `json:"pageCount"`
	SHA512           string     `json:"-"`
	Issuer           Issuer     `json:"issuer"`
	Stamp            *Stamp     `json:"-"`
	CreatedAt        time.Time  `json:"-"`
	IssuedAt         *time.Time `json:"issuedAt"`
	RevokedAt        *time.Time `json:"revokedAt"`
	RevocationReason string     `json:"revocationReason,omitempty"`
}

// Field limits shared by validation and the API.
const (
	MaxTitleLen    = 160
	MaxFileNameLen = 255
	MaxReasonLen   = 280
	MaxIssuerLen   = 120
	MaxURLLen      = 200
)

// ErrInvalid is wrapped by every validation error in this package.
var ErrInvalid = errors.New("invalid")

// ValidationError names the field that failed and why.
type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string { return e.Field + ": " + e.Message }

// Unwrap lets callers test for ErrInvalid.
func (e *ValidationError) Unwrap() error { return ErrInvalid }

func invalid(field, message string) error {
	return &ValidationError{Field: field, Message: message}
}

// CleanText trims surrounding space, collapses internal runs of whitespace
// and enforces a maximum length in characters.
func CleanText(field, value string, max int, required bool) (string, error) {
	value = strings.Join(strings.Fields(value), " ")
	if required && value == "" {
		return "", invalid(field, "is required")
	}
	if utf8.RuneCountInString(value) > max {
		return "", invalid(field, "is too long")
	}
	return value, nil
}

// Draft is the owner's request to reserve a document record before stamping.
type Draft struct {
	Title     string `json:"title"`
	FileName  string `json:"fileName"`
	FileSize  int64  `json:"fileSize"`
	PageCount int    `json:"pageCount"`
}

// Validate normalises the draft in place.
func (d *Draft) Validate() error {
	var err error
	if d.FileName, err = CleanText("fileName", d.FileName, MaxFileNameLen, true); err != nil {
		return err
	}
	if d.Title, err = CleanText("title", d.Title, MaxTitleLen, false); err != nil {
		return err
	}
	if d.Title == "" {
		d.Title = strings.TrimSuffix(d.FileName, ".pdf")
	}
	if d.FileSize < 0 {
		return invalid("fileSize", "must not be negative")
	}
	if d.PageCount < 1 || d.PageCount > 10000 {
		return invalid("pageCount", "must be between 1 and 10000")
	}
	return nil
}

// Finalization is the owner's report of the stamped file's digest.
type Finalization struct {
	SHA512   string `json:"sha512"`
	FileSize int64  `json:"fileSize"`
	Stamp    Stamp  `json:"stamp"`
}

// Validate normalises the finalization in place against the document's
// page count.
func (f *Finalization) Validate(pageCount int) error {
	digest, err := NormalizeSHA512(f.SHA512)
	if err != nil {
		return err
	}
	f.SHA512 = digest
	if f.FileSize <= 0 {
		return invalid("fileSize", "must be positive")
	}
	s := f.Stamp
	if s.Page < 1 || s.Page > pageCount {
		return invalid("stamp.page", "is outside the document")
	}
	if s.X < 0 || s.X > 1 || s.Y < 0 || s.Y > 1 {
		return invalid("stamp", "position must be within the page")
	}
	if s.SizeMM < 10 || s.SizeMM > 80 {
		return invalid("stamp.sizeMm", "must be between 10 and 80 mm")
	}
	return nil
}

// Validate normalises the issuer profile in place.
func (i *Issuer) Validate() error {
	var err error
	if i.Organization, err = CleanText("organization", i.Organization, MaxIssuerLen, true); err != nil {
		return err
	}
	if i.Signatory, err = CleanText("signatory", i.Signatory, MaxIssuerLen, true); err != nil {
		return err
	}
	if i.Role, err = CleanText("role", i.Role, MaxIssuerLen, false); err != nil {
		return err
	}
	if i.URL, err = CleanText("url", i.URL, MaxURLLen, false); err != nil {
		return err
	}
	if i.URL != "" && !strings.HasPrefix(i.URL, "https://") && !strings.HasPrefix(i.URL, "http://") {
		return invalid("url", "must start with https://")
	}
	return nil
}
