package api

import (
	"bytes"
	"net"
	"testing"
)

func TestMagicPacket(t *testing.T) {
	hw, err := net.ParseMAC("aa:bb:cc:dd:ee:ff")
	if err != nil {
		t.Fatal(err)
	}
	p := magicPacket(hw)
	if len(p) != 102 {
		t.Fatalf("packet len = %d, want 102", len(p))
	}
	// First 6 bytes are 0xFF.
	if !bytes.Equal(p[:6], []byte{0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF}) {
		t.Errorf("header = % x, want six 0xFF", p[:6])
	}
	// Then the MAC repeated 16 times.
	for i := 0; i < 16; i++ {
		off := 6 + i*6
		if !bytes.Equal(p[off:off+6], hw) {
			t.Errorf("repetition %d = % x, want % x", i, p[off:off+6], hw)
		}
	}
}
