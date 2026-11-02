package migrations

import (
	"fmt"
	"io/fs"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
)

var migrationName = regexp.MustCompile(`^(\d{6})_([a-z0-9_]+)\.(up|down)\.sql$`)

// TestMigrationsArePairedAndSequential: golang-migrate exige versiones únicas;
// además cada migración debe tener su rollback y la numeración no debe saltarse.
func TestMigrationsArePairedAndSequential(t *testing.T) {
	entries, err := fs.ReadDir(Filesystem(), ".")
	if err != nil {
		t.Fatal(err)
	}

	type pair struct{ name, up, down string }
	byVersion := map[int]*pair{}
	for _, e := range entries {
		m := migrationName.FindStringSubmatch(e.Name())
		if m == nil {
			if strings.HasSuffix(e.Name(), ".sql") {
				t.Errorf("nombre de migración inválido: %s (formato 000001_nombre.up.sql)", e.Name())
			}
			continue
		}
		version, _ := strconv.Atoi(m[1])
		p := byVersion[version]
		if p == nil {
			p = &pair{name: m[2]}
			byVersion[version] = p
		}
		if p.name != m[2] {
			t.Errorf("versión %06d con dos nombres distintos: %q y %q", version, p.name, m[2])
		}
		if m[3] == "up" {
			p.up = e.Name()
		} else {
			p.down = e.Name()
		}
	}

	versions := make([]int, 0, len(byVersion))
	for v := range byVersion {
		versions = append(versions, v)
	}
	sort.Ints(versions)
	for i, v := range versions {
		if want := i + 1; v != want {
			t.Errorf("numeración con saltos: se esperaba %06d y se encontró %06d", want, v)
		}
		p := byVersion[v]
		if p.up == "" || p.down == "" {
			t.Errorf("migración %06d_%s sin par up/down (up=%q, down=%q)", v, p.name, p.up, p.down)
		}
	}
}

func TestComplaintAttachmentsMigration(t *testing.T) {
	up := read(t, "000002_complaint_attachments.up.sql")
	for _, want := range []string{
		"CREATE TABLE complaint_attachments",
		`REFERENCES complaints(id) ON DELETE CASCADE`,
		`"storageKey"    TEXT NOT NULL UNIQUE`,
		`CHECK ("mimeType" IN ('image/jpeg', 'image/png'))`,
		`UNIQUE ("complaintId", sha256)`,
		"CREATE INDEX idx_complaint_attachments_complaint",
	} {
		if !strings.Contains(up, want) {
			t.Errorf("000002 up: falta %q", want)
		}
	}
	// El nombre original del archivo no se guarda (puede tener datos personales).
	if strings.Contains(strings.ToLower(up), "originalname") || strings.Contains(strings.ToLower(up), "filename") {
		t.Error("000002 up no debe guardar el nombre original del archivo")
	}

	down := read(t, "000002_complaint_attachments.down.sql")
	if !strings.Contains(down, "DROP TABLE IF EXISTS complaint_attachments") {
		t.Error("000002 down debe eliminar la tabla complaint_attachments")
	}
}

func read(t *testing.T, name string) string {
	t.Helper()
	b, err := fs.ReadFile(Filesystem(), name)
	if err != nil {
		t.Fatal(fmt.Errorf("leyendo %s: %w", name, err))
	}
	return string(b)
}
