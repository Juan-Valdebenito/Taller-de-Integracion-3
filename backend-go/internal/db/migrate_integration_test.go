package db

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	appmigrations "github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/migrations"
)

// Tests de RunMigrations contra PostgreSQL real. Solo corren si
// TEST_DATABASE_URL apunta a un servidor de prueba: cada caso crea su propia
// base temporal (requiere permiso CREATEDB) y la borra al terminar.
//
//	TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres go test ./internal/db

const lastMigration = 3

func TestRunMigrationsFreshDatabase(t *testing.T) {
	ctx, dbURL, conn := tempDatabase(t)

	res := mustMigrate(t, ctx, dbURL)
	if res.Baseline != 0 || res.From != 0 || res.To != lastMigration {
		t.Fatalf("resultado = %+v, se esperaba de 0 a %d sin baseline", res, lastMigration)
	}
	// La 000003 suma lo que el código necesita y la 000001 no tenía.
	for _, col := range []string{"rating", "lineName"} {
		if !columnExists(t, conn, "complaints", col) {
			t.Errorf("falta complaints.%s", col)
		}
	}
	if !tableExists(t, conn, "recaudo_transactions") || !tableExists(t, conn, "complaint_attachments") {
		t.Error("faltan tablas después de migrar")
	}

	again := mustMigrate(t, ctx, dbURL)
	if again.Changed() || again.Baseline != 0 || again.To != lastMigration {
		t.Errorf("segunda corrida = %+v, no debía cambiar nada", again)
	}
}

func TestRunMigrationsLegacyDatabase(t *testing.T) {
	ctx, dbURL, conn := tempDatabase(t)
	execFile(t, conn, filepath.Join("..", "..", "..", "database_setup.sql"))

	res := mustMigrate(t, ctx, dbURL)
	if res.Baseline != 1 || res.From != 1 || res.To != lastMigration {
		t.Fatalf("resultado = %+v, se esperaba baseline 1 y llegar a %d", res, lastMigration)
	}
	// Los datos existentes se conservan (database_setup.sql crea company-demo).
	var name string
	if err := conn.QueryRowContext(ctx, `SELECT name FROM companies WHERE id = 'company-demo'`).Scan(&name); err != nil {
		t.Fatalf("se perdió la empresa de prueba: %v", err)
	}
	if !tableExists(t, conn, "complaint_attachments") {
		t.Error("no se creó complaint_attachments")
	}
}

func TestRunMigrationsLegacyDatabaseWithManualAttachments(t *testing.T) {
	ctx, dbURL, conn := tempDatabase(t)
	execFile(t, conn, filepath.Join("..", "..", "..", "database_setup.sql"))
	execMigration(t, conn, "000002_complaint_attachments.up.sql")

	res := mustMigrate(t, ctx, dbURL)
	if res.Baseline != 2 || res.From != 2 || res.To != lastMigration {
		t.Fatalf("resultado = %+v, se esperaba baseline 2 y llegar a %d", res, lastMigration)
	}
}

// Por cualquiera de los dos caminos la base debe quedar igual.
func TestRunMigrationsSchemasConverge(t *testing.T) {
	ctx, freshURL, fresh := tempDatabase(t)
	mustMigrate(t, ctx, freshURL)

	_, legacyURL, legacy := tempDatabase(t)
	execFile(t, legacy, filepath.Join("..", "..", "..", "database_setup.sql"))
	mustMigrate(t, ctx, legacyURL)

	a, b := schemaSnapshot(t, fresh), schemaSnapshot(t, legacy)
	for item := range a {
		if !b[item] {
			t.Errorf("solo en la base nueva: %s", item)
		}
	}
	for item := range b {
		if !a[item] {
			t.Errorf("solo en la base de database_setup.sql: %s", item)
		}
	}
}

func mustMigrate(t *testing.T, ctx context.Context, dbURL string) MigrationResult {
	t.Helper()
	res, err := RunMigrations(ctx, dbURL)
	if err != nil {
		t.Fatalf("RunMigrations: %v", err)
	}
	return res
}

