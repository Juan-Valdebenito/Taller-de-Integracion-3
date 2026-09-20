package db

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NewPool crea y verifica un pool de conexiones a PostgreSQL.
// Llama a log.Fatalf si la conexión falla.
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

// NewPoolOptional intenta conectar a PostgreSQL pero no mata el proceso si falla.
// Retorna nil si la conexión no está disponible.
// Usar cuando el servidor puede funcionar en modo degradado (ej: solo simulación).
func NewPoolOptional(databaseURL string) *pgxpool.Pool {
	pool, err := pgxpool.New(context.Background(), databaseURL)
	if err != nil {
		log.Printf("⚠️  Base de datos no disponible: %v", err)
		return nil
	}

	if err := pool.Ping(context.Background()); err != nil {
		log.Printf("⚠️  No se pudo conectar a PostgreSQL: %v", err)
		pool.Close()
		return nil
	}

	fmt.Println("✅ Conectado a PostgreSQL")
	return pool
}
