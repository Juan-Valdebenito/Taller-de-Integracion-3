package db

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/security"
)

// AutoMigrateAndSeed asegura que las columnas necesarias existan en PostgreSQL
// y puebla automáticamente datos de prueba (empresas, usuarios, rutas, buses y reclamos)
// cuando el entorno es "development".
func AutoMigrateAndSeed(ctx context.Context, pool *pgxpool.Pool, env string) error {
	// ── 1. Migración automática de columnas para Reclamos ──────────────────────
	migrationSQL := `
		ALTER TABLE complaints ADD COLUMN IF NOT EXISTS rating INT;
		ALTER TABLE complaints ADD COLUMN IF NOT EXISTS "lineName" TEXT;
		ALTER TABLE complaints ADD COLUMN IF NOT EXISTS "tripId" TEXT;
		ALTER TABLE complaints ADD COLUMN IF NOT EXISTS "busId" TEXT;
		ALTER TABLE complaints ADD COLUMN IF NOT EXISTS "routeId" TEXT;
		ALTER TABLE complaints ADD COLUMN IF NOT EXISTS "companyId" TEXT;
		CREATE INDEX IF NOT EXISTS idx_complaints_rating ON complaints(rating);
		CREATE INDEX IF NOT EXISTS idx_complaints_linename ON complaints("lineName");

		CREATE TABLE IF NOT EXISTS recaudo_transactions (
			id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
			"busId" TEXT NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
			"cardUid" TEXT NOT NULL,
			"fareType" TEXT NOT NULL,
			amount INTEGER NOT NULL,
			status TEXT NOT NULL DEFAULT 'APPROVED',
			"routeId" TEXT REFERENCES routes(id) ON DELETE SET NULL,
			"tripId" TEXT REFERENCES trips(id) ON DELETE SET NULL,
			latitude FLOAT8,
			longitude FLOAT8,
			"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_recaudo_bus ON recaudo_transactions("busId");
		CREATE INDEX IF NOT EXISTS idx_recaudo_faretype ON recaudo_transactions("fareType");
		CREATE INDEX IF NOT EXISTS idx_recaudo_created ON recaudo_transactions("createdAt" DESC);
	`
	if _, err := pool.Exec(ctx, migrationSQL); err != nil {
		log.Printf("⚠️  Aviso en auto-migración de tablas: %v", err)
	} else {
		fmt.Println("✅ Migración verificada: tablas 'complaints' y 'recaudo_transactions' listas en PostgreSQL")
	}

	// ── 2. Solo ejecutar seeder en entorno de desarrollo ────────────────────────
	if env != "development" && env != "dev" && env != "" {
		return nil
	}

	// Verificar si ya existen reclamos para saber si el seed completo ya corrió
	var complaintCount int
	err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM complaints`).Scan(&complaintCount)
	if err == nil && complaintCount > 0 {
		fmt.Printf("🌱 Base de datos ya poblada (%d reclamos de prueba existentes). Omitiendo seed.\n", complaintCount)
		return nil
	}

	fmt.Println("🌱 Iniciando seeder automático en Go para entorno de desarrollo...")

	// ── 3. Empresa ──────────────────────────────────────────────────────────────
	companyID := "comp-temuco-01"
	_, err = pool.Exec(ctx, `
		INSERT INTO companies (id, name, rut, address, phone, email, "isActive", "createdAt", "updatedAt")
		VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW(), NOW())
		ON CONFLICT (rut) DO NOTHING
	`, companyID, "Buses del Norte S.A.", "76.123.456-7", "Av. Arturo Prat 1234, Temuco", "+56 57 2 234567", "contacto@busesdelnorte.cl")
	if err != nil {
		return fmt.Errorf("error al insertar empresa: %w", err)
	}

	// ── 4. Usuarios con contraseñas bcrypt ───────────────────────────────────────
	passwords := map[string]string{
		"admin@transporte.cl":        "Admin1234!",
		"operador@busesdelnorte.cl":  "Operador1234!",
		"juan.perez@gmail.com":       "Pasajero1234!",
		"maria.gonzalez@gmail.com":    "Pasajero5678!",
	}

	hashes := make(map[string]string)
	for email, pass := range passwords {
		hash, err := security.HashPassword(pass)
		if err != nil {
			return fmt.Errorf("error generando hash bcrypt para %s: %w", email, err)
		}
		hashes[email] = string(hash)
	}

	users := []struct {
		id        string
		name      string
		email     string
		role      string
		companyID *string
	}{
		{"usr-admin-01", "Administrador Sistema", "admin@transporte.cl", "ADMIN", nil},
		{"usr-oper-01", "Carlos Operador", "operador@busesdelnorte.cl", "COMPANY", &companyID},
		{"usr-pass-01", "Juan Pérez", "juan.perez@gmail.com", "PASSENGER", nil},
		{"usr-pass-02", "María González", "maria.gonzalez@gmail.com", "PASSENGER", nil},
	}

	for _, u := range users {
		_, err = pool.Exec(ctx, `
			INSERT INTO users (id, name, email, "passwordHash", role, "isActive", "companyId", "createdAt", "updatedAt")
			VALUES ($1, $2, $3, $4, $5, TRUE, $6, NOW(), NOW())
			ON CONFLICT (email) DO NOTHING
		`, u.id, u.name, u.email, hashes[u.email], u.role, u.companyID)
		if err != nil {
			return fmt.Errorf("error insertando usuario %s: %w", u.email, err)
		}
	}
	fmt.Println("   ✅ Usuarios creados (Admin, Operador, Pasajeros con bcrypt)")

	// ── 5. Rutas ────────────────────────────────────────────────────────────────
	routes := []struct {
		id          string
		name        string
		code        string
		description string
	}{
		{"route-7a", "Línea 7A - Cajón / Santa Rosa", "7A", "Recorrido troncal Cajón - Centro - Santa Rosa"},
		{"route-7b", "Línea 7B - San Antonio / Amanecer", "7B", "Recorrido transversal San Antonio - Centro - Amanecer"},
		{"route-1c", "Línea 1C - Labranza / Centro", "1C", "Recorrido interurbano Labranza - Av. Alemania - Centro"},
	}

	for _, r := range routes {
		_, err = pool.Exec(ctx, `
			INSERT INTO routes (id, name, code, description, "companyId", "isActive", "createdAt", "updatedAt")
			VALUES ($1, $2, $3, $4, $5, TRUE, NOW(), NOW())
			ON CONFLICT (id) DO NOTHING
		`, r.id, r.name, r.code, r.description, companyID)
		if err != nil {
			return fmt.Errorf("error insertando ruta %s: %w", r.code, err)
		}
	}
	fmt.Println("   ✅ Rutas creadas (Líneas 7A, 7B, 1C)")

	// ── 6. Buses ────────────────────────────────────────────────────────────────
	buses := []struct {
		id       string
		patente  string
		capacity int
		routeID  string
	}{
		{"bus-7a-01", "ABCD-12", 35, "route-7a"},
		{"bus-7a-02", "EFGH-34", 35, "route-7a"},
		{"bus-7b-01", "IJKL-56", 35, "route-7b"},
		{"bus-1c-01", "MNOP-78", 35, "route-1c"},
	}

	for _, b := range buses {
		_, err = pool.Exec(ctx, `
			INSERT INTO buses (id, patente, capacity, status, "companyId", "routeId", "createdAt", "updatedAt")
			VALUES ($1, $2, $3, 'ACTIVE', $4, $5, NOW(), NOW())
			ON CONFLICT (id) DO NOTHING
		`, b.id, b.patente, b.capacity, companyID, b.routeID)
		if err != nil {
			return fmt.Errorf("error insertando bus %s: %w", b.patente, err)
		}
	}
	fmt.Println("   ✅ Buses creados (Flota asignada con capacidad y patentes)")

	// ── 7. Reclamos iniciales con rating y lineName ─────────────────────────────
	r1 := 2
	l1 := "7A"
	b1 := "bus-7a-01"
	rt1 := "route-7a"

	r2 := 1
	l2 := "1C"
	b2 := "bus-1c-01"
	rt2 := "route-1c"
	resp2 := "En revisión con la central de despacho para verificar telemetría GPS."

	r3 := 5
	l3 := "7B"
	b3 := "bus-7b-01"
	rt3 := "route-7b"
	resp3 := "Muchas gracias por sus comentarios cordiales."

	complaints := []struct {
		id          string
		title       string
		description string
		category    string
		status      string
		rating      *int
		lineName    *string
		resp        *string
		passengerID string
		busID       *string
		routeID     *string
	}{
		{
			"comp-seed-01", "Exceso de aforo en hora punta",
			"El microbús de la Línea 7A iba sobrecargado con más de 35 pasajeros. Las puertas apenas cerraban.",
			"OVERCROWDING", "PENDING", &r1, &l1, nil, "usr-pass-01", &b1, &rt1,
		},
		{
			"comp-seed-02", "Demora excesiva en paradero Av. Alemania",
			"Esperé más de 30 minutos la micro Línea 1C cuando la frecuencia en la app indicaba 12 minutos.",
			"DELAY", "IN_REVIEW", &r2, &l2, &resp2, "usr-pass-01", &b2, &rt2,
		},
		{
			"comp-seed-03", "Excelente servicio y puntualidad",
			"Microbús impecable y conductor respetuoso con tarifa escolar.",
			"OTHER", "RESOLVED", &r3, &l3, &resp3, "usr-pass-02", &b3, &rt3,
		},
	}

	for _, c := range complaints {
		_, err = pool.Exec(ctx, `
			INSERT INTO complaints (
				id, title, description, category, status, rating, "lineName", "adminResponse",
				"passengerId", "busId", "routeId", "companyId", "createdAt", "updatedAt"
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8,
				$9, $10, $11, $12, NOW(), NOW()
			)
			ON CONFLICT (id) DO NOTHING
		`, c.id, c.title, c.description, c.category, c.status, c.rating, c.lineName, c.resp,
			c.passengerID, c.busID, c.routeID, companyID)
		if err != nil {
			return fmt.Errorf("error insertando reclamo %s: %w", c.id, err)
		}
	}
	fmt.Println("   ✅ Reclamos de prueba creados con calificación de estrellas y líneas")
	fmt.Println("🎉 Seeder en Go completado exitosamente.")

	return nil
}
