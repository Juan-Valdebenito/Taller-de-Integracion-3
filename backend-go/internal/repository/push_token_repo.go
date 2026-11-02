package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PushTokenRepository guarda los tokens de Expo Push de cada teléfono.
type PushTokenRepository struct {
	pool *pgxpool.Pool
}

func NewPushTokenRepository(pool *pgxpool.Pool) *PushTokenRepository {
	return &PushTokenRepository{pool: pool}
}

// Save registra el token del teléfono para la cuenta. Si el token ya estaba
// (el mismo teléfono con otra cuenta), pasa a esta cuenta.
func (r *PushTokenRepository) Save(ctx context.Context, userID, token, platform string) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO push_tokens (token, "userId", platform, "createdAt", "updatedAt")
		VALUES ($1, $2, $3, NOW(), NOW())
		ON CONFLICT (token) DO UPDATE SET "userId" = EXCLUDED."userId", platform = EXCLUDED.platform, "updatedAt" = NOW()
	`, token, userID, platform)
	if err != nil {
		return fmt.Errorf("PushTokenRepository.Save: %w", err)
	}
	return nil
}

// DeleteForUser borra el token solo si es de esa cuenta (nadie puede borrar el
// de otra). Devuelve si borró algo.
func (r *PushTokenRepository) DeleteForUser(ctx context.Context, userID, token string) (bool, error) {
	cmd, err := r.pool.Exec(ctx, `DELETE FROM push_tokens WHERE token = $1 AND "userId" = $2`, token, userID)
	if err != nil {
		return false, fmt.Errorf("PushTokenRepository.DeleteForUser: %w", err)
	}
	return cmd.RowsAffected() > 0, nil
}

// Delete borra tokens que ya no sirven (Expo respondió DeviceNotRegistered).
func (r *PushTokenRepository) Delete(ctx context.Context, tokens []string) error {
	if len(tokens) == 0 {
		return nil
	}
	if _, err := r.pool.Exec(ctx, `DELETE FROM push_tokens WHERE token = ANY($1)`, tokens); err != nil {
		return fmt.Errorf("PushTokenRepository.Delete: %w", err)
	}
	return nil
}

// TokensForUser devuelve los tokens de los teléfonos de la cuenta.
func (r *PushTokenRepository) TokensForUser(ctx context.Context, userID string) ([]string, error) {
	rows, err := r.pool.Query(ctx, `SELECT token FROM push_tokens WHERE "userId" = $1 ORDER BY "updatedAt" DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("PushTokenRepository.TokensForUser: %w", err)
	}
	defer rows.Close()
	tokens := make([]string, 0)
	for rows.Next() {
		var token string
		if err := rows.Scan(&token); err != nil {
			return nil, fmt.Errorf("PushTokenRepository.TokensForUser scan: %w", err)
		}
		tokens = append(tokens, token)
	}
	return tokens, rows.Err()
}
