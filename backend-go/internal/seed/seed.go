// Package seed crea/actualiza datos de prueba (admin, empresa, pasajero,
// ruta y bus demo) para poder probar la app apenas se levanta el servidor.
package seed

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

const (
	AdminEmail    = "admin@transporte.cl"
	AdminPassword = "admin12345"

	CompanyUserEmail    = "empresa@transporte.cl"
	CompanyUserPassword = "empresa12345"

	PassengerEmail    = "carlos.pasajero@gmail.com"
	PassengerPassword = "Pasajero1234!"

	DemoCompanyID = "company-demo"
	DemoRouteID   = "route-demo"
	DemoBusID     = "bus-demo"
)

// Run crea o actualiza los datos de prueba. Es idempotente: se puede
// llamar cada vez que arranca el servidor sin duplicar nada.
func Run(ctx context.Context, pool *pgxpool.Pool) error {
	if err := hashAndUpsertUser(ctx, pool, "Administrador Sistema", AdminEmail, AdminPassword, "ADMIN", nil); err != nil {
		return fmt.Errorf("seed admin: %w", err)
	}

	if _, err := pool.Exec(ctx, `
		INSERT INTO companies (id, name, rut, email)
		VALUES ($1, 'Empresa Demo', '76000000-0', 'demo@empresa.cl')
		ON CONFLICT (id) DO NOTHING
	`, DemoCompanyID); err != nil {
		return fmt.Errorf("seed company: %w", err)
	}

	companyID := DemoCompanyID
	if err := hashAndUpsertUser(ctx, pool, "Operador Empresa Demo", CompanyUserEmail, CompanyUserPassword, "COMPANY", &companyID); err != nil {
		return fmt.Errorf("seed company user: %w", err)
	}

	if err := hashAndUpsertUser(ctx, pool, "Carlos Pasajero", PassengerEmail, PassengerPassword, "PASSENGER", nil); err != nil {
		return fmt.Errorf("seed passenger: %w", err)
	}

	if _, err := pool.Exec(ctx, `
		INSERT INTO routes (id, name, code, description, "isActive", "companyId")
		VALUES ($1, 'Línea 1 Centro', 'L1-DEMO', 'Ruta de prueba generada automáticamente', TRUE, $2)
		ON CONFLICT (id) DO UPDATE
		SET name = EXCLUDED.name, "companyId" = EXCLUDED."companyId"
	`, DemoRouteID, DemoCompanyID); err != nil {
		return fmt.Errorf("seed route: %w", err)
	}

	if _, err := pool.Exec(ctx, `
		INSERT INTO buses (id, patente, "companyId", "routeId")
		VALUES ($1, 'DEMO-01', $2, $3)
		ON CONFLICT (id) DO UPDATE
		SET "companyId" = EXCLUDED."companyId", "routeId" = EXCLUDED."routeId"
	`, DemoBusID, DemoCompanyID, DemoRouteID); err != nil {
		return fmt.Errorf("seed bus: %w", err)
	}

	fmt.Println("🌱  Datos de prueba listos:")
	fmt.Printf("    Admin:     %s / %s\n", AdminEmail, AdminPassword)
	fmt.Printf("    Empresa:   %s / %s\n", CompanyUserEmail, CompanyUserPassword)
	fmt.Printf("    Pasajero:  %s / %s\n", PassengerEmail, PassengerPassword)

	return nil
}

func hashAndUpsertUser(ctx context.Context, pool *pgxpool.Pool, name, email, password, role string, companyID *string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO users (id, name, email, "passwordHash", role, "isActive", "companyId", "createdAt", "updatedAt")
		VALUES (gen_random_uuid()::TEXT, $1, $2, $3, $4, TRUE, $5, NOW(), NOW())
		ON CONFLICT (email) DO UPDATE
		SET name = EXCLUDED.name,
			"passwordHash" = EXCLUDED."passwordHash",
			role = EXCLUDED.role,
			"isActive" = TRUE,
			"companyId" = EXCLUDED."companyId",
			"updatedAt" = NOW()
	`, name, email, string(hash), role, companyID)
	return err
}
