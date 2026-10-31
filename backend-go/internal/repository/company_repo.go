package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

type CompanyRepository struct {
	pool *pgxpool.Pool
}

func NewCompanyRepository(pool *pgxpool.Pool) *CompanyRepository {
	return &CompanyRepository{pool: pool}
}

var (
	// ErrCompanyDuplicateRut: ya hay una empresa con ese RUT (restricción UNIQUE).
	ErrCompanyDuplicateRut = errors.New("ya existe una empresa con ese RUT")
	// ErrCompanyDuplicateEmail: ya hay una empresa con ese correo (restricción UNIQUE).
	ErrCompanyDuplicateEmail = errors.New("ya existe una empresa con ese correo electrónico")
)

const companyColumns = `id, name, rut, email, phone, address, "isActive", "createdAt", "updatedAt"`

func scanCompany(row pgx.Row) (*domain.Company, error) {
	var c domain.Company
	if err := row.Scan(&c.ID, &c.Name, &c.Rut, &c.Email, &c.Phone, &c.Address, &c.IsActive, &c.CreatedAt, &c.UpdatedAt); err != nil {
		return nil, err
	}
	return &c, nil
}

// mapCompanyWriteError traduce los duplicados de RUT o correo a errores para el usuario.
func mapCompanyWriteError(op string, err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		switch pgErr.ConstraintName {
		case "companies_rut_key":
			return ErrCompanyDuplicateRut
		case "companies_email_key":
			return ErrCompanyDuplicateEmail
		}
	}
	return fmt.Errorf("CompanyRepository.%s: %w", op, err)
}

// FindAll devuelve todas las empresas (activas e inactivas) con sus datos, por nombre.
func (r *CompanyRepository) FindAll(ctx context.Context) ([]domain.Company, error) {
	rows, err := r.pool.Query(ctx, `SELECT `+companyColumns+` FROM companies ORDER BY name ASC`)
	if err != nil {
		return nil, fmt.Errorf("CompanyRepository.FindAll: %w", err)
	}
	defer rows.Close()
	companies := make([]domain.Company, 0)
	for rows.Next() {
		c, err := scanCompany(rows)
		if err != nil {
			return nil, fmt.Errorf("CompanyRepository.FindAll scan: %w", err)
		}
		companies = append(companies, *c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("CompanyRepository.FindAll: %w", err)
	}
	return companies, nil
}

// FindByID devuelve la empresa o nil si no existe.
func (r *CompanyRepository) FindByID(ctx context.Context, id string) (*domain.Company, error) {
	c, err := scanCompany(r.pool.QueryRow(ctx, `SELECT `+companyColumns+` FROM companies WHERE id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("CompanyRepository.FindByID: %w", err)
	}
	return c, nil
}

// Create registra una empresa activa. in debe venir normalizado (CompanyInput.Normalize).
func (r *CompanyRepository) Create(ctx context.Context, in domain.CompanyInput) (*domain.Company, error) {
	c, err := scanCompany(r.pool.QueryRow(ctx, `
		INSERT INTO companies (name, rut, email, phone, address)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING `+companyColumns, in.Name, in.Rut, in.Email, in.Phone, in.Address))
	if err != nil {
		return nil, mapCompanyWriteError("Create", err)
	}
	return c, nil
}

// Update reemplaza los datos editables; nil si la empresa no existe.
func (r *CompanyRepository) Update(ctx context.Context, id string, in domain.CompanyInput) (*domain.Company, error) {
	c, err := scanCompany(r.pool.QueryRow(ctx, `
		UPDATE companies
		SET name = $2, rut = $3, email = $4, phone = $5, address = $6, "updatedAt" = NOW()
		WHERE id = $1
		RETURNING `+companyColumns, id, in.Name, in.Rut, in.Email, in.Phone, in.Address))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, mapCompanyWriteError("Update", err)
	}
	return c, nil
}

// SetActive activa o desactiva la empresa; nil si no existe.
func (r *CompanyRepository) SetActive(ctx context.Context, id string, active bool) (*domain.Company, error) {
	c, err := scanCompany(r.pool.QueryRow(ctx, `
		UPDATE companies SET "isActive" = $2, "updatedAt" = NOW()
		WHERE id = $1
		RETURNING `+companyColumns, id, active))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("CompanyRepository.SetActive: %w", err)
	}
	return c, nil
}
