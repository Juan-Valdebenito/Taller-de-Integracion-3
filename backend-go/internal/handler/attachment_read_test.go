package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/middleware"
)

// trackedFile registra si el handler cerró el archivo.
type trackedFile struct {
	io.Reader
	closed bool
}

func (f *trackedFile) Close() error { f.closed = true; return nil }

// readFake: servicio falso para listar y descargar.
type readFake struct {
	list    []domain.ComplaintAttachment
	listErr error
	att     *domain.ComplaintAttachment
	file    *trackedFile
	openErr error
	actor   domain.Actor
	ids     [2]string
}

func (f *readFake) Upload(context.Context, domain.Actor, string, io.Reader, string) (*domain.ComplaintAttachment, error) {
	return nil, errors.New("no usado")
}

func (f *readFake) List(_ context.Context, actor domain.Actor, complaintID string) ([]domain.ComplaintAttachment, error) {
	f.actor, f.ids[0] = actor, complaintID
	return f.list, f.listErr
}

func (f *readFake) Open(_ context.Context, actor domain.Actor, complaintID, attachmentID string) (*domain.ComplaintAttachment, io.ReadCloser, error) {
	f.actor, f.ids = actor, [2]string{complaintID, attachmentID}
	if f.openErr != nil {
		return nil, nil, f.openErr
	}
	return f.att, f.file, nil
}

func (f *readFake) Delete(context.Context, domain.Actor, string, string) error { return nil }

func readRouter(svc AttachmentService) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	auth := func(c *gin.Context) {
		c.Set(middleware.ContextUserID, "usr-admin-01")
		c.Set(middleware.ContextUserRole, "ADMIN")
	}
	h := NewAttachmentHandler(svc)
	r.GET("/api/v1/complaints/:id/attachments", auth, h.List)
	r.GET("/api/v1/complaints/:id/attachments/:attachmentId/file", auth, h.Download)
	return r
}

func get(t *testing.T, svc AttachmentService, path string) *httptest.ResponseRecorder {
	t.Helper()
	w := httptest.NewRecorder()
	readRouter(svc).ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
	return w
}

func sampleAttachment(mime string, size int64) *domain.ComplaintAttachment {
	return &domain.ComplaintAttachment{
		ID: "att-1", ComplaintID: "comp-1", StorageKey: "complaints/comp-1/secreto.png",
		MimeType: mime, SizeBytes: size, Width: 64, Height: 48, SHA256: strings.Repeat("ab", 32),
		CreatedAt: time.Date(2026, 10, 25, 12, 0, 0, 0, time.UTC),
	}
}

func TestListEndpoint(t *testing.T) {
	svc := &readFake{list: []domain.ComplaintAttachment{*sampleAttachment(domain.MimeTypePNG, 10)}}
	w := get(t, svc, "/api/v1/complaints/comp-1/attachments")

	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body.String())
	}
	var got []map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || len(got) != 1 || got[0]["id"] != "att-1" {
		t.Fatalf("lista: %s (%v)", w.Body.String(), err)
	}
	if strings.Contains(w.Body.String(), "storageKey") || strings.Contains(w.Body.String(), "secreto") {
		t.Errorf("la lista no debe mostrar rutas internas: %s", w.Body.String())
	}
	if svc.actor.Role != domain.UserRoleAdmin || svc.ids[0] != "comp-1" {
		t.Errorf("el servicio debe recibir el usuario y el reclamo: %+v %v", svc.actor, svc.ids)
	}
}

// Sin imágenes la respuesta es [] (no null), para que la app no tenga que distinguir.
func TestListEndpointEmpty(t *testing.T) {
	w := get(t, &readFake{list: []domain.ComplaintAttachment{}}, "/api/v1/complaints/comp-1/attachments")
	if w.Code != http.StatusOK || strings.TrimSpace(w.Body.String()) != "[]" {
		t.Fatalf("got %d %s", w.Code, w.Body.String())
	}
}

func TestListEndpointErrors(t *testing.T) {
	w := get(t, &readFake{listErr: service.ErrComplaintNotFound}, "/api/v1/complaints/comp-1/attachments")
	if w.Code != http.StatusNotFound || errorOf(t, w) != "reclamo no encontrado" {
		t.Fatalf("got %d %s", w.Code, w.Body.String())
	}
}

