package filestore

import (
	"context"
	"testing"
)

func TestMemoryStoreContract(t *testing.T) {
	testStoreContract(t, func(*testing.T) Store { return NewMemoryStore() })
}

func TestMemoryStoreLen(t *testing.T) {
	s := NewMemoryStore()
	ctx := context.Background()
	if s.Len() != 0 {
		t.Fatalf("vacío: got %d", s.Len())
	}
	a, b := newKey(t, "comp-1"), newKey(t, "comp-1")
	_ = s.Put(ctx, a, []byte("a"))
	_ = s.Put(ctx, b, []byte("b"))
	if s.Len() != 2 {
		t.Fatalf("got %d, want 2", s.Len())
	}
	_ = s.Delete(ctx, a)
	if s.Len() != 1 {
		t.Fatalf("got %d, want 1", s.Len())
	}
}

// MemoryStore cumple la interfaz Store.
var _ Store = (*MemoryStore)(nil)
