package main

// Migraciones contra PostgreSQL real. Solo corren si TEST_DATABASE_URL apunta a un
// servidor de prueba: cada prueba crea su propia base temporal y la borra.
//
//	TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres go test .
//
// Con PostGIS usan las migraciones tal cual. Sin él, reemplazan las geometrías por
// texto: comprueban todo menos las columnas espaciales.

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/url"
	"os"
	"path"
	"strings"
	"sync"
	"testing"
	"testing/fstest"

	"github.com/golang-migrate/migrate/v4/source"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/jackc/pgx/v5/pgxpool"
)

type migrationDatabase struct {
	url        string
	pool       *pgxpool.Pool
	hasPostGIS bool
}

func newMigrationDatabase(t *testing.T) migrationDatabase {
	t.Helper()
	serverURL := os.Getenv("TEST_DATABASE_URL")
	if serverURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	serverPool, err := pgxpool.New(ctx, serverURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(serverPool.Close)
	suffix := make([]byte, 6)
	if _, err := rand.Read(suffix); err != nil {
		t.Fatal(err)
	}
	name := "micro_migrate_test_" + hex.EncodeToString(suffix)
	if _, err := serverPool.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := serverPool.Exec(ctx, "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)"); err != nil {
			t.Errorf("could not drop %s: %v", name, err)
		}
	})
	databaseURL, err := url.Parse(serverURL)
	if err != nil {
		t.Fatal(err)
	}
	databaseURL.Path = "/" + name
	database := migrationDatabase{url: databaseURL.String()}
	if database.pool, err = pgxpool.New(ctx, database.url); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(database.pool.Close)
	if err := database.pool.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis')").Scan(&database.hasPostGIS); err != nil {
		t.Fatal(err)
	}
	return database
}

// script entrega una migración que este servidor puede ejecutar.
func (database migrationDatabase) script(t *testing.T, name string) string {
	script := readMigration(t, name)
	if database.hasPostGIS {
		return script
	}
	return strings.NewReplacer("CREATE EXTENSION IF NOT EXISTS postgis;", "", "GEOMETRY(Point, 4326)", "TEXT",
		"GEOMETRY(LineString, 4326)", "TEXT", "USING GIST(location)", "(location)").Replace(script)
}

func (database migrationDatabase) files(t *testing.T, extraFiles map[string]string) source.Driver {
	t.Helper()
	fileSystem := fstest.MapFS{}
	entries, err := migrationFiles.ReadDir("migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		fileSystem[path.Join("migrations", entry.Name())] = &fstest.MapFile{Data: []byte(database.script(t, entry.Name()))}
	}
	for name, content := range extraFiles {
		fileSystem[path.Join("migrations", name)] = &fstest.MapFile{Data: []byte(content)}
	}
	files, err := iofs.New(fileSystem, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	return files
}

func (database migrationDatabase) execute(t *testing.T, script string) {
	t.Helper()
	if _, err := database.pool.Exec(context.Background(), script); err != nil {
		t.Fatal(err)
	}
}

func (database migrationDatabase) count(t *testing.T, query string) (total int) {
	t.Helper()
	if err := database.pool.QueryRow(context.Background(), query).Scan(&total); err != nil {
		t.Fatal(err)
	}
	return total
}

func (database migrationDatabase) migrate(t *testing.T, expectedFrom, expectedTo uint) {
	t.Helper()
	from, to, err := applyMigrations(database.url, database.files(t, nil))
	if err != nil || from != expectedFrom || to != expectedTo {
		t.Fatalf("from %d to %d, err = %v; want from %d to %d", from, to, err, expectedFrom, expectedTo)
	}
}

const countTransitTables = `SELECT count(*) FROM information_schema.tables
	WHERE table_schema = 'public' AND table_name IN ('stops', 'routes', 'trips', 'route_stops', 'transfers')`

// Una base vacía queda completa, repetir no cambia nada y la bajada la deja vacía.
func TestMigrateEmptyDatabase(t *testing.T) {
	database := newMigrationDatabase(t)
	database.migrate(t, 0, 1)
	database.migrate(t, 1, 1)
	if total := database.count(t, countTransitTables); total != 5 {
		t.Fatalf("%d tables, want 5", total)
	}
	database.execute(t, database.script(t, "000001_transit_schema.down.sql"))
	if total := database.count(t, countTransitTables); total != 0 {
		t.Fatalf("%d tables after the down migration", total)
	}
}

// Una base creada con los scripts iniciales conserva sus datos, y la de backend-go
// puede tener su propia tabla de versiones.
func TestMigrateExistingDatabase(t *testing.T) {
	database := newMigrationDatabase(t)
	database.execute(t, database.script(t, "000001_transit_schema.up.sql"))
	location := "'punto'"
	if database.hasPostGIS {
		location = "ST_SetSRID(ST_MakePoint(-72.6, -38.7), 4326)"
	}
	database.execute(t, `CREATE TABLE schema_migrations (version bigint PRIMARY KEY, dirty boolean NOT NULL);
		INSERT INTO schema_migrations VALUES (4, false);
		INSERT INTO stops (stop_id, stop_name, location) VALUES ('A', 'A', `+location+`), ('B', 'B', `+location+`);
		INSERT INTO routes (route_id, route_short_name, route_long_name) VALUES ('L1', '1', '1');
		INSERT INTO trips (trip_id, route_id, direction) VALUES ('L1-IDA', 'L1', 'IDA');
		INSERT INTO route_stops VALUES ('L1-IDA', 'A', 'B', 1, 300, 1000);
		INSERT INTO transfers VALUES ('A', 'B', 120, 180)`)
	database.migrate(t, 0, 1)
	if total := database.count(t, "SELECT base_travel_time_seconds + walk_time_seconds FROM route_stops, transfers"); total != 420 {
		t.Fatalf("times = %d, want 420", total)
	}
	if version := database.count(t, "SELECT version FROM schema_migrations"); version != 4 {
		t.Fatalf("the backend-go version changed to %d", version)
	}
}

// Varias réplicas que inician a la vez no chocan.
func TestMigrateConcurrently(t *testing.T) {
	database := newMigrationDatabase(t)
	var replicas sync.WaitGroup
	for range 4 {
		files := database.files(t, nil)
		replicas.Add(1)
		go func() {
			defer replicas.Done()
			if _, to, err := applyMigrations(database.url, files); err != nil || to != 1 {
				t.Errorf("to %d, err = %v", to, err)
			}
		}()
	}
	replicas.Wait()
}

// Una migración con errores detiene el inicio, y los siguientes también fallan hasta
// que alguien revise la base.
func TestMigrateStopsOnBrokenMigration(t *testing.T) {
	database := newMigrationDatabase(t)
	broken := map[string]string{"000002_broken.up.sql": "ALTER TABLE missing ADD COLUMN extra INT;", "000002_broken.down.sql": "SELECT 1;"}
	for range 2 {
		if _, _, err := applyMigrations(database.url, database.files(t, broken)); err == nil {
			t.Fatal("a broken migration was accepted")
		}
	}
	if total := database.count(t, countTransitTables); total != 5 {
		t.Fatalf("%d tables, want the first migration applied", total)
	}
}
