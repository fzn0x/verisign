package document

import (
	"crypto/rand"
	"encoding/hex"
	"strings"
)

// IDLength is the number of characters in a document ID. Twelve Crockford
// base32 characters carry 60 bits of randomness.
const IDLength = 12

// crockford is Crockford's base32 alphabet: digits and upper-case letters
// without I, L, O and U, so IDs survive being read aloud or retyped.
const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

// NewID returns a random document ID.
func NewID() string {
	var buf [IDLength]byte
	if _, err := rand.Read(buf[:]); err != nil {
		panic("document: crypto/rand failed: " + err.Error())
	}
	out := make([]byte, IDLength)
	for i, b := range buf {
		out[i] = crockford[b&31]
	}
	return string(out)
}

// NormalizeID accepts an ID as a person might type it (lower case, grouped
// with dashes or spaces, with O for 0 or I and L for 1) and returns the
// canonical form. ok is false when the input cannot be an ID.
func NormalizeID(raw string) (id string, ok bool) {
	var b strings.Builder
	b.Grow(IDLength)
	for _, r := range strings.ToUpper(raw) {
		switch r {
		case '-', ' ', '\t':
			continue
		case 'O':
			r = '0'
		case 'I', 'L':
			r = '1'
		}
		if r > 127 || !strings.ContainsRune(crockford, r) {
			return "", false
		}
		b.WriteRune(r)
	}
	if b.Len() != IDLength {
		return "", false
	}
	return b.String(), true
}

// Serial formats an ID in groups of four for display: K7Q4-M2XD-9PRA.
func Serial(id string) string {
	if len(id) != IDLength {
		return id
	}
	return id[0:4] + "-" + id[4:8] + "-" + id[8:12]
}

// SHA512HexLen is the length of a hex-encoded SHA-512 digest.
const SHA512HexLen = 128

// NormalizeSHA512 accepts a hex digest with any case and embedded
// whitespace (as copied from shasum or certutil output) and returns it in
// lower case.
func NormalizeSHA512(raw string) (string, error) {
	digest := strings.ToLower(strings.Join(strings.Fields(raw), ""))
	if len(digest) != SHA512HexLen {
		return "", invalid("sha512", "must be 128 hexadecimal characters")
	}
	if _, err := hex.DecodeString(digest); err != nil {
		return "", invalid("sha512", "must be hexadecimal")
	}
	return digest, nil
}
