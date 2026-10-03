package token

import "time"

// RevocationStore abstrae el almacén donde se registran los JWT revocados
// (logout, revocación forzada por un admin, cambio de contraseña, etc.).
//
// Existen dos implementaciones:
//   - MemoryStore: almacén en memoria del propio proceso. Solo es consistente
//     dentro de un único pod, por lo que un token revocado en una réplica
//     seguiría siendo válido en las demás.
//   - RedisStore: almacén compartido. Al vivir fuera del proceso, todas las
//     réplicas del backend en el cluster ven la misma revocación de forma
//     inmediata ("revocación dinámica" entre pods).
//
// El middleware y los handlers de auth dependen únicamente de esta interfaz,
// nunca de una implementación concreta, para poder intercambiarlas según el
// entorno (ver token.NewStore).
type RevocationStore interface {
	// Revoke marca el token identificado por jti como revocado hasta su
	// expiración natural (exp). No hace nada si el token ya expiró.
	Revoke(jti string, exp time.Time) error

	// IsRevoked reporta si el token identificado por jti fue revocado y aún
	// no ha expirado.
	IsRevoked(jti string) (bool, error)

	// Close libera los recursos del almacén (conexiones, goroutines, etc.).
	Close() error
}

// StoreOptions configura la creación del RevocationStore vía NewStore.
type StoreOptions struct {
	// RedisAddr es la dirección host:port del Redis compartido del cluster
	// (ej. "redis-svc.student-jvaldebenito.svc.cluster.local:6379").
	// Si está vacío, se usa MemoryStore (válido solo para desarrollo local
	// o despliegues de una sola réplica).
	RedisAddr     string
	RedisPassword string
	RedisDB       int
}

// NewStore crea el RevocationStore adecuado según la configuración:
//   - RedisAddr vacío  → MemoryStore (una sola réplica / desarrollo local).
//   - RedisAddr seteado → RedisStore, verificando la conexión con un PING.
//
// Se devuelve error si se configuró Redis pero no se pudo conectar, para que
// el arranque falle rápido en vez de degradar silenciosamente la seguridad
// de la revocación en un despliegue con múltiples réplicas.
func NewStore(opts StoreOptions) (RevocationStore, error) {
	if opts.RedisAddr == "" {
		return NewMemoryStore(), nil
	}
	return NewRedisStore(opts.RedisAddr, opts.RedisPassword, opts.RedisDB)
}
