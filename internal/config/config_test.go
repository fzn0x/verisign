package config

import "testing"

func TestLoad(t *testing.T) {
	env := map[string]string{
		EnvPublicOrigin:       " https://verisign.example.com/ ",
		EnvOwnerPassword:      "short",
		EnvIssuerOrganization: " Midori Research ",
	}
	c := Load(func(k string) string { return env[k] })
	if c.PublicOrigin != "https://verisign.example.com" {
		t.Errorf("PublicOrigin = %q", c.PublicOrigin)
	}
	if c.PublicHost() != "verisign.example.com" {
		t.Errorf("PublicHost = %q", c.PublicHost())
	}
	if c.PasswordConfigured() {
		t.Error("short password treated as configured")
	}
	if c.DefaultIssuer.Organization != "Midori Research" {
		t.Errorf("issuer = %+v", c.DefaultIssuer)
	}
	if got := c.VerifyURL("http://localhost:8787", "K7Q4M2XD9PRA"); got != "https://verisign.example.com/v/K7Q4M2XD9PRA" {
		t.Errorf("VerifyURL = %q", got)
	}
	if got := (Config{}).VerifyURL("http://localhost:8787", "X"); got != "http://localhost:8787/v/X" {
		t.Errorf("VerifyURL without origin = %q", got)
	}
}
