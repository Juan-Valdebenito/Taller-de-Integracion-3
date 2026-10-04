package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// UserRepository gestiona las operaciones de base de datos para usuarios.
type UserRepository struct {
	pool *pgxpool.Pool
}

func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

// FindAll retorna todos los usuarios.
func (r *UserRepository) FindAll(ctx context.Context) ([]domain.User, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, name, email, "passwordHash", role, "isActive", "companyId", "createdAt", "updatedAt"
		FROM users
		ORDER BY "createdAt" DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("UserRepository.FindAll: %w", err)
	}
	defer rows.Close()

	var users []domain.User
	for rows.Next() {
		var u domain.User
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.Role, &u.IsActive, &u.CompanyID, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, nil
}

// FindByID retorna un usuario por su ID o nil si no existe.
func (r *UserRepository) FindByID(ctx context.Context, id string) (*domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx, `
		SELECT id, name, email, "passwordHash", role, "isActive", "companyId", "createdAt", "updatedAt"
		FROM users WHERE id = $1
	`, id).Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.Role, &u.IsActive, &u.CompanyID, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("UserRepository.FindByID: %w", err)
	}
	return &u, nil
}

// FindByEmail retorna un usuario por email o nil si no existe.
func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx, `
		SELECT id, name, email, "passwordHash", role, "isActive", "companyId", "createdAt", "updatedAt"
		FROM users WHERE email = $1
	`, email).Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.Role, &u.IsActive, &u.CompanyID, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("UserRepository.FindByEmail: %w", err)
	}
	return &u, nil
}

// Create inserta un nuevo usuario y retorna el registro creado.
func (r *UserRepository) Create(ctx context.Context, name, email, passwordHash string, role domain.UserRole, companyID *string) (*domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx, `
		INSERT INTO users (id, name, email, "passwordHash", role, "isActive", "companyId", "createdAt", "updatedAt")
		VALUES (gen_random_uuid()::TEXT, $1, $2, $3, $4, TRUE, $5, NOW(), NOW())
		RETURNING id, name, email, "passwordHash", role, "isActive", "companyId", "createdAt", "updatedAt"
	`, name, email, passwordHash, role, companyID).Scan(
		&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.Role, &u.IsActive, &u.CompanyID, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("UserRepository.Create: %w", err)
	}
	return &u, nil
}

// Update actualiza nombre, rol y opcionalmente isActive de un usuario.
func (r *UserRepository) Update(ctx context.Context, id, name string, role domain.UserRole, isActive ...bool) (*domain.User, error) {
	var u domain.User
	var err error

	if len(isActive) > 0 {
		err = r.pool.QueryRow(ctx, `
			UPDATE users SET name = $1, role = $2, "isActive" = $3, "updatedAt" = NOW()
			WHERE id = $4
			RETURNING id, name, email, "passwordHash", role, "isActive", "companyId", "createdAt", "updatedAt"
		`, name, role, isActive[0], id).Scan(
			&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.Role, &u.IsActive, &u.CompanyID, &u.CreatedAt, &u.UpdatedAt,
		)
	} else {
		err = r.pool.QueryRow(ctx, `
			UPDATE users SET name = $1, role = $2, "updatedAt" = NOW()
			WHERE id = $3
			RETURNING id, name, email, "passwordHash", role, "isActive", "companyId", "createdAt", "updatedAt"
		`, name, role, id).Scan(
			&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.Role, &u.IsActive, &u.CompanyID, &u.CreatedAt, &u.UpdatedAt,
		)
	}

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("UserRepository.Update: %w", err)
	}
	return &u, nil
}

// UpdatePartial actualiza selectivamente campos específicos de un usuario (para PATCH).
func (r *UserRepository) UpdatePartial(ctx context.Context, id string, name *string, role *domain.UserRole, isActive *bool, companyID *string) (*domain.User, error) {
	setClauses := []string{`"updatedAt" = NOW()`}
	var args []any
	argIdx := 1

	if name != nil {
		setClauses = append(setClauses, fmt.Sprintf("name = $%d", argIdx))
		args = append(args, *name)
		argIdx++
	}
	if role != nil {
		setClauses = append(setClauses, fmt.Sprintf("role = $%d", argIdx))
		args = append(args, *role)
		argIdx++
	}
	if isActive != nil {
		setClauses = append(setClauses, fmt.Sprintf("\"isActive\" = $%d", argIdx))
		args = append(args, *isActive)
		argIdx++
	}
	if companyID != nil {
		setClauses = append(setClauses, fmt.Sprintf("\"companyId\" = $%d", argIdx))
		args = append(args, *companyID)
		argIdx++
	}

	query := fmt.Sprintf(`
		UPDATE users
		SET %s
		WHERE id = $%d
		RETURNING id, name, email, "passwordHash", role, "isActive", "companyId", "createdAt", "updatedAt"
	`, strings.Join(setClauses, ", "), argIdx)
	args = append(args, id)

	var u domain.User
	err := r.pool.QueryRow(ctx, query, args...).Scan(
		&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.Role, &u.IsActive, &u.CompanyID, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("UserRepository.UpdatePartial: %w", err)
	}
	return &u, nil
}

// SoftDelete desactiva un usuario estableciendo isActive = false en lugar de eliminar el registro físico.
func (r *UserRepository) SoftDelete(ctx context.Context, id string) (*domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx, `
		UPDATE users
		SET "isActive" = FALSE, "updatedAt" = NOW()
		WHERE id = $1
		RETURNING id, name, email, "passwordHash", role, "isActive", "companyId", "createdAt", "updatedAt"
	`, id).Scan(
		&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.Role, &u.IsActive, &u.CompanyID, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("UserRepository.SoftDelete: %w", err)
	}
	return &u, nil
}

// Delete elimina físicamente un usuario por ID.
func (r *UserRepository) Delete(ctx context.Context, id string) error {
	cmd, err := r.pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("UserRepository.Delete: %w", err)
	}
	if cmd.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