// tempDatabase crea una base vacía en el servidor de TEST_DATABASE_URL.
func tempDatabase(t *testing.T) (context.Context, string, *sql.DB) {
	t.Helper()
	baseURL := os.Getenv("TEST_DATABASE_URL")
	if baseURL == "" {
		t.Skip("TEST_DATABASE_URL no definida: se omiten los tests de integración")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	t.Cleanup(cancel)

	admin, err := sql.Open("pgx", baseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { admin.Close() })

	suffix := make([]byte, 6)
	if _, err := rand.Read(suffix); err != nil {
		t.Fatal(err)
	}
	name := "transithub_migrate_test_" + hex.EncodeToString(suffix)
	if _, err := admin.ExecContext(ctx, `CREATE DATABASE `+name); err != nil {
		t.Fatalf("crear base temporal: %v", err)
	}
	t.Cleanup(func() {
		if _, err := admin.ExecContext(context.Background(), `DROP DATABASE IF EXISTS `+name+` WITH (FORCE)`); err != nil {
			t.Errorf("borrar base temporal %s: %v", name, err)
		}
	})

	u, err := url.Parse(baseURL)
	if err != nil {
		t.Fatal(err)
	}
	u.Path = "/" + name
	conn, err := sql.Open("pgx", u.String())
	if err != nil {
		t.Fatal(err)
	}
	// Se cierra antes del DROP (los Cleanup corren en orden inverso).
	t.Cleanup(func() { conn.Close() })
	return ctx, u.String(), conn
}

func execFile(t *testing.T, conn *sql.DB, path string) {
	t.Helper()
	script, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(string(script)); err != nil {
		t.Fatalf("aplicar %s: %v", filepath.Base(path), err)
	}
}

func execMigration(t *testing.T, conn *sql.DB, name string) {
	t.Helper()
	script, err := fs.ReadFile(appmigrations.Filesystem(), name)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(string(script)); err != nil {
		t.Fatalf("aplicar %s: %v", name, err)
	}
}

func tableExists(t *testing.T, conn *sql.DB, table string) bool {
	t.Helper()
	var ok bool
	if err := conn.QueryRow(`SELECT to_regclass($1) IS NOT NULL`, table).Scan(&ok); err != nil {
		t.Fatal(err)
	}
	return ok
}

func columnExists(t *testing.T, conn *sql.DB, table, column string) bool {
	t.Helper()
	var ok bool
	err := conn.QueryRow(`SELECT EXISTS (SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2)`, table, column).Scan(&ok)
	if err != nil {
		t.Fatal(err)
	}
	return ok
}

// schemaSnapshot lista columnas, ENUMs, índices y restricciones del esquema
// public (sin schema_migrations) para comparar dos bases.
func schemaSnapshot(t *testing.T, conn *sql.DB) map[string]bool {
	t.Helper()
	queries := []string{
		`SELECT 'col '||table_name||'.'||column_name||' '||udt_name||' '||is_nullable||' '||coalesce(column_default, '')
		 FROM information_schema.columns WHERE table_schema = 'public' AND table_name <> 'schema_migrations'`,
		`SELECT 'enum '||t.typname||' '||string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
		 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid GROUP BY t.typname`,
		`SELECT 'idx '||indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`,
		`SELECT 'con '||conrelid::regclass::text||' '||pg_get_constraintdef(oid) FROM pg_constraint
		 WHERE connamespace = 'public'::regnamespace AND conrelid::regclass::text <> 'schema_migrations'`,
		`SELECT 'trg '||event_object_table||' '||trigger_name FROM information_schema.triggers WHERE trigger_schema = 'public'`,
	}
	out := map[string]bool{}
	for _, q := range queries {
		rows, err := conn.Query(q)
		if err != nil {
			t.Fatal(err)
		}
		for rows.Next() {
			var item string
			if err := rows.Scan(&item); err != nil {
				t.Fatal(err)
			}
			out[strings.TrimSpace(item)] = true
		}
		if err := rows.Close(); err != nil {
			t.Fatal(err)
		}
	}
	return out
}
