package handler

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

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/middleware"
)

// fakeAttachmentService registra con qué datos lo llamó el handler.
type fakeAttachmentService struct {
	called      bool
	actor       domain.Actor
	complaintID string
	fileData    []byte
	maskJSON    string
	err         error
}

func (f *fakeAttachmentService) Upload(_ context.Context, actor domain.Actor, complaintID string, file io.Reader, maskJSON string) (*domain.ComplaintAttachment, error) {
	f.called, f.actor, f.complaintID, f.maskJSON = true, actor, complaintID, maskJSON
	f.fileData, _ = io.ReadAll(file)
	if f.err != nil {
		return nil, f.err
	}
	uploader := actor.UserID
	return &domain.ComplaintAttachment{
		ID: "att-1", ComplaintID: complaintID, StorageKey: "complaints/" + complaintID + "/secreto.png",
		MimeType: domain.MimeTypePNG, SizeBytes: int64(len(f.fileData)), Width: 64, Height: 48,
		SHA256: strings.Repeat("ab", 32), MaskedRegions: 1, UploadedBy: &uploader,
		CreatedAt: time.Date(2026, 10, 25, 12, 0, 0, 0, time.UTC),
	}, nil
}

func (f *fakeAttachmentService) List(context.Context, domain.Actor, string) ([]domain.ComplaintAttachment, error) {
	return nil, nil
}

func (f *fakeAttachmentService) Open(context.Context, domain.Actor, string, string) (*domain.ComplaintAttachment, io.ReadCloser, error) {
	return nil, nil, nil
}

func (f *fakeAttachmentService) Delete(context.Context, domain.Actor, string, string) error {
	return nil
}

// uploadRouter monta el endpoint con un "middleware de autenticación" de prueba
// que deja al pasajero usr-pass-01 en el contexto.
func uploadRouter(svc AttachmentService) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/api/v1/complaints/:id/attachments", func(c *gin.Context) {
		c.Set(middleware.ContextUserID, "usr-pass-01")
		c.Set(middleware.ContextUserRole, "PASSENGER")
	}, NewAttachmentHandler(svc).Upload)
	return r
}

type formPart struct {
	field, filename string
	data            []byte
}

func multipartBody(t *testing.T, parts ...formPart) (*bytes.Buffer, string) {
	t.Helper()
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	for _, p := range parts {
		var (
			dst io.Writer
			err error
		)
		if p.filename != "" {
			dst, err = w.CreateFormFile(p.field, p.filename)
		} else {
			dst, err = w.CreateFormField(p.field)
		}
		if err != nil {
			t.Fatal(err)
		}
		if _, err := dst.Write(p.data); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return &body, w.FormDataContentType()
}

func postUpload(t *testing.T, svc AttachmentService, body io.Reader, contentType string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/complaints/comp-1/attachments", body)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	w := httptest.NewRecorder()
	uploadRouter(svc).ServeHTTP(w, req)
	return w
}

func errorOf(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var body map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("respuesta no es JSON: %s", w.Body.String())
	}
	return body["error"]
}

func TestUploadEndpointCreatesTheAttachment(t *testing.T) {
	svc := &fakeAttachmentService{}
	zones := `[{"x":0.25,"y":0.25,"width":0.5,"height":0.5}]`
	body, ct := multipartBody(t,
		formPart{field: "maskRegions", data: []byte(zones)},
		formPart{field: "file", filename: "foto de mi patente.png", data: []byte("\x89PNG contenido")},
	)

	w := postUpload(t, svc, body, ct)

	if w.Code != http.StatusCreated {
		t.Fatalf("status %d: %s", w.Code, w.Body.String())
	}
	// El servicio recibió el usuario, el reclamo, la foto y las zonas.
	want := domain.Actor{UserID: "usr-pass-01", Role: domain.UserRolePassenger}
	if svc.actor != want || svc.complaintID != "comp-1" || string(svc.fileData) != "\x89PNG contenido" || svc.maskJSON != zones {
		t.Fatalf("llamada al servicio: %+v", svc)
	}
	var got map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got["id"] != "att-1" || got["maskedRegions"] != float64(1) || got["uploadedBy"] != "usr-pass-01" {
		t.Errorf("respuesta: %v", got)
	}
	// Ni la ruta interna ni el nombre original del archivo salen en la respuesta.
	for _, leaked := range []string{"storageKey", "secreto.png", "foto de mi patente"} {
		if strings.Contains(w.Body.String(), leaked) {
			t.Errorf("la respuesta no debe contener %q: %s", leaked, w.Body.String())
		}
	}
}