func TestDownloadEndpointServesTheImage(t *testing.T) {
	content := "\x89PNG contenido de la imagen"
	file := &trackedFile{Reader: strings.NewReader(content)}
	svc := &readFake{att: sampleAttachment(domain.MimeTypePNG, int64(len(content))), file: file}

	w := get(t, svc, "/api/v1/complaints/comp-1/attachments/att-1/file")

	if w.Code != http.StatusOK || w.Body.String() != content {
		t.Fatalf("got %d %q", w.Code, w.Body.String())
	}
	h := w.Header()
	want := map[string]string{
		"Content-Type":            "image/png",
		"Content-Length":          "27",
		"X-Content-Type-Options":  "nosniff",
		"Content-Security-Policy": "default-src 'none'; sandbox",
		"Cache-Control":           "private, no-store",
		"Content-Disposition":     `inline; filename="reclamo-imagen-att-1.png"`,
	}
	for k, v := range want {
		if h.Get(k) != v {
			t.Errorf("%s: got %q, want %q", k, h.Get(k), v)
		}
	}
	if svc.ids != [2]string{"comp-1", "att-1"} {
		t.Errorf("el servicio debe recibir reclamo e imagen: %v", svc.ids)
	}
	if !file.closed {
		t.Error("el archivo debe cerrarse después de enviarlo")
	}
}

func TestDownloadEndpointJPEGName(t *testing.T) {
	file := &trackedFile{Reader: strings.NewReader("\xff\xd8\xff")}
	w := get(t, &readFake{att: sampleAttachment(domain.MimeTypeJPEG, 3), file: file}, "/api/v1/complaints/comp-1/attachments/att-1/file")
	if w.Header().Get("Content-Type") != "image/jpeg" || w.Header().Get("Content-Disposition") != `inline; filename="reclamo-imagen-att-1.jpg"` {
		t.Fatalf("encabezados: %v", w.Header())
	}
}

func TestDownloadEndpointErrors(t *testing.T) {
	cases := []struct {
		err    error
		status int
	}{
		{service.ErrComplaintNotFound, http.StatusNotFound},
		{service.ErrAttachmentNotFound, http.StatusNotFound},
		{service.ErrAttachmentStorageUnavailable, http.StatusServiceUnavailable},
		{errors.New("disco dañado"), http.StatusInternalServerError},
	}
	for _, tc := range cases {
		w := get(t, &readFake{openErr: tc.err}, "/api/v1/complaints/comp-1/attachments/att-1/file")
		if w.Code != tc.status {
			t.Errorf("%v: got %d %s", tc.err, w.Code, w.Body.String())
		}
		if strings.Contains(w.Body.String(), "disco dañado") {
			t.Errorf("el detalle interno no debe llegar al usuario: %s", w.Body.String())
		}
	}
}

// Un registro con un tipo que no es JPEG ni PNG (dato inconsistente) no se sirve
// con ese tipo: error interno, y el archivo igual se cierra.
func TestDownloadEndpointRefusesUnexpectedTypes(t *testing.T) {
	file := &trackedFile{Reader: strings.NewReader("<svg>...</svg>")}
	w := get(t, &readFake{att: sampleAttachment("image/svg+xml", 14), file: file}, "/api/v1/complaints/comp-1/attachments/att-1/file")
	if w.Code != http.StatusInternalServerError || strings.Contains(w.Body.String(), "<svg") {
		t.Fatalf("got %d %s", w.Code, w.Body.String())
	}
	if !file.closed {
		t.Error("el archivo debe cerrarse")
	}
}

func TestSafeFilenamePart(t *testing.T) {
	cases := map[string]string{
		"att-1":                                "att-1",
		"7f3c9b2e-1d4a-4c8e-9a51-0b6f2d8e4c17": "7f3c9b2e-1d4a-4c8e-9a51-0b6f2d8e4c17",
		`a"; filename="hack.exe`:               "afilenamehackexe",
		"../../etc":                            "etc",
		"\r\nSet-Cookie: x":                    "Set-Cookiex",
		"":                                     "archivo",
		"ñandú":                                "and",
	}
	for in, want := range cases {
		if got := safeFilenamePart(in); got != want {
			t.Errorf("%q: got %q, want %q", in, got, want)
		}
	}
	if got := safeFilenamePart(strings.Repeat("a", 200)); len(got) != 64 {
		t.Errorf("el nombre debe limitarse a 64 caracteres, mide %d", len(got))
	}
}
