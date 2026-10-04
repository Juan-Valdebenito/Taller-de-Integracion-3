package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

type CompanySummary struct {
	ID   		string `json: "id"`
	Name 		string `json: "name"`
	IsActive 	bool `json: "isActive"`
}

type CompanyRepository struct {
	pool *pgxpool.Pool
}

func NewCompanyRepository(pool *pgxpool.Pool) *CompanyRepository {
	return &CompanyRepository{pool: pool}
}

func (r *CompanyRepository) FindAllActive(ctx context.Context) ([]CompanySummary, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, name, "isActive" 
		FROM companies 
		WHERE "isActive" = true 
		ORDER BY name ASC`)

	if err != nil {
		return nil, fmt.Errorf("CompanyRepository.FindAllActive: %w", err)
	}

	defer rows.Close()

	companies := make([]CompanySummary, 0)

	for rows.Next() {
		var company CompanySummary
		
		if err := rows.Scan(
			&company.ID,
			&company.Name,
			&company.IsActive,
		); err != nil { return nil, fmt.Errorf("CompanyRepository.FindAllActive scan: %w", err,)}

		companies = append(companies, company)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("CompanyRepository.FindAllActive: %w", err)
	}
	return companies, nil
}