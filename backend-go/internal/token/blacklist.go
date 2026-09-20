package token

import (
	"sync"
	"time"
)

// entry representa un token revocado con su tiempo de expiración original.
type entry struct {
	exp time.Time
}

// Blacklist es un almacén en memoria de tokens JWT revocados.
// Usa el claim "jti" (JWT ID) como clave para evitar guardar el token completo.
// Solo mantiene tokens hasta su expiración natural: una vez que el token
// habría expirado de todas formas, se elimina automáticamente de la lista.
type Blacklist struct {
	mu      sync.RWMutex
	entries map[string]entry // jti → entry
}

// NewBlacklist crea una nueva Blacklist e inicia el proceso de limpieza en background.
func NewBlacklist() *Blacklist {
	bl := &Blacklist{
		entries: make(map[string]entry),
	}
	go bl.runCleanup()
	return bl
}

// Revoke añade un token al blacklist dado su jti y tiempo de expiración.
// Retorna inmediatamente si el token ya expiró (no tiene sentido agregarlo).
func (bl *Blacklist) Revoke(jti string, exp time.Time) {
	if time.Now().After(exp) {
		return
	}
	bl.mu.Lock()
	defer bl.mu.Unlock()
	bl.entries[jti] = entry{exp: exp}
}

// IsRevoked reporta si el token identificado por jti fue revocado y aún no expiró.
func (bl *Blacklist) IsRevoked(jti string) bool {
	bl.mu.RLock()
	defer bl.mu.RUnlock()
	e, ok := bl.entries[jti]
	if !ok {
		return false
	}
	// Si ya expiró naturalmente, no es necesario bloquearlo
	// (el middleware JWT lo rechazará antes)
	return time.Now().Before(e.exp)
}

// Size retorna la cantidad de tokens actualmente en el blacklist (útil para métricas).
func (bl *Blacklist) Size() int {
	bl.mu.RLock()
	defer bl.mu.RUnlock()
	return len(bl.entries)
}

// runCleanup elimina en background las entradas cuyo token ya expiró.
// Corre cada 10 minutos para mantener bajo el uso de memoria.
func (bl *Blacklist) runCleanup() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		bl.sweep()
	}
}

func (bl *Blacklist) sweep() {
	now := time.Now()
	bl.mu.Lock()
	defer bl.mu.Unlock()
	for jti, e := range bl.entries {
		if now.After(e.exp) {
			delete(bl.entries, jti)
		}
	}
}
