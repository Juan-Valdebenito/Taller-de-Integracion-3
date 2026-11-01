package router

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/handler"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/middleware"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/token"
)

const testSecret = "test-secret"

// routedFake: servicio de imágenes falso; registra qué método llegó a usarse.
type routedFake struct{ calls []string }

func (f *routedFake) Upload(_ context.Context, actor domain.Actor, complaintID string, file io.Reader, _ string) (*domain.ComplaintAttachment, error) {
	f.calls = append(f.calls, "upload")
	_, _ = io.ReadAll(file)
	uploader := actor.UserID
	return &domain.ComplaintAttachment{ID: "att-1", ComplaintID: complaintID, MimeType: domain.MimeTypePNG, UploadedBy: &uploader}, nil
}

func (f *routedFake) List(_ context.Context, actor domain.Actor, complaintID string) ([]domain.ComplaintAttachment, error) {
	f.calls = append(f.calls, "list")
	uploader := actor.UserID
	return []domain.ComplaintAttachment{{ID: "att-1", ComplaintID: complaintID, UploadedBy: &uploader}}, nil
}

func (f *routedFake) Open(_ context.Context, _ domain.Actor, complaintID, attachmentID string) (*domain.ComplaintAttachment, io.ReadCloser, error) {
	f.calls = append(f.calls, "open")
	return &domain.ComplaintAttachment{ID: attachmentID, ComplaintID: complaintID, MimeType: domain.MimeTypePNG, SizeBytes: 4},
		io.NopCloser(strings.NewReader("\x89PNG")), nil
}

func (f *routedFake) Delete(context.Context, domain.Actor, string, string) error {
	f.calls = append(f.calls, "delete")
	return nil
}

// setupAttachments arma el router real. complaintH no nil = hay base de datos.
func setupAttachments(t *testing.T, dbAvailable bool, extras ...interface{}) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	var complaintH *handler.ComplaintHandler
	if dbAvailable {
		complaintH = handler.NewComplaintHandler(nil, nil, nil)
	}
	return Setup([]string{"http://localhost:5173"}, testSecret, nil, token.NewMemoryStore(),
		nil, nil, nil, nil, nil, nil, complaintH, nil, extras...)
}

func accessToken(t *testing.T, userID, role string) string {
	t.Helper()
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"id": userID, "email": userID + "@test.cl", "role": role, "type": "access",
		"jti": "jti-" + userID, "exp": time.Now().Add(time.Hour).Unix(),
	}).SignedString([]byte(testSecret))
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

type routeCase struct{ method, path string }

var attachmentRoutes = []routeCase{
	{http.MethodPost, "/api/v1/complaints/comp-1/attachments"},
	{http.MethodGet, "/api/v1/complaints/comp-1/attachments"},
	{http.MethodGet, "/api/v1/complaints/comp-1/attachments/att-1/file"},
	{http.MethodDelete, "/api/v1/complaints/comp-1/attachments/att-1"},
}

