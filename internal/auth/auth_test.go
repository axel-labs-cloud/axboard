package auth

import (
	"path/filepath"
	"testing"
	"time"
)

func TestHashVerifyRoundTrip(t *testing.T) {
	h, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyPassword("correct horse battery staple", h) {
		t.Error("correct password rejected")
	}
	if VerifyPassword("wrong", h) {
		t.Error("wrong password accepted")
	}
	if VerifyPassword("x", "not-a-phc-string") {
		t.Error("garbage hash accepted")
	}
}

func TestHashesAreSalted(t *testing.T) {
	a, _ := HashPassword("same")
	b, _ := HashPassword("same")
	if a == b {
		t.Error("two hashes of the same password should differ (random salt)")
	}
}

func TestSessionIssueVerify(t *testing.T) {
	m := NewManager([]byte("0123456789abcdef0123456789abcdef"))
	now := time.Date(2026, 7, 29, 12, 0, 0, 0, time.UTC)
	tok := m.Issue("axel", time.Hour, now)

	if name, ok := m.Verify(tok, now.Add(30*time.Minute)); !ok || name != "axel" {
		t.Errorf("verify = %q %v, want axel true", name, ok)
	}
	if _, ok := m.Verify(tok, now.Add(2*time.Hour)); ok {
		t.Error("expired token accepted")
	}
	if _, ok := m.Verify(tok+"x", now); ok {
		t.Error("tampered token accepted")
	}
	other := NewManager([]byte("ffffffffffffffffffffffffffffffff"))
	if _, ok := other.Verify(tok, now); ok {
		t.Error("token verified under a different secret")
	}
}

func TestLoadOrCreateSecretStable(t *testing.T) {
	p := filepath.Join(t.TempDir(), "session.key")
	a, err := LoadOrCreateSecret(p)
	if err != nil {
		t.Fatal(err)
	}
	b, err := LoadOrCreateSecret(p)
	if err != nil {
		t.Fatal(err)
	}
	if string(a) != string(b) || len(a) < 32 {
		t.Error("secret not persisted/stable across calls")
	}
}
