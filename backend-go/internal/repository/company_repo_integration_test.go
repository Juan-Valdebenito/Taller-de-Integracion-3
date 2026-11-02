package repository

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// Tests contra PostgreSQL real (TEST_DATABASE_URL con las migraciones
// aplicadas; ver attachmentTestPool). Crean empresas de prueba y las borran.
func TestCompanyRepositoryCRUDAgainstPostgres(t *testing.T) {
	pool := attachmentTestPool(t)
	repo := NewCompanyRepository(pool)
	ctx := context.Background()

	// RUT válidos y distintos en cada corrida (cuerpo de 8 dígitos + verificador).
	stamp := time.Now().UnixNano() % 1_000_000
	rutFor := func(n int64) string {
		body := fmt.Sprintf("%d", 70_000_000+stamp*10+n)
		for _, dv := range "0123456789K" {
			if rut, err := domain.NormalizeRut(body + string(dv)); err == nil {
				return rut
			}
		}
		t.Fatalf("no se pudo armar un RUT para %s", body)
		return ""
	}
	suffix := fmt.Sprintf("%d", stamp)
	in := domain.CompanyInput{Name: "Empresa integración " + suffix, Rut: rutFor(1), Email: "integracion-" + suffix + "@test.cl"}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM companies WHERE email LIKE $1`, "%-"+suffix+"@test.cl")
	})

	created, err := repo.Create(ctx, in)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if !created.IsActive || created.Rut != in.Rut || created.Phone != nil {
		t.Fatalf("Create = %+v", created)
	}

	// Duplicados: los nombres de las restricciones UNIQUE de la tabla.
	if _, err := repo.Create(ctx, domain.CompanyInput{Name: "Otra", Rut: in.Rut, Email: "otra-" + suffix + "@test.cl"}); !errors.Is(err, ErrCompanyDuplicateRut) {
		t.Errorf("RUT repetido: %v; esperado ErrCompanyDuplicateRut", err)
	}
	if _, err := repo.Create(ctx, domain.CompanyInput{Name: "Otra", Rut: rutFor(2), Email: in.Email}); !errors.Is(err, ErrCompanyDuplicateEmail) {
		t.Errorf("correo repetido: %v; esperado ErrCompanyDuplicateEmail", err)
	}

	phone := "+56 45 222 3333"
	updated, err := repo.Update(ctx, created.ID, domain.CompanyInput{Name: in.Name + " SpA", Rut: in.Rut, Email: in.Email, Phone: &phone})
	if err != nil || updated == nil || updated.Name != in.Name+" SpA" || updated.Phone == nil || *updated.Phone != phone {
		t.Fatalf("Update = %+v, %v", updated, err)
	}

	off, err := repo.SetActive(ctx, created.ID, false)
	if err != nil || off == nil || off.IsActive {
		t.Fatalf("SetActive(false) = %+v, %v", off, err)
	}
	all, err := repo.FindAll(ctx)
	if err != nil {
		t.Fatalf("FindAll: %v", err)
	}
	found := false
	for _, c := range all {
		if c.ID == created.ID {
			found = !c.IsActive
		}
	}
	if !found {
		t.Error("FindAll debe incluir la empresa inactiva")
	}

	if c, err := repo.FindByID(ctx, "no-existe"); err != nil || c != nil {
		t.Errorf("FindByID inexistente = %+v, %v", c, err)
	}
	if c, err := repo.Update(ctx, "no-existe", in); err != nil || c != nil {
		t.Errorf("Update inexistente = %+v, %v", c, err)
	}
	if c, err := repo.SetActive(ctx, "no-existe", true); err != nil || c != nil {
		t.Errorf("SetActive inexistente = %+v, %v", c, err)
	}
}
