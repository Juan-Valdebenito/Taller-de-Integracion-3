package handler

import (
	"errors"
	"testing"
	"time"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/token"
)

func TestUserMessageCapitalizesFirstLetter(t *testing.T) {
	for in, want := range map[string]string{
		"el refresh token no pertenece a la sesión actual": "El refresh token no pertenece a la sesión actual",
		"refresh token inválido":                           "Refresh token inválido",
		"ñandú":                                            "Ñandú", // primera letra no ASCII
		"":                                                 "",
	} {
		if got := userMessage(errors.New(in)); got != want {
			t.Errorf("userMessage(%q) = %q, want %q", in, got, want)
		}
	}
}

// Los errores de verificación del logout se pueden comparar con errors.Is y el
// mensaje que recibe el usuario es el mismo que antes del cambio.
func TestVerifyOwnRefreshTokenErrors(t *testing.T) {
	h := NewAuthHandler(nil, "errors-test-secret", time.Minute, time.Hour, token.NewMemoryStore())
	issue := func(userID, tokenType string) string {
		t.Helper()
		user := *ana
		user.ID = userID
		signed, _, _, err := h.generateToken(&user, tokenType, time.Hour)
		if err != nil {
			t.Fatal(err)
		}
		return signed
	}

	cases := []struct {
		name    string
		token   string
		wantErr error
		wantMsg string
	}{
		{"no es un JWT", "basura", errRefreshInvalid, "Refresh token inválido"},
		{"es un access token", issue("user-ana", "access"), errRefreshWrongType, "El token enviado no es un refresh token"},
		{"de otro usuario", issue("user-pedro", "refresh"), errRefreshNotOwned, "El refresh token no pertenece a la sesión actual"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, _, err := h.verifyOwnRefreshToken(tc.token, "user-ana")
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("expected %v, got %v", tc.wantErr, err)
			}
			if got := userMessage(err); got != tc.wantMsg {
				t.Fatalf("user message = %q, want %q", got, tc.wantMsg)
			}
		})
	}

	if _, _, err := h.verifyOwnRefreshToken(issue("user-ana", "refresh"), "user-ana"); err != nil {
		t.Fatalf("own refresh token must be accepted, got %v", err)
	}
}
