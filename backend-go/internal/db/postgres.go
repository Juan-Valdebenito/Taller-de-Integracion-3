package db

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NewPool crea y verifica un pool de conexiones a PostgreSQL.
func NewPool(databaseURL string) *pgxpool.Pool {
	pool, err := pgxpool.New(context.Background(), databaseURL)
	if err != nil {
		log.Fatalf("❌ No se pudo crear el pool de conexiones: %v", err)
	}

	// Verificar conectividad
	if err := pool.Ping(context.Background()); err != nil {
		log.Fatalf("❌ No se pudo conectar a PostgreSQL: %v", err)
	}

	fmt.Println("✅ Conectado a PostgreSQL")
	return pool
}
