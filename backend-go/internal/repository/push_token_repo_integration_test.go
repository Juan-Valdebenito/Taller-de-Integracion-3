package repository

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// Contra PostgreSQL real (TEST_DATABASE_URL, ver attachmentTestPool).
func TestPushTokenRepositoryAgainstPostgres(t *testing.T) {
	pool := attachmentTestPool(t)
	users := NewUserRepository(pool)
	repo := NewPushTokenRepository(pool)
	ctx := context.Background()

	suffix := fmt.Sprintf("%d", time.Now().UnixNano()%1_000_000)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE email LIKE $1`, "%-"+suffix+"@test.cl")
	})
	ana, err := users.Create(ctx, "Ana", "ana-"+suffix+"@test.cl", "hash", domain.UserRolePassenger, nil)
	if err != nil {
		t.Fatal(err)
	}
	beto, err := users.Create(ctx, "Beto", "beto-"+suffix+"@test.cl", "hash", domain.UserRolePassenger, nil)
	if err != nil {
		t.Fatal(err)
	}
	phone := "ExponentPushToken[telefono" + suffix + "]"
	tablet := "ExponentPushToken[tablet" + suffix + "]"

	// Ana tiene dos teléfonos; registrar de nuevo no duplica.
	for _, tok := range []string{phone, tablet, phone} {
		if err := repo.Save(ctx, ana.ID, tok, "android"); err != nil {
			t.Fatal(err)
		}
	}
	if got, _ := repo.TokensForUser(ctx, ana.ID); len(got) != 2 {
		t.Fatalf("Ana: %v", got)
	}

	// Beto no puede borrar el teléfono de Ana.
	if deleted, err := repo.DeleteForUser(ctx, beto.ID, phone); err != nil || deleted {
		t.Fatalf("Beto borró el token de Ana: %v %v", deleted, err)
	}

	// Beto inicia sesión en el teléfono de Ana: el token pasa a Beto.
	if err := repo.Save(ctx, beto.ID, phone, "ios"); err != nil {
		t.Fatal(err)
	}
	if got, _ := repo.TokensForUser(ctx, ana.ID); len(got) != 1 || got[0] != tablet {
		t.Fatalf("Ana después: %v", got)
	}
	if got, _ := repo.TokensForUser(ctx, beto.ID); len(got) != 1 || got[0] != phone {
		t.Fatalf("Beto: %v", got)
	}

	// Tokens que Expo rechaza se borran en lote.
	if err := repo.Delete(ctx, []string{phone, tablet}); err != nil {
		t.Fatal(err)
	}
	if got, _ := repo.TokensForUser(ctx, beto.ID); len(got) != 0 {
		t.Fatalf("debía quedar vacío: %v", got)
	}
}
