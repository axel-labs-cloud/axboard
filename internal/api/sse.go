package api

import (
	"encoding/json"
	"sync"
)

// Event is what gets serialised over the SSE channel. The frontend's useSSE
// switch-cases on `type`.
type Event struct {
	Type  string         `json:"type"`
	Error *ConfigErrorJS `json:"error,omitempty"`
}

type ConfigErrorJS struct {
	Message string `json:"message"`
	Line    int    `json:"line,omitempty"`
	Column  int    `json:"column,omitempty"`
}

// Broadcaster fans Events out to all live SSE subscribers. Slow subscribers
// are dropped (non-blocking send) — the next event will catch them up.
type Broadcaster struct {
	mu          sync.RWMutex
	subscribers map[chan []byte]struct{}
}

func NewBroadcaster() *Broadcaster {
	return &Broadcaster{
		subscribers: make(map[chan []byte]struct{}),
	}
}

func (b *Broadcaster) Subscribe() (chan []byte, func()) {
	ch := make(chan []byte, 16)
	b.mu.Lock()
	b.subscribers[ch] = struct{}{}
	b.mu.Unlock()
	return ch, func() {
		b.mu.Lock()
		if _, ok := b.subscribers[ch]; ok {
			delete(b.subscribers, ch)
			close(ch)
		}
		b.mu.Unlock()
	}
}

func (b *Broadcaster) Send(e Event) {
	payload, err := json.Marshal(e)
	if err != nil {
		return
	}
	b.mu.RLock()
	defer b.mu.RUnlock()
	for ch := range b.subscribers {
		select {
		case ch <- payload:
		default:
		}
	}
}
