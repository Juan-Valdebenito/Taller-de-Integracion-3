package token

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// redisKeyPrefix evita colisiones si el mismo Redis se comparte con otros
// datos del cluster (cache de sesiones, rate limiting, etc.).
const redisKeyPrefix = "jwt:revoked:"

// pingTimeout acota cuánto se espera al verificar la conexión al arrancar.
const pingTimeout = 5 * time.Second

// RedisStore es un RevocationStore respaldado por Redis. Al ser un almacén
// externo compartido, todas las réplicas del backend en el cluster ven la
// misma revocación de forma inmediata: es lo que hace "dinámica" la
// revocación en un despliegue con múltiples pods, a diferencia de MemoryStore.
//
// Se usa TTL nativo de Redis (igual al tiempo restante de vida del token)
// para que las entradas se autolimpien sin necesidad de un proceso de barrido
// como el de MemoryStore.
type RedisStore struct {
	client *redis.Client
}

// NewRedisStore conecta contra addr (host:port) y verifica la conexión con
// un PING antes de devolver el store, para que un Redis inalcanzable falle
// rápido en el arranque en vez de degradar silenciosamente la seguridad de
// la revocación.
func NewRedisStore(addr, password string, db int) (*RedisStore, error) {
	client := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       db,
	})

	ctx, cancel := context.WithTimeout(context.Background(), pingTimeout)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		_ = client.Close()
		return nil, fmt.Errorf("no se pudo conectar a Redis en %s: %w", addr, err)
	}

	return &RedisStore{client: client}, nil
}

// Revoke marca el jti como revocado en Redis con TTL hasta su expiración.
// No hace nada si el token ya expiró.
func (s *RedisStore) Revoke(jti string, exp time.Time) error {
	ttl := time.Until(exp)
	if ttl <= 0 {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), pingTimeout)
	defer cancel()
	return s.client.Set(ctx, redisKeyPrefix+jti, "1", ttl).Err()
}

// IsRevoked reporta si el jti existe como clave revocada en Redis.
func (s *RedisStore) IsRevoked(jti string) (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), pingTimeout)
	defer cancel()
	_, err := s.client.Get(ctx, redisKeyPrefix+jti).Result()
	if errors.Is(err, redis.Nil) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// Close cierra la conexión con Redis.
func (s *RedisStore) Close() error {
	return s.client.Close()
}