func TestUploadEndpointWithoutZones(t *testing.T) {
	svc := &fakeAttachmentService{}
	body, ct := multipartBody(t, formPart{field: "file", filename: "a.jpg", data: []byte("\xff\xd8\xff")})
	if w := postUpload(t, svc, body, ct); w.Code != http.StatusCreated {
		t.Fatalf("status %d: %s", w.Code, w.Body.String())
	}
	if svc.maskJSON != "" {
		t.Errorf("sin zonas el servicio recibe \"\", got %q", svc.maskJSON)
	}
}

// Solicitudes mal formadas: 400 con un mensaje claro y sin llamar al servicio.
func TestUploadEndpointBadRequests(t *testing.T) {
	noFile, noFileCT := multipartBody(t, formPart{field: "maskRegions", data: []byte("[]")})
	twoFiles, twoFilesCT := multipartBody(t,
		formPart{field: "file", filename: "a.jpg", data: []byte("a")},
		formPart{field: "file", filename: "b.jpg", data: []byte("b")},
	)
	wrongField, wrongFieldCT := multipartBody(t, formPart{field: "imagen", filename: "a.jpg", data: []byte("a")})

	cases := []struct {
		name, contentType string
		body              io.Reader
		message           string
	}{
		{"sin la foto", noFileCT, noFile, `falta la imagen: envíala en el campo "file"`},
		{"campo con otro nombre", wrongFieldCT, wrongField, `falta la imagen: envíala en el campo "file"`},
		{"dos fotos", twoFilesCT, twoFiles, "envía una sola imagen por solicitud"},
		{"JSON en vez de formulario", "application/json", strings.NewReader(`{"file":"..."}`), `la imagen debe enviarse como formulario multipart con el campo "file"`},
		{"sin Content-Type", "", strings.NewReader("datos"), `la imagen debe enviarse como formulario multipart con el campo "file"`},
	}
	for _, tc := range cases {
		svc := &fakeAttachmentService{}
		w := postUpload(t, svc, tc.body, tc.contentType)
		if w.Code != http.StatusBadRequest || errorOf(t, w) != tc.message {
			t.Errorf("%s: got %d %q, want 400 %q", tc.name, w.Code, w.Body.String(), tc.message)
		}
		if svc.called {
			t.Errorf("%s: no debe llamarse al servicio", tc.name)
		}
	}
}

// Una solicitud más grande que el límite se corta: 413 sin llamar al servicio.
func TestUploadEndpointTooLarge(t *testing.T) {
	svc := &fakeAttachmentService{}
	body, ct := multipartBody(t, formPart{field: "file", filename: "grande.jpg", data: make([]byte, 6<<20)})

	w := postUpload(t, svc, body, ct)

	if w.Code != http.StatusRequestEntityTooLarge || errorOf(t, w) != domain.ErrAttachmentTooLarge.Error() {
		t.Fatalf("got %d %s", w.Code, w.Body.String())
	}
	if svc.called {
		t.Fatal("no debe llamarse al servicio")
	}
}

// Los errores del servicio se responden con su código y mensaje (6b1).
func TestUploadEndpointServiceErrors(t *testing.T) {
	cases := []struct {
		err    error
		status int
	}{
		{service.ErrComplaintNotFound, http.StatusNotFound},
		{service.ErrAttachmentForbidden, http.StatusForbidden},
		{domain.ErrAttachmentLimitReached, http.StatusConflict},
		{domain.ErrAttachmentUnsupportedType, http.StatusUnsupportedMediaType},
		{service.ErrAttachmentStorageUnavailable, http.StatusServiceUnavailable},
	}
	for _, tc := range cases {
		svc := &fakeAttachmentService{err: tc.err}
		body, ct := multipartBody(t, formPart{field: "file", filename: "a.jpg", data: []byte("x")})
		w := postUpload(t, svc, body, ct)
		if w.Code != tc.status || errorOf(t, w) != tc.err.Error() {
			t.Errorf("%v: got %d %s", tc.err, w.Code, w.Body.String())
		}
	}
}
