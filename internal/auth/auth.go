// Package auth implements axboard's optional built-in authentication:
// argon2id password hashing/verification and stateless signed-cookie sessions.
// It has no dependency on the rest of axboard so it can be unit-tested and used
// from the `axboard passwd` CLI helper.
package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/argon2"
)

// argon2id cost parameters. Tuned for an interactive login on modest homelab
// hardware (~64 MiB, a few tens of ms). Encoded into every hash so old hashes
// keep verifying if these change later.
const (
	argonTime    = 3
	argonMemory  = 64 * 1024 // KiB → 64 MiB
	argonThreads = 4
	argonKeyLen  = 32
	argonSaltLen = 16
)

// HashPassword returns a self-describing PHC-format argon2id hash, e.g.
// "$argon2id$v=19$m=65536,t=3,p=4$<salt>$<key>".
func HashPassword(pw string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := argon2.IDKey([]byte(pw), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemory, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key)), nil
}

// VerifyPassword reports whether pw matches a PHC argon2id hash. It parses the
// cost parameters from the hash and compares in constant time. Any malformed
// hash returns false.
func VerifyPassword(pw, phc string) bool {
	parts := strings.Split(phc, "$")
	// "", "argon2id", "v=19", "m=..,t=..,p=..", salt, key
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false
	}
	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return false
	}
	var mem, t uint32
	var p uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &mem, &t, &p); err != nil {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(want) == 0 {
		return false
	}
	got := argon2.IDKey([]byte(pw), salt, t, mem, p, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1
}

// Manager issues and verifies stateless session tokens signed with an HMAC
// secret. Tokens carry the username and an expiry, so no server-side session
// store is needed; revocation-on-rotate happens by changing the secret.
type Manager struct {
	secret []byte
}

// NewManager returns a session manager keyed by the given HMAC secret.
func NewManager(secret []byte) *Manager { return &Manager{secret: secret} }

// Issue returns a signed token for username, valid for ttl from now.
func (m *Manager) Issue(username string, ttl time.Duration, now time.Time) string {
	if ttl <= 0 {
		ttl = 7 * 24 * time.Hour
	}
	body := base64.RawURLEncoding.EncodeToString([]byte(username)) + "|" +
		strconv.FormatInt(now.Add(ttl).Unix(), 10)
	payload := base64.RawURLEncoding.EncodeToString([]byte(body))
	return payload + "." + m.sign(payload)
}

// Verify returns the token's username if the signature is valid and the token
// has not expired at now.
func (m *Manager) Verify(token string, now time.Time) (string, bool) {
	payload, sig, ok := strings.Cut(token, ".")
	if !ok {
		return "", false
	}
	if subtle.ConstantTimeCompare([]byte(sig), []byte(m.sign(payload))) != 1 {
		return "", false
	}
	raw, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		return "", false
	}
	nameB64, expStr, ok := strings.Cut(string(raw), "|")
	if !ok {
		return "", false
	}
	exp, err := strconv.ParseInt(expStr, 10, 64)
	if err != nil || now.Unix() > exp {
		return "", false
	}
	name, err := base64.RawURLEncoding.DecodeString(nameB64)
	if err != nil {
		return "", false
	}
	return string(name), true
}

func (m *Manager) sign(payload string) string {
	mac := hmac.New(sha256.New, m.secret)
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// LoadOrCreateSecret returns the 32-byte HMAC secret stored at path (hex),
// generating and persisting a new one with 0600 perms if the file is missing
// or unusable. Keeping the secret out of state.yaml means the UI's state
// round-trip can never clobber it, and a fixed secret keeps sessions valid
// across restarts.
func LoadOrCreateSecret(path string) ([]byte, error) {
	if data, err := os.ReadFile(path); err == nil {
		if b, err := hex.DecodeString(strings.TrimSpace(string(data))); err == nil && len(b) >= 32 {
			return b, nil
		}
	}
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	if err := os.WriteFile(path, []byte(hex.EncodeToString(b)), 0o600); err != nil {
		return nil, err
	}
	return b, nil
}
