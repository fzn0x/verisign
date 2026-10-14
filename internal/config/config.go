// Package config reads the Worker's environment variables and secrets.
package config

import (
	"net/url"
	"strings"

	"github.com/fzn0x/verisign/internal/document"
)

// Environment variable names. OWNER_PASSWORD must be set as a secret.
const (
	EnvPublicOrigin       = "PUBLIC_ORIGIN"
	EnvOwnerPassword      = "OWNER_PASSWORD"
	EnvIssuerOrganization = "ISSUER_ORGANIZATION"
	EnvIssuerSignatory    = "ISSUER_SIGNATORY"
	EnvIssuerRole         = "ISSUER_ROLE"
	EnvIssuerURL          = "ISSUER_URL"
)

// MinPasswordLen is the shortest owner password the Worker accepts. A
// shorter or missing secret disables sign-in rather than weakening it.
const MinPasswordLen = 12

// Config is the runtime configuration.
type Config struct {
	// PublicOrigin is the only origin the app answers on, such as
	// https://verisign.example.com. QR codes encode URLs under it.
	PublicOrigin string
	// OwnerPassword is the single owner's sign-in password.
	OwnerPassword string
	// DefaultIssuer is used until the owner saves a profile in settings.
	DefaultIssuer document.Issuer
}

// Load builds a Config from a getenv function.
func Load(getenv func(string) string) Config {
	return Config{
		PublicOrigin:  strings.TrimRight(strings.TrimSpace(getenv(EnvPublicOrigin)), "/"),
		OwnerPassword: getenv(EnvOwnerPassword),
		DefaultIssuer: document.Issuer{
			Organization: strings.TrimSpace(getenv(EnvIssuerOrganization)),
			Signatory:    strings.TrimSpace(getenv(EnvIssuerSignatory)),
			Role:         strings.TrimSpace(getenv(EnvIssuerRole)),
			URL:          strings.TrimSpace(getenv(EnvIssuerURL)),
		},
	}
}

// PasswordConfigured reports whether sign-in is possible.
func (c Config) PasswordConfigured() bool {
	return len(c.OwnerPassword) >= MinPasswordLen
}

// PublicHost returns the host of PublicOrigin, or "" when unset.
func (c Config) PublicHost() string {
	if c.PublicOrigin == "" {
		return ""
	}
	u, err := url.Parse(c.PublicOrigin)
	if err != nil {
		return ""
	}
	return u.Host
}

// VerifyURL is the public verification URL for a document ID.
func (c Config) VerifyURL(origin, id string) string {
	if c.PublicOrigin != "" {
		origin = c.PublicOrigin
	}
	return origin + "/v/" + id
}
