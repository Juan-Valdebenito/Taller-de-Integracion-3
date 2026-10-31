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
}
