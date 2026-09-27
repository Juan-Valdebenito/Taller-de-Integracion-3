package db

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

// NewPool crea y verifica un pool de conexiones a PostgreSQL.
// Termina el proceso si la conexión falla.
func NewPool(databaseURL string) *pgxpool.Pool {
	pool, err := pgxpool.New(context.Background(), databaseURL)
	if err != nil {
		log.Fatal().Err(err).Str("event", "database_pool_failed").Msg("Could not create database pool")
	}

	// Verificar conectividad
	if err := pool.Ping(context.Background()); err != nil {
		log.Fatal().Err(err).Str("event", "database_connection_failed").Msg("Could not connect to PostgreSQL")
	}

	log.Info().Str("event", "database_connected").Msg("Connected to PostgreSQL")
	return pool
}

// NewPoolOptional intenta conectar a PostgreSQL pero no mata el proceso si falla.
// Retorna nil si la conexión no está disponible.
// Usar cuando el servidor puede funcionar en modo degradado (ej: solo simulación).
func NewPoolOptional(databaseURL string) *pgxpool.Pool {
	pool, err := pgxpool.New(context.Background(), databaseURL)
	if err != nil {
		log.Warn().Err(err).Str("event", "database_pool_unavailable").Msg("Database unavailable")
		return nil
	}

	if err := pool.Ping(context.Background()); err != nil {
		log.Warn().Err(err).Str("event", "database_connection_unavailable").Msg("Could not connect to PostgreSQL")
		pool.Close()
		return nil
	}

	log.Info().Str("event", "database_connected").Msg("Connected to PostgreSQL")
	return pool
}
