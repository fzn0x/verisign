package api

import (
	"net/http"
	"time"

	"github.com/fzn0x/verisign/internal/config"
	"github.com/fzn0x/verisign/internal/document"
)

// publicDocument is what anyone holding the QR link may see. The recorded
// digest is deliberately absent: a verifier proves possession of the file
// by supplying the digest, not by reading it.
type publicDocument struct {
	ID               string          `json:"id"`
	Serial           string          `json:"serial"`
	Status           document.Status `json:"status"`
	Title            string          `json:"title"`
	FileName         string          `json:"fileName"`
	FileSize         int64           `json:"fileSize"`
	PageCount        int             `json:"pageCount"`
	Issuer           document.Issuer `json:"issuer"`
	IssuedAt         *time.Time      `json:"issuedAt"`
	RevokedAt        *time.Time      `json:"revokedAt"`
	RevocationReason string          `json:"revocationReason,omitempty"`
	VerifyURL        string          `json:"verifyUrl"`
}

// studioDocument adds the owner-only fields.
type studioDocument struct {
	publicDocument
	SHA512    string          `json:"sha512,omitempty"`
	Stamp     *document.Stamp `json:"stamp"`
	CreatedAt time.Time       `json:"createdAt"`
}

func requestOrigin(r *http.Request) string {
	scheme := r.URL.Scheme
	if scheme == "" {
		scheme = "https"
	}
	return scheme + "://" + requestHost(r)
}

func toPublic(cfg config.Config, r *http.Request, d *document.Document) publicDocument {
	return publicDocument{
		ID:               d.ID,
		Serial:           document.Serial(d.ID),
		Status:           d.Status,
		Title:            d.Title,
		FileName:         d.FileName,
		FileSize:         d.FileSize,
		PageCount:        d.PageCount,
		Issuer:           d.Issuer,
		IssuedAt:         d.IssuedAt,
		RevokedAt:        d.RevokedAt,
		RevocationReason: d.RevocationReason,
		VerifyURL:        cfg.VerifyURL(requestOrigin(r), d.ID),
	}
}

func toStudio(cfg config.Config, r *http.Request, d *document.Document) studioDocument {
	return studioDocument{
		publicDocument: toPublic(cfg, r, d),
		SHA512:         d.SHA512,
		Stamp:          d.Stamp,
		CreatedAt:      d.CreatedAt,
	}
}
