package api

import (
	"testing"
	"time"
)

// TestBroadcasterCloseUnblocks verifies Close() shuts subscriber channels so a
// blocked SSE receive returns promptly — the fix for shutdown hanging until
// SIGKILL on the long-lived /api/events connection.
func TestBroadcasterCloseUnblocks(t *testing.T) {
	b := NewBroadcaster()
	ch, _ := b.Subscribe()

	done := make(chan struct{})
	go func() {
		<-ch // blocks until Close() closes the channel
		close(done)
	}()

	b.Close()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("subscriber did not unblock after Close()")
	}
}

func TestSubscribeAfterCloseReturnsClosedChannel(t *testing.T) {
	b := NewBroadcaster()
	b.Close()
	ch, unsub := b.Subscribe()
	defer unsub()
	select {
	case _, ok := <-ch:
		if ok {
			t.Fatal("expected closed channel after Subscribe post-Close")
		}
	case <-time.After(time.Second):
		t.Fatal("Subscribe after Close should return an already-closed channel")
	}
	// Close is idempotent and Send is a no-op after close (must not panic).
	b.Close()
	b.Send(Event{Type: "config_changed"})
}
