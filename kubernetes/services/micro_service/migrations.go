package main

// Migraciones de la base de la red de transporte. Se aplican al iniciar, antes de
// cargar el grafo.

import (
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"log"
	"strconv"

	"github.com/golang-migrate/migrate/v4"
	migratepgx "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	"github.com/golang-migrate/migrate/v4/source"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	_ "github.com/jackc/pgx/v5/stdlib"
)

// migrationsTable tiene un nombre propio para no confundirse con la de backend-go.
const migrationsTable = "micro_schema_migrations"

//go:embed migrations/*.sql
var migrationFiles embed.FS

// migrationsEnabled lee MIGRATIONS_ENABLED. Sin valor, se aplican.
func migrationsEnabled(value string) (bool, error) {
	if value == "" {
		return true, nil
	}
	enabled, err := strconv.ParseBool(value)
	if err != nil {
		return false, fmt.Errorf("MIGRATIONS_ENABLED debe ser true o false: %q", value)
	}
	return enabled, nil
}

// prepareSchema aplica las migraciones pendientes, salvo que estén desactivadas.
func prepareSchema(databaseURL, enabledValue string) error {
	enabled, err := migrationsEnabled(enabledValue)
	if err != nil {
		return err
	}
	if !enabled {
		log.Print("migrations disabled")
		return nil
	}
	files, err := iofs.New(migrationFiles, "migrations")
	if err != nil {
		return fmt.Errorf("leer migraciones: %w", err)
	}
	fromVersion, toVersion, err := applyMigrations(databaseURL, files)
	if err != nil {
		return err
	}
	log.Printf("migrations ready: from version %d to %d", fromVersion, toVersion)
	return nil
}

// applyMigrations deja la base en la última versión. La librería usa un candado de
// PostgreSQL, así que dos réplicas pueden iniciar a la vez.
func applyMigrations(databaseURL string, files source.Driver) (fromVersion, toVersion uint, err error) {
	database, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return 0, 0, fmt.Errorf("abrir la base para migrar: %w", err)
	}
	driver, err := migratepgx.WithInstance(database, &migratepgx.Config{MigrationsTable: migrationsTable})
	if err != nil {
		database.Close()
		return 0, 0, fmt.Errorf("preparar la base para migrar: %w", err)
	}
	migrator, err := migrate.NewWithInstance("iofs", files, "pgx5", driver)
	if err != nil {
		driver.Close()
		return 0, 0, fmt.Errorf("preparar migraciones: %w", err)
	}
	defer migrator.Close()
	if fromVersion, err = schemaVersion(migrator); err != nil {
		return 0, 0, err
	}
	if err = migrator.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fromVersion, 0, fmt.Errorf("aplicar migraciones desde la versión %d: %w", fromVersion, err)
	}
	toVersion, err = schemaVersion(migrator)
	return fromVersion, toVersion, err
}

// schemaVersion es 0 si todavía no se ha aplicado ninguna.
func schemaVersion(migrator *migrate.Migrate) (uint, error) {
	version, isDirty, err := migrator.Version()
	if errors.Is(err, migrate.ErrNilVersion) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("leer la versión de la base: %w", err)
	}
	if isDirty {
		return version, fmt.Errorf("la migración %d quedó a medias: revisar la base y corregir %s", version, migrationsTable)
	}
	return version, nil
}
