package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	_ "github.com/jackc/pgx/v5/stdlib"

	appmigrations "github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/migrations"
)

// migrationLockKey identifica el candado de PostgreSQL que impide que dos
// réplicas del backend preparen la misma base al mismo tiempo.
const migrationLockKey int64 = 0x7472616e73697401

// MigrationResult resume lo que hizo RunMigrations.
type MigrationResult struct {
	// Baseline es la versión asignada a una base que ya tenía tablas pero no
	// schema_migrations (creada con database_setup.sql o la 000001 a mano).
	// 0 si no hizo falta.
	Baseline uint
	From     uint
	To       uint
}

// Changed indica si se aplicó alguna migración.
func (r MigrationResult) Changed() bool { return r.From != r.To }

// RunMigrations aplica las migraciones pendientes de internal/migrations.
//
// Una base creada a mano (con database_setup.sql o aplicando la 000001 con psql)
// ya tiene lo de la 000001 (y la 000002 si se aplicó a mano), pero no la tabla
// schema_migrations: correr todo
// desde cero fallaría con "ya existe". En ese caso primero se marca como si
// tuviera esas migraciones y después se aplican solo las que faltan.
func RunMigrations(ctx context.Context, databaseURL string) (MigrationResult, error) {
	var res MigrationResult

	// El candado va en su propia conexión: m.Close() cierra también sqlDB.
	lockDB, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return res, fmt.Errorf("abrir conexión para migraciones: %w", err)
	}
	defer lockDB.Close()
	lock, err := lockDB.Conn(ctx)
	if err != nil {
		return res, fmt.Errorf("conectar para migraciones: %w", err)
	}
	defer lock.Close()
	if _, err := lock.ExecContext(ctx, `SELECT pg_advisory_lock($1)`, migrationLockKey); err != nil {
		return res, fmt.Errorf("tomar candado de migraciones: %w", err)
	}
	defer lock.ExecContext(context.WithoutCancel(ctx), `SELECT pg_advisory_unlock($1)`, migrationLockKey)

	// Antes de crear el driver: postgres.WithInstance crea schema_migrations.
	baseline, err := legacyBaseline(ctx, lock)
	if err != nil {
		return res, err
	}

	source, err := iofs.New(appmigrations.Filesystem(), ".")
	if err != nil {
		return res, fmt.Errorf("leer migraciones embebidas: %w", err)
	}
	sqlDB, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return res, fmt.Errorf("abrir conexión para migraciones: %w", err)
	}
	driver, err := postgres.WithInstance(sqlDB, &postgres.Config{})
	if err != nil {
		sqlDB.Close()
		return res, fmt.Errorf("preparar driver de migraciones: %w", err)
	}
	m, err := migrate.NewWithInstance("iofs", source, "postgres", driver)
	if err != nil {
		driver.Close()
		return res, fmt.Errorf("preparar migraciones: %w", err)
	}
	defer m.Close()

	if baseline > 0 {
		if err := m.Force(int(baseline)); err != nil {
			return res, fmt.Errorf("marcar base existente en la versión %d: %w", baseline, err)
		}
		res.Baseline = baseline
	}

	res.From, err = currentVersion(m)
	if err != nil {
		return res, err
	}
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return res, fmt.Errorf("aplicar migraciones desde la versión %d: %w", res.From, err)
	}
	res.To, err = currentVersion(m)
	return res, err
}

// legacyBaseline devuelve la versión que corresponde a una base creada a mano,
// o 0 si la base está vacía o ya la manejan las migraciones.
func legacyBaseline(ctx context.Context, conn *sql.Conn) (uint, error) {
	var hasVersionTable, hasUsers, hasAttachments bool
	err := conn.QueryRowContext(ctx, `
		SELECT to_regclass('schema_migrations') IS NOT NULL,
		       to_regclass('users') IS NOT NULL,
		       to_regclass('complaint_attachments') IS NOT NULL`,
	).Scan(&hasVersionTable, &hasUsers, &hasAttachments)
	if err != nil {
		return 0, fmt.Errorf("revisar esquema existente: %w", err)
	}
	if hasVersionTable {
		var versions int
		if err := conn.QueryRowContext(ctx, `SELECT count(*) FROM schema_migrations`).Scan(&versions); err != nil {
			return 0, fmt.Errorf("leer schema_migrations: %w", err)
		}
		if versions > 0 {
			return 0, nil
		}
	}
	if !hasUsers {
		return 0, nil
	}
	if hasAttachments {
		return 2, nil
	}
	return 1, nil
}

func currentVersion(m *migrate.Migrate) (uint, error) {
	v, dirty, err := m.Version()
	if errors.Is(err, migrate.ErrNilVersion) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("leer versión de la base: %w", err)
	}
	if dirty {
		return v, fmt.Errorf("la migración %d quedó a medias (dirty): revisar la base y corregir schema_migrations", v)
	}
	return v, nil
}
