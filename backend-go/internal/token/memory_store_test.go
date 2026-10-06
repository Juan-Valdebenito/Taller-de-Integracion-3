package token

import (
	"testing"
	"time"
)

func TestMemoryStore_RevokeAndIsRevoked(t *testing.T) {
	s := NewMemoryStore()
	defer s.Close()

	jti := "abc123"
	if revoked, err := s.IsRevoked(jti); err != nil || revoked {
		t.Fatalf("token no revocado debería reportar false, got revoked=%v err=%v", revoked, err)
	}

	if err := s.Revoke(jti, time.Now().Add(time.Hour)); err != nil {
		t.Fatalf("Revoke no debería fallar: %v", err)
	}

	if revoked, err := s.IsRevoked(jti); err != nil || !revoked {
		t.Fatalf("token revocado debería reportar true, got revoked=%v err=%v", revoked, err)
	}
}

func TestMemoryStore_RevokeAlreadyExpiredIsNoop(t *testing.T) {
	s := NewMemoryStore()
	defer s.Close()

	jti := "expired-token"
	if err := s.Revoke(jti, time.Now().Add(-time.Minute)); err != nil {
		t.Fatalf("Revoke no debería fallar: %v", err)
	}

	if s.Size() != 0 {
		t.Fatalf("un token ya expirado no debería agregarse al almacén, size=%d", s.Size())
	}
}

func TestMemoryStore_IsRevokedAfterNaturalExpiry(t *testing.T) {
	s := NewMemoryStore()
	defer s.Close()

	jti := "soon-to-expire"
	if err := s.Revoke(jti, time.Now().Add(10*time.Millisecond)); err != nil {
		t.Fatalf("Revoke no debería fallar: %v", err)
	}

	time.Sleep(20 * time.Millisecond)

	if revoked, err := s.IsRevoked(jti); err != nil || revoked {
		t.Fatalf("token expirado no debería seguir revocado, got revoked=%v err=%v", revoked, err)
	}
}

// Verificación en tiempo de compilación de que ambas implementaciones
// satisfacen la interfaz compartida usada por el middleware.
var (
	_ RevocationStore = (*MemoryStore)(nil)
	_ RevocationStore = (*RedisStore)(nil)
)
