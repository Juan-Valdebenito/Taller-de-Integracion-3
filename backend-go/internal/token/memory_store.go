package token

import (
	"sync"
	"time"
)

// entry representa un token revocado con su tiempo de expiración original.
type entry struct {
	exp time.Time
}

// MemoryStore es un RevocationStore en memoria del propio proceso.
// Usa el claim "jti" (JWT ID) como clave para evitar guardar el token completo.
// Solo mantiene tokens hasta su expiración natural: una vez que el token
// habría expirado de todas formas, se elimina automáticamente de la lista.
//
// Limitación: al vivir en memoria, no es consistente entre réplicas. Si el
// backend corre con más de un pod en el cluster, usar RedisStore en su lugar
// (ver token.NewStore) para que la revocación sea dinámica y visible en todos
// los pods al mismo tiempo.
type MemoryStore struct {
	mu      sync.RWMutex
	entries map[string]entry // jti → entry
	done    chan struct{}
}

// NewMemoryStore crea un MemoryStore vacío e inicia la limpieza en background.
func NewMemoryStore() *MemoryStore {
	s := &MemoryStore{
		entries: make(map[string]entry),
		done:    make(chan struct{}),
	}
	go s.runCleanup()
	return s
}

// Revoke añade un token al almacén dado su jti y tiempo de expiración.
// No hace nada si el token ya expiró (no tiene sentido guardarlo).
func (s *MemoryStore) Revoke(jti string, exp time.Time) error {
	if time.Now().After(exp) {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.entries[jti] = entry{exp: exp}
	return nil
}

// IsRevoked reporta si el token identificado por jti fue revocado y aún no expiró.
func (s *MemoryStore) IsRevoked(jti string) (bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	e, ok := s.entries[jti]
	if !ok {
		return false, nil
	}
	// Si ya expiró naturalmente, no es necesario bloquearlo
	// (el middleware JWT lo rechazará antes)
	return time.Now().Before(e.exp), nil
}

// Size retorna la cantidad de tokens actualmente en el almacén (útil para métricas).
func (s *MemoryStore) Size() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.entries)
}

// Close detiene la limpieza en background.
func (s *MemoryStore) Close() error {
	close(s.done)
	return nil
}

// runCleanup elimina en background las entradas cuyo token ya expiró.
// Corre cada 10 minutos para mantener bajo el uso de memoria.
func (s *MemoryStore) runCleanup() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			s.sweep()
		case <-s.done:
			return
		}
	}
}

func (s *MemoryStore) sweep() {
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	for jti, e := range s.entries {
		if now.After(e.exp) {
			delete(s.entries, jti)
		}
	}
}
