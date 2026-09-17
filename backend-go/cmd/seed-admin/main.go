// Command seed-admin crea o restablece los datos de prueba (admin, empresa,
// pasajero, ruta y bus demo) manualmente. Desde la versión que auto-siembra
// al arrancar "go run ./cmd/server" en desarrollo, este comando ya no es
// obligatorio, pero se conserva para forzar el reseed sin reiniciar el server.
//
// Ejecutar desde backend-go:
//
//	go run ./cmd/seed-admin
package main

import (
	"context"
	"log"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/config"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/db"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/seed"
)

func main() {
	cfg := config.Load()
	pool := db.NewPool(cfg.DatabaseURL)
	defer pool.Close()

	if err := seed.Run(context.Background(), pool); err != nil {
		log.Fatalf("no se pudieron crear los datos de prueba: %v", err)
	}
}
