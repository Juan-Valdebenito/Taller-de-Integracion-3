package repository

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// Contra PostgreSQL real (TEST_DATABASE_URL, ver attachmentTestPool): el correo
// repetido y la empresa inexistente se reconocen como errores propios (4xx en
// el handler) en vez de un 500 con el error de la base de datos.
func TestUserRepositoryCreateErrorsAgainstPostgres(t *testing.T) {
	pool := attachmentTestPool(t)
	repo := NewUserRepository(pool)
	ctx := context.Background()

	suffix := fmt.Sprintf("%d", time.Now().UnixNano()%1_000_000)
	email := "usuario-" + suffix + "@test.cl"
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE email LIKE $1`, "%-"+suffix+"@test.cl")
	})

	created, err := repo.Create(ctx, "Usuario Integración", email, "hash", domain.UserRolePassenger, nil)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if created.Email != email || created.CompanyID != nil || !created.IsActive {
		t.Fatalf("Create = %+v", created)
	}

	if _, err := repo.Create(ctx, "Repetido", email, "hash", domain.UserRolePassenger, nil); !errors.Is(err, ErrUserDuplicateEmail) {
		t.Errorf("correo repetido: got %v", err)
	}

	missing := "empresa-que-no-existe-" + suffix
	if _, err := repo.Create(ctx, "Sin empresa", "empresa-"+suffix+"@test.cl", "hash", domain.UserRoleCompany, &missing); !errors.Is(err, ErrUserCompanyNotFound) {
		t.Errorf("empresa inexistente: got %v", err)
	}

	// Al editar: correo de otra cuenta y empresa inexistente también son errores propios.
	other, err := repo.Create(ctx, "Otra cuenta", "otra-"+suffix+"@test.cl", "hash", domain.UserRolePassenger, nil)
	if err != nil {
		t.Fatalf("Create otra: %v", err)
	}
	if _, err := repo.UpdatePartial(ctx, other.ID, nil, &email, nil, nil, nil); !errors.Is(err, ErrUserDuplicateEmail) {
		t.Errorf("UpdatePartial correo repetido: got %v", err)
	}
	if _, err := repo.UpdatePartial(ctx, other.ID, nil, nil, nil, nil, &missing); !errors.Is(err, ErrUserCompanyNotFound) {
		t.Errorf("UpdatePartial empresa inexistente: got %v", err)
	}
}

// Una cuenta se puede desvincular de su empresa: con companyId vacío (PATCH) o
// al dejar de ser Empresa (PUT).
func TestUserRepositoryClearsCompanyAgainstPostgres(t *testing.T) {
	pool := attachmentTestPool(t)
	repo := NewUserRepository(pool)
	ctx := context.Background()

	suffix := fmt.Sprintf("%d", time.Now().UnixNano()%1_000_000)
	companyID := "empresa-usuarios-" + suffix
	if _, err := pool.Exec(ctx, `INSERT INTO companies (id, name, rut, email, "isActive", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())`,
		companyID, "Empresa usuarios "+suffix, "rut-"+suffix, "empresa-usuarios-"+suffix+"@test.cl"); err != nil {
		t.Fatalf("insertar empresa: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE email LIKE $1`, "%-"+suffix+"@test.cl")
		_, _ = pool.Exec(context.Background(), `DELETE FROM companies WHERE id = $1`, companyID)
	})

	user, err := repo.Create(ctx, "Operador", "operador-"+suffix+"@test.cl", "hash", domain.UserRoleCompany, &companyID)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	none := ""
	cleared, err := repo.UpdatePartial(ctx, user.ID, nil, nil, nil, nil, &none)
	if err != nil || cleared.CompanyID != nil {
		t.Fatalf("UpdatePartial companyId vacío: %+v, %v", cleared, err)
	}

	if _, err := repo.UpdatePartial(ctx, user.ID, nil, nil, nil, nil, &companyID); err != nil {
		t.Fatalf("volver a asignar la empresa: %v", err)
	}
	passenger, err := repo.Update(ctx, user.ID, "Operador", domain.UserRolePassenger, nil, nil)
	if err != nil || passenger.CompanyID != nil || passenger.Role != domain.UserRolePassenger {
		t.Fatalf("Update a pasajero: %+v, %v", passenger, err)
	}
}
