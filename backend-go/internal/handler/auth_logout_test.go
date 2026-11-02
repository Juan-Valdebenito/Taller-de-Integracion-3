package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/middleware"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/token"
)

const logoutTestSecret = "logout-test-secret"

// logoutFixture arma un router con el middleware Authenticate real, la lista
// negra en memoria, POST /logout y una ruta protegida para comprobar si un
// token sigue sirviendo después del cierre de sesión.
type logoutFixture struct {
	t      *testing.T
	h      *AuthHandler
	store  *token.MemoryStore
	router *gin.Engine
}

func newLogoutFixture(t *testing.T) *logoutFixture {
	t.Helper()
	gin.SetMode(gin.TestMode)
	store := token.NewMemoryStore()
	h := NewAuthHandler(nil, logoutTestSecret, 15*time.Minute, 7*24*time.Hour, store)
	r := gin.New()
	auth := middleware.Authenticate(logoutTestSecret, store)
	r.POST("/logout", auth, h.Logout)
	r.GET("/protected", auth, func(c *gin.Context) { c.Status(http.StatusNoContent) })
	return &logoutFixture{t: t, h: h, store: store, router: r}
}

func (f *logoutFixture) issue(user *domain.User, tokenType string, ttl time.Duration) (string, string) {
	f.t.Helper()
	signed, _, jti, err := f.h.generateToken(user, tokenType, ttl)
	if err != nil {
		f.t.Fatalf("generateToken: %v", err)
	}
	return signed, jti
}

func (f *logoutFixture) logout(accessToken string, body any) *httptest.ResponseRecorder {
	f.t.Helper()
	payload, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/logout", strings.NewReader(string(payload)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+accessToken)
	w := httptest.NewRecorder()
	f.router.ServeHTTP(w, req)
	return w
}

func (f *logoutFixture) protected(accessToken string) int {
	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	w := httptest.NewRecorder()
	f.router.ServeHTTP(w, req)
	return w.Code
}

func (f *logoutFixture) revoked(jti string) bool {
	f.t.Helper()
	revoked, err := f.store.IsRevoked(jti)
	if err != nil {
		f.t.Fatalf("IsRevoked: %v", err)
	}
	return revoked
}

var (
	ana   = &domain.User{ID: "user-ana", Email: "ana@correo.cl", Role: domain.UserRolePassenger}
	pedro = &domain.User{ID: "user-pedro", Email: "pedro@correo.cl", Role: domain.UserRolePassenger}
)

func TestLogoutBlacklistsAccessAndRefreshTokens(t *testing.T) {
	f := newLogoutFixture(t)
	access, accessJTI := f.issue(ana, "access", 15*time.Minute)
	refresh, refreshJTI := f.issue(ana, "refresh", 7*24*time.Hour)

	if code := f.protected(access); code != http.StatusNoContent {
		t.Fatalf("access token should work before logout, got %d", code)
	}

	w := f.logout(access, map[string]string{"refreshToken": refresh})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["refreshRevoked"] != true {
		t.Fatalf("expected refreshRevoked=true, got %v", resp)
	}

	if !f.revoked(accessJTI) || !f.revoked(refreshJTI) {
		t.Fatal("both tokens must be in the blacklist after logout")
	}
	if code := f.protected(access); code != http.StatusUnauthorized {
		t.Fatalf("revoked access token must be rejected with 401, got %d", code)
	}
}

func TestLogoutWithoutRefreshTokenOnlyBlacklistsAccessToken(t *testing.T) {
	f := newLogoutFixture(t)
	access, accessJTI := f.issue(ana, "access", 15*time.Minute)

	w := f.logout(access, map[string]string{})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if !f.revoked(accessJTI) {
		t.Fatal("access token must be blacklisted")
	}
}

func TestLogoutRejectsRefreshTokenFromAnotherUser(t *testing.T) {
	f := newLogoutFixture(t)
	access, accessJTI := f.issue(ana, "access", 15*time.Minute)
	foreignRefresh, foreignJTI := f.issue(pedro, "refresh", 7*24*time.Hour)

	w := f.logout(access, map[string]string{"refreshToken": foreignRefresh})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for a refresh token of another user, got %d", w.Code)
	}
	// No se revoca nada a medias: ni el token ajeno ni el propio.
	if f.revoked(foreignJTI) || f.revoked(accessJTI) {
		t.Fatal("nothing should be revoked when the request is rejected")
	}
}

func TestLogoutRejectsForgedRefreshToken(t *testing.T) {
	f := newLogoutFixture(t)
	access, _ := f.issue(ana, "access", 15*time.Minute)
	forger := NewAuthHandler(nil, "otro-secreto", time.Minute, time.Hour, token.NewMemoryStore())
	forged, forgedJTI, _ := func() (string, string, error) {
		s, _, jti, err := forger.generateToken(ana, "refresh", time.Hour)
		return s, jti, err
	}()

	if w := f.logout(access, map[string]string{"refreshToken": forged}); w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for a token signed with another secret, got %d", w.Code)
	}
	if f.revoked(forgedJTI) {
		t.Fatal("a forged token must not reach the blacklist")
	}
}

func TestLogoutRejectsAccessTokenSentAsRefreshToken(t *testing.T) {
	f := newLogoutFixture(t)
	access, _ := f.issue(ana, "access", 15*time.Minute)
	otherAccess, _ := f.issue(ana, "access", 15*time.Minute)

	if w := f.logout(access, map[string]string{"refreshToken": otherAccess}); w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when refreshToken is an access token, got %d", w.Code)
	}
}

func TestLogoutSkipsExpiredRefreshToken(t *testing.T) {
	f := newLogoutFixture(t)
	access, accessJTI := f.issue(ana, "access", 15*time.Minute)
	expiredRefresh, expiredJTI := f.issue(ana, "refresh", -time.Hour)

	w := f.logout(access, map[string]string{"refreshToken": expiredRefresh})
	if w.Code != http.StatusOK {
		t.Fatalf("an expired refresh token is harmless: expected 200, got %d", w.Code)
	}
	if !f.revoked(accessJTI) {
		t.Fatal("access token must still be blacklisted")
	}
	if f.revoked(expiredJTI) {
		t.Fatal("an expired refresh token does not need to be stored")
	}
}

func TestLogoutRequiresAuthentication(t *testing.T) {
	f := newLogoutFixture(t)
	req := httptest.NewRequest(http.MethodPost, "/logout", nil)
	w := httptest.NewRecorder()
	f.router.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without token, got %d", w.Code)
	}
}