func request(t *testing.T, r *gin.Engine, method, path, bearer string) *httptest.ResponseRecorder {
	t.Helper()
	var body io.Reader
	contentType := ""
	if method == http.MethodPost {
		var buf bytes.Buffer
		w := multipart.NewWriter(&buf)
		part, _ := w.CreateFormFile("file", "a.png")
		_, _ = part.Write([]byte("\x89PNG"))
		_ = w.Close()
		body, contentType = &buf, w.FormDataContentType()
	}
	req := httptest.NewRequest(method, path, body)
	req.RemoteAddr = "203.0.113.20:5000"
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// Las 4 rutas exigen sesión: sin token, 401 y el servicio no se llama.
func TestAttachmentRoutesRequireAuthentication(t *testing.T) {
	svc := &routedFake{}
	r := setupAttachments(t, true, handler.NewAttachmentHandler(svc))
	for _, rc := range attachmentRoutes {
		if w := request(t, r, rc.method, rc.path, ""); w.Code != http.StatusUnauthorized {
			t.Errorf("%s %s sin token: got %d", rc.method, rc.path, w.Code)
		}
	}
	if len(svc.calls) != 0 {
		t.Fatalf("sin sesión no debe llamarse al servicio: %v", svc.calls)
	}
}

// Con sesión, cada ruta llega a su método del handler.
func TestAttachmentRoutesReachTheHandler(t *testing.T) {
	svc := &routedFake{}
	r := setupAttachments(t, true, handler.NewAttachmentHandler(svc))
	bearer := accessToken(t, "usr-pass-01", "PASSENGER")

	want := []struct {
		status int
		call   string
	}{
		{http.StatusCreated, "upload"},
		{http.StatusOK, "list"},
		{http.StatusOK, "open"},
		{http.StatusNoContent, "delete"},
	}
	for i, rc := range attachmentRoutes {
		w := request(t, r, rc.method, rc.path, bearer)
		if w.Code != want[i].status {
			t.Errorf("%s %s: got %d %s", rc.method, rc.path, w.Code, w.Body.String())
		}
	}
	if strings.Join(svc.calls, ",") != "upload,list,open,delete" {
		t.Fatalf("métodos llamados: %v", svc.calls)
	}
}

// Sin almacenamiento (handler nil): las rutas existen y responden 503 con su mensaje.
func TestAttachmentRoutesWithoutStorage(t *testing.T) {
	r := setupAttachments(t, true)
	bearer := accessToken(t, "usr-pass-01", "PASSENGER")
	for _, rc := range attachmentRoutes {
		w := request(t, r, rc.method, rc.path, bearer)
		var body map[string]string
		_ = json.Unmarshal(w.Body.Bytes(), &body)
		if w.Code != http.StatusServiceUnavailable || body["error"] != service.ErrAttachmentStorageUnavailable.Error() || w.Header().Get("Retry-After") == "" {
			t.Errorf("%s %s: got %d %s", rc.method, rc.path, w.Code, w.Body.String())
		}
	}
}

// Sin base de datos (modo degradado), las rutas responden 503 por la base.
func TestAttachmentRoutesWithoutDatabase(t *testing.T) {
	svc := &routedFake{}
	r := setupAttachments(t, false, handler.NewAttachmentHandler(svc))
	bearer := accessToken(t, "usr-pass-01", "PASSENGER")
	for _, rc := range attachmentRoutes {
		if w := request(t, r, rc.method, rc.path, bearer); w.Code != http.StatusServiceUnavailable {
			t.Errorf("%s %s: got %d", rc.method, rc.path, w.Code)
		}
	}
	if len(svc.calls) != 0 {
		t.Fatalf("sin base no debe llamarse al servicio: %v", svc.calls)
	}
}

// El limitador de subidas corta solo las subidas (429); listar sigue funcionando.
func TestAttachmentUploadRateLimit(t *testing.T) {
	limiter := middleware.NewIPRateLimiter(middleware.RateLimitConfig{Name: "uploads", RequestsPerMinute: 1, Burst: 1})
	r := setupAttachments(t, true, handler.NewAttachmentHandler(&routedFake{}), limiter)
	bearer := accessToken(t, "usr-pass-01", "PASSENGER")
	upload := attachmentRoutes[0]

	if w := request(t, r, upload.method, upload.path, bearer); w.Code != http.StatusCreated {
		t.Fatalf("primera subida: got %d", w.Code)
	}
	if w := request(t, r, upload.method, upload.path, bearer); w.Code != http.StatusTooManyRequests {
		t.Fatalf("segunda subida seguida: want 429, got %d", w.Code)
	}
	if w := request(t, r, http.MethodGet, attachmentRoutes[1].path, bearer); w.Code != http.StatusOK {
		t.Fatalf("listar no debe limitarse: got %d", w.Code)
	}
}

// Las rutas están dentro del grupo de reclamos: ?mask=true enmascara quién subió.
func TestAttachmentListMaskedThroughTheComplaintsGroup(t *testing.T) {
	r := setupAttachments(t, true, handler.NewAttachmentHandler(&routedFake{}))
	bearer := accessToken(t, "usr-pass-01", "PASSENGER")
	w := request(t, r, http.MethodGet, "/api/v1/complaints/comp-1/attachments?mask=true", bearer)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "usr-****-01") || strings.Contains(w.Body.String(), "usr-pass-01") {
		t.Fatalf("got %d %s", w.Code, w.Body.String())
	}
}
