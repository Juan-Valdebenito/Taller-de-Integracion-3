package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/middleware"
)

type fakePushStore struct {
	saved   []string // "userID|token|platform"
	deleted []string // "userID|token"
	err     error
}

func (f *fakePushStore) Save(_ context.Context, userID, token, platform string) error {
	f.saved = append(f.saved, userID+"|"+token+"|"+platform)
	return f.err
}

func (f *fakePushStore) DeleteForUser(_ context.Context, userID, token string) (bool, error) {
	f.deleted = append(f.deleted, userID+"|"+token)
	return true, f.err
}

const validPushToken = "ExponentPushToken[abcDEF123456_-xyz]"

func callPush(h gin.HandlerFunc, method, body string) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, "/api/v1/me/push-token", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set(middleware.ContextUserID, "u1")
	h(c)
	// Gin escribe el código al terminar la petición; aquí se hace a mano.
	c.Writer.WriteHeaderNow()
	return w
}

func TestRegisterPushToken(t *testing.T) {
	store := &fakePushStore{}
	h := NewPushTokenHandler(store)

	w := callPush(h.Register, http.MethodPut, `{"token":" `+validPushToken+` ","platform":"Android"}`)
	if w.Code != http.StatusNoContent {
		t.Fatalf("got %d %s", w.Code, w.Body.String())
	}
	if len(store.saved) != 1 || store.saved[0] != "u1|"+validPushToken+"|android" {
		t.Errorf("guardado = %v", store.saved)
	}
	// También el formato nuevo ExpoPushToken[...].
	if w := callPush(h.Register, http.MethodPut, `{"token":"ExpoPushToken[abcDEF123456]","platform":"ios"}`); w.Code != http.StatusNoContent {
		t.Errorf("ExpoPushToken: got %d", w.Code)
	}
}

func TestRegisterPushTokenValidation(t *testing.T) {
	h := NewPushTokenHandler(&fakePushStore{})
	for name, body := range map[string]string{
		"token inventado":     `{"token":"hola","platform":"ios"}`,
		"token vacío":         `{"token":"","platform":"ios"}`,
		"token con inyección": `{"token":"ExponentPushToken[abc'; DROP TABLE x;--]","platform":"ios"}`,
		"plataforma inválida": `{"token":"` + validPushToken + `","platform":"web"}`,
		"sin plataforma":      `{"token":"` + validPushToken + `"}`,
		"JSON roto":           `{"token":`,
	} {
		if w := callPush(h.Register, http.MethodPut, body); w.Code != http.StatusBadRequest {
			t.Errorf("%s: got %d", name, w.Code)
		}
	}
}

func TestUnregisterPushToken(t *testing.T) {
	store := &fakePushStore{}
	h := NewPushTokenHandler(store)
	// Para quitarlo no hace falta la plataforma; se borra solo el de esta cuenta.
	if w := callPush(h.Unregister, http.MethodDelete, `{"token":"`+validPushToken+`"}`); w.Code != http.StatusNoContent {
		t.Fatalf("got %d %s", w.Code, w.Body.String())
	}
	if len(store.deleted) != 1 || store.deleted[0] != "u1|"+validPushToken {
		t.Errorf("borrado = %v", store.deleted)
	}
	if w := callPush(h.Unregister, http.MethodDelete, `{"token":"x"}`); w.Code != http.StatusBadRequest {
		t.Errorf("token inválido: got %d", w.Code)
	}
}

func TestPushTokenStoreErrorsAreGeneric(t *testing.T) {
	h := NewPushTokenHandler(&fakePushStore{err: errors.New("ERROR: relation push_tokens")})
	for _, w := range []*httptest.ResponseRecorder{
		callPush(h.Register, http.MethodPut, `{"token":"`+validPushToken+`","platform":"ios"}`),
		callPush(h.Unregister, http.MethodDelete, `{"token":"`+validPushToken+`"}`),
	} {
		if w.Code != http.StatusInternalServerError || strings.Contains(w.Body.String(), "relation") {
			t.Errorf("got %d %s", w.Code, w.Body.String())
		}
	}
}
