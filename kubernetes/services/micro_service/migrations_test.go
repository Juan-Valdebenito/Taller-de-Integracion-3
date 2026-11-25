package main

import (
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func readMigration(t *testing.T, name string) string {
	t.Helper()
	content, err := fs.ReadFile(migrationFiles, path.Join("migrations", name))
	if err != nil {
		t.Fatal(err)
	}
	return string(content)
}

// Cada migración tiene subida y bajada, y la numeración no se salta.
func TestMigrationsArePairedAndSequential(t *testing.T) {
	entries, err := fs.ReadDir(migrationFiles, "migrations")
	if err != nil || len(entries) == 0 || len(entries)%2 != 0 {
		t.Fatalf("%d files, err = %v", len(entries), err)
	}
	namePattern := regexp.MustCompile(`^(\d{6})_([a-z0-9_]+)\.(up|down)\.sql$`)
	for entryIndex := 0; entryIndex < len(entries); entryIndex += 2 {
		// Se listan en orden alfabético: la bajada va antes que la subida.
		down := namePattern.FindStringSubmatch(entries[entryIndex].Name())
		up := namePattern.FindStringSubmatch(entries[entryIndex+1].Name())
		if down == nil || up == nil || down[1] != up[1] || down[2] != up[2] || down[3] != "down" || up[3] != "up" {
			t.Fatalf("not a pair: %s and %s", entries[entryIndex].Name(), entries[entryIndex+1].Name())
		}
		if expected := fmt.Sprintf("%06d", entryIndex/2+1); up[1] != expected {
			t.Errorf("version %s, want %s", up[1], expected)
		}
	}
}

// statementsOf quita comentarios y espacios, para comparar solo las instrucciones.
func statementsOf(script string) string {
	withoutComments := regexp.MustCompile(`--[^\n]*`).ReplaceAllString(script, "")
	return strings.Join(strings.Fields(withoutComments), " ")
}

// Los scripts iniciales crean las mismas tablas que la primera migración. Si no, una
// base nueva del cluster quedaría distinta, porque la migración no toca lo que existe.
func TestInitialScriptsMatchFirstMigration(t *testing.T) {
	expected := statementsOf(readMigration(t, "000001_transit_schema.up.sql"))
	initScript, err := os.ReadFile(filepath.Join("init-scripts", "01_schema.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if statementsOf(string(initScript)) != expected {
		t.Error("init-scripts/01_schema.sql does not match")
	}
	configMap, err := os.ReadFile(filepath.Join("..", "micro_db", "micros-db-init-scripts.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	_, schema, _ := strings.Cut(strings.ReplaceAll(string(configMap), "\r\n", "\n"), "01_schema.sql: |\n")
	schema, _, found := strings.Cut(schema, "02_seed_stops.sql: |\n")
	if !found || statementsOf(schema) != expected {
		t.Error("micros-db-init-scripts.yaml does not match")
	}
}

// La bajada borra todas las tablas, y la imagen incluye las migraciones.
func TestMigrationFilesAreComplete(t *testing.T) {
	down := readMigration(t, "000001_transit_schema.down.sql")
	for _, table := range []string{"stops", "routes", "trips", "route_stops", "transfers"} {
		if !strings.Contains(down, "DROP TABLE IF EXISTS "+table+";") {
			t.Errorf("the down migration keeps %s", table)
		}
	}
	dockerfile, err := os.ReadFile("Dockerfile")
	if err != nil || !strings.Contains(string(dockerfile), "micro_service/migrations ./migrations") {
		t.Errorf("the Dockerfile does not copy the migrations, err = %v", err)
	}
}

func TestMigrationsEnabled(t *testing.T) {
	for value, expected := range map[string]bool{"": true, "true": true, "1": true, "false": false, "0": false} {
		if enabled, err := migrationsEnabled(value); err != nil || enabled != expected {
			t.Errorf("%q = %v, %v; want %v", value, enabled, err, expected)
		}
	}
	if _, err := migrationsEnabled("quizás"); err == nil {
		t.Error("an invalid value was accepted")
	}
	// Desactivadas, no se conecta a la base.
	if err := prepareSchema("postgres://127.0.0.1:1/missing", "false"); err != nil {
		t.Error(err)
	}
	if err := prepareSchema("postgres://127.0.0.1:1/missing?connect_timeout=2", ""); err == nil {
		t.Error("an unreachable database was accepted")
	}
}
