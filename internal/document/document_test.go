package document

import (
	"errors"
	"strings"
	"testing"
)

func TestNewIDIsCanonical(t *testing.T) {
	seen := map[string]bool{}
	for range 200 {
		id := NewID()
		got, ok := NormalizeID(id)
		if !ok || got != id {
			t.Fatalf("NewID() = %q does not round-trip through NormalizeID (got %q, %v)", id, got, ok)
		}
		if seen[id] {
			t.Fatalf("NewID() repeated %q", id)
		}
		seen[id] = true
	}
}

func TestNormalizeID(t *testing.T) {
	tests := []struct {
		in   string
		want string
		ok   bool
	}{
		{"K7Q4M2XD9PRA", "K7Q4M2XD9PRA", true},
		{"k7q4-m2xd-9pra", "K7Q4M2XD9PRA", true},
		{" K7Q4 M2XD 9PRA ", "K7Q4M2XD9PRA", true},
		{"OILO-0000-0000", "011000000000", true}, // O→0, I→1, L→1
		{"K7Q4M2XD9PR", "", false},
		{"K7Q4M2XD9PRAA", "", false},
		{"K7Q4M2XD9PRU", "", false},
		{"../etc/passwd", "", false},
	}
	for _, tt := range tests {
		got, ok := NormalizeID(tt.in)
		if ok != tt.ok || got != tt.want {
			t.Errorf("NormalizeID(%q) = %q, %v; want %q, %v", tt.in, got, ok, tt.want, tt.ok)
		}
	}
}

func TestSerial(t *testing.T) {
	if got := Serial("K7Q4M2XD9PRA"); got != "K7Q4-M2XD-9PRA" {
		t.Errorf("Serial = %q", got)
	}
}

func TestNormalizeSHA512(t *testing.T) {
	valid := strings.Repeat("aB", 64)
	got, err := NormalizeSHA512("  " + valid[:64] + "\n" + valid[64:] + " ")
	if err != nil || got != strings.ToLower(valid) {
		t.Fatalf("NormalizeSHA512 = %q, %v", got, err)
	}
	for _, bad := range []string{"", strings.Repeat("a", 127), strings.Repeat("g", 128), strings.Repeat("a", 129)} {
		if _, err := NormalizeSHA512(bad); !errors.Is(err, ErrInvalid) {
			t.Errorf("NormalizeSHA512(%d chars) error = %v; want ErrInvalid", len(bad), err)
		}
	}
}

func TestDraftValidate(t *testing.T) {
	d := Draft{FileName: "  Offer   letter.pdf ", PageCount: 2}
	if err := d.Validate(); err != nil {
		t.Fatal(err)
	}
	if d.FileName != "Offer letter.pdf" || d.Title != "Offer letter" {
		t.Errorf("Validate normalised to %+v", d)
	}
	bad := Draft{FileName: "x.pdf", PageCount: 0}
	if err := bad.Validate(); !errors.Is(err, ErrInvalid) {
		t.Errorf("zero pages accepted: %v", err)
	}
}

func TestFinalizationValidate(t *testing.T) {
	f := Finalization{
		SHA512:   strings.Repeat("F", 128),
		FileSize: 1024,
		Stamp:    Stamp{Page: 2, X: 0.8, Y: 0.85, SizeMM: 22},
	}
	if err := f.Validate(2); err != nil {
		t.Fatal(err)
	}
	if f.SHA512 != strings.Repeat("f", 128) {
		t.Errorf("digest not lower-cased")
	}
	f.Stamp.Page = 3
	if err := f.Validate(2); !errors.Is(err, ErrInvalid) {
		t.Errorf("stamp outside page count accepted")
	}
}

func TestIssuerValidate(t *testing.T) {
	i := Issuer{Organization: " Midori Research ", Signatory: "A. Person", URL: "javascript:alert(1)"}
	if err := i.Validate(); !errors.Is(err, ErrInvalid) {
		t.Errorf("non-http URL accepted")
	}
	i.URL = "https://midoriresearch.com"
	if err := i.Validate(); err != nil || i.Organization != "Midori Research" {
		t.Errorf("Validate = %v, %+v", err, i)
	}
}
