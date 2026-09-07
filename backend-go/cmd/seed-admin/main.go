// Command seed-admin crea o restablece la cuenta administrativa inicial.
//
// Ejecutar desde backend-go:
//
//	go run ./cmd/seed-admin
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/config"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/db"
	"golang.org/x/crypto/bcrypt"
)

const (
	adminName     = "Administrador Sistema"
	adminEmail    = "admin@transporte.cl"
	adminPassword = "admin12345"
)

func main() {
	cfg := config.Load()
	pool := db.NewPool(cfg.DatabaseURL)
	defer pool.Close()

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(adminPassword), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("no se pudo generar la contraseña del administrador: %v", err)
	}

	_, err = pool.Exec(context.Background(), `
		INSERT INTO users (id, name, email, "passwordHash", role, "isActive", "createdAt", "updatedAt")
		VALUES (gen_random_uuid()::TEXT, $1, $2, $3, 'ADMIN', TRUE, NOW(), NOW())
		ON CONFLICT (email) DO UPDATE
		SET name = EXCLUDED.name,
			"passwordHash" = EXCLUDED."passwordHash",
			role = 'ADMIN',
			"isActive" = TRUE,
			"updatedAt" = NOW()
	`, adminName, adminEmail, string(passwordHash))
	if err != nil {
		log.Fatalf("no se pudo crear o restablecer el administrador: %v", err)
	}

	fmt.Printf("Administrador listo: %s\n", adminEmail)
}
