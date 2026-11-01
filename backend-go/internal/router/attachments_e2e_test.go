package router

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"hash/crc32"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/filestore"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/handler"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/token"
)

// Prueba de punta a punta de las imágenes de reclamos: router real, servicio,
// repositorios contra PostgreSQL y almacenamiento en disco, todo por HTTP.
//
// Solo corre si TEST_DATABASE_URL apunta a una base de PRUEBA (los datos se
// crean y se borran) ya migrada. Basta con iniciar el backend una vez contra
// ella (aplica las migraciones al arrancar):
//
//	psql -c "CREATE DATABASE transithub_test;"
//	DATABASE_URL=postgresql://postgres:postgres@localhost:5432/transithub_test go run ./cmd/server
//	TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/transithub_test go test ./internal/router -run E2E

type e2eEnv struct {
	router      *gin.Engine
	store       *filestore.DiskStore
	complaintID string
	owner       string // token del pasajero dueño
	stranger    string // token de otro pasajero
	admin       string // token de un administrador
}

func setupE2E(t *testing.T) *e2eEnv {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL no definida: se omite la prueba de punta a punta")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err := pool.Ping(ctx); err != nil {
		t.Fatal(err)
	}

	// Datos propios de la prueba (se borran al terminar). Solo columnas que
	// existen tanto en las migraciones como en database_setup.sql.
	suffix := time.Now().Format("150405.000000000")
	var companyID, ownerID, strangerID, adminID, complaintID string
	exec := func(dst *string, sql string, args ...any) {
		t.Helper()
		if err := pool.QueryRow(ctx, sql, args...).Scan(dst); err != nil {
			t.Fatal(err)
		}
	}
	exec(&companyID, `INSERT INTO companies (name, rut, email) VALUES ('Empresa e2e', $1, $2) RETURNING id`, "rut-"+suffix, "e2e-"+suffix+"@empresa.cl")
	user := `INSERT INTO users (name, email, "passwordHash", role, "companyId") VALUES ($1, $2, 'x', $3, $4) RETURNING id`
	exec(&ownerID, user, "Dueño", "dueno-"+suffix+"@test.cl", "PASSENGER", companyID)
	exec(&strangerID, user, "Otro", "otro-"+suffix+"@test.cl", "PASSENGER", companyID)
	exec(&adminID, user, "Admin", "admin-"+suffix+"@test.cl", "ADMIN", companyID)
	exec(&complaintID, `INSERT INTO complaints (title, description, "passengerId", "companyId") VALUES ('Patente ilegible', 'Prueba e2e', $1, $2) RETURNING id`, ownerID, companyID)
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM complaints WHERE id = $1`, complaintID) // borra también sus imágenes
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = ANY($1)`, []string{ownerID, strangerID, adminID})
		_, _ = pool.Exec(ctx, `DELETE FROM companies WHERE id = $1`, companyID)
	})

	store, err := filestore.NewDiskStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	complaintRepo := repository.NewComplaintRepository(pool)
	svc := service.NewAttachmentService(complaintRepo, repository.NewComplaintAttachmentRepository(pool), store)

	gin.SetMode(gin.TestMode)
	r := Setup([]string{"http://localhost:5173"}, testSecret, pool, token.NewMemoryStore(),
		nil, nil, nil, nil, nil, nil, handler.NewComplaintHandler(complaintRepo, nil, nil), nil,
		handler.NewAttachmentHandler(svc))

	return &e2eEnv{
		router: r, store: store, complaintID: complaintID,
		owner:    accessToken(t, ownerID, "PASSENGER"),
		stranger: accessToken(t, strangerID, "PASSENGER"),
		admin:    accessToken(t, adminID, "ADMIN"),
	}
}

// photoWithGPS: PNG real con un fragmento de texto con coordenadas GPS, como
// los metadatos que deja un celular.
func photoWithGPS(t *testing.T) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, 80, 60))
	for y := 0; y < 60; y++ {
		for x := 0; x < 80; x++ {
			img.Set(x, y, color.NRGBA{R: uint8(x * 3), G: uint8(y * 4), B: 120, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	clean := buf.Bytes()
	text := append([]byte("tEXt"), []byte("Comment\x00GPS -38.7359 -72.5904")...)
	chunk := make([]byte, 4, 4+len(text)+4)
	binary.BigEndian.PutUint32(chunk, uint32(len(text)-4))
	chunk = append(chunk, text...)
	chunk = binary.BigEndian.AppendUint32(chunk, crc32.ChecksumIEEE(text))
	idat := bytes.Index(clean, []byte("IDAT")) - 4
	return append(append(append([]byte{}, clean[:idat]...), chunk...), clean[idat:]...)
}

func (e *e2eEnv) do(t *testing.T, method, path, bearer string, body io.Reader, contentType string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, body)
	req.RemoteAddr = "198.51.100.7:4000"
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	w := httptest.NewRecorder()
	e.router.ServeHTTP(w, req)
	return w
}

func (e *e2eEnv) upload(t *testing.T, bearer string, photo []byte, zones string) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	if zones != "" {
		_ = w.WriteField("maskRegions", zones)
	}
	part, _ := w.CreateFormFile("file", "foto privada.png")
	_, _ = part.Write(photo)
	_ = w.Close()
	return e.do(t, http.MethodPost, "/api/v1/complaints/"+e.complaintID+"/attachments", bearer, &body, w.FormDataContentType())
}

func filesIn(t *testing.T, root string) int {
	t.Helper()
	n := 0
	_ = filepath.WalkDir(root, func(_ string, d os.DirEntry, err error) error {
		if err == nil && !d.IsDir() {
			n++
		}
		return nil
	})
	return n
}

func TestE2EComplaintAttachmentsFlow(t *testing.T) {
	e := setupE2E(t)
	base := "/api/v1/complaints/" + e.complaintID + "/attachments"
	photo := photoWithGPS(t)

	// 1. El dueño sube la foto ocultando una zona.
	w := e.upload(t, e.owner, photo, `[{"x":0.25,"y":0.25,"width":0.5,"height":0.5}]`)
	if w.Code != http.StatusCreated {
		t.Fatalf("subir: %d %s", w.Code, w.Body.String())
	}
	var created map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &created)
	attID, _ := created["id"].(string)
	if attID == "" || created["maskedRegions"] != float64(1) || created["mimeType"] != "image/png" {
		t.Fatalf("imagen creada: %v", created)
	}
	if strings.Contains(w.Body.String(), "storageKey") || strings.Contains(w.Body.String(), "foto privada") {
		t.Fatalf("la respuesta no debe exponer la ruta interna ni el nombre original: %s", w.Body.String())
	}
	if n := filesIn(t, e.store.Root()); n != 1 {
		t.Fatalf("debe haber 1 archivo en disco, hay %d", n)
	}

	// 2. Listar: dueño y admin sí; otro pasajero no (404) y sin sesión 401.
	for name, bearer := range map[string]string{"dueño": e.owner, "admin": e.admin} {
		if w := e.do(t, http.MethodGet, base, bearer, nil, ""); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), attID) {
			t.Errorf("listar como %s: %d %s", name, w.Code, w.Body.String())
		}
	}
	if w := e.do(t, http.MethodGet, base, e.stranger, nil, ""); w.Code != http.StatusNotFound {
		t.Errorf("listar como otro pasajero: want 404, got %d", w.Code)
	}
	if w := e.do(t, http.MethodGet, base, "", nil, ""); w.Code != http.StatusUnauthorized {
		t.Errorf("listar sin sesión: want 401, got %d", w.Code)
	}

	// 3. Descargar: PNG válido, con encabezados de seguridad y sin el texto con GPS.
	w = e.do(t, http.MethodGet, base+"/"+attID+"/file", e.owner, nil, "")
	if w.Code != http.StatusOK || w.Header().Get("Content-Type") != "image/png" {
		t.Fatalf("descargar: %d %v", w.Code, w.Header())
	}
	if w.Header().Get("X-Content-Type-Options") != "nosniff" || !strings.Contains(w.Header().Get("Cache-Control"), "no-store") {
		t.Errorf("faltan encabezados de seguridad: %v", w.Header())
	}
	if bytes.Contains(w.Body.Bytes(), []byte("GPS")) || bytes.Contains(w.Body.Bytes(), []byte("tEXt")) {
		t.Error("la foto guardada no debe conservar metadatos con GPS")
	}
	if _, err := png.Decode(bytes.NewReader(w.Body.Bytes())); err != nil {
		t.Errorf("la descarga debe ser un PNG válido: %v", err)
	}

	// 4. Errores: admin subiendo (403), archivo no imagen (415), la misma foto
	//    sanitizada otra vez (409) y el máximo de 3 imágenes (409).
	if w := e.upload(t, e.admin, photo, ""); w.Code != http.StatusForbidden {
		t.Errorf("admin subiendo: want 403, got %d", w.Code)
	}
	if w := e.upload(t, e.owner, []byte("no es una imagen"), ""); w.Code != http.StatusUnsupportedMediaType {
		t.Errorf("archivo no imagen: want 415, got %d", w.Code)
	}
	if w := e.upload(t, e.owner, photo, ""); w.Code != http.StatusCreated {
		t.Fatalf("segunda foto (sin zonas): %d %s", w.Code, w.Body.String())
	}
	if w := e.upload(t, e.owner, photo, ""); w.Code != http.StatusConflict {
		t.Errorf("la misma foto otra vez: want 409, got %d %s", w.Code, w.Body.String())
	}
	if w := e.upload(t, e.owner, photoWithGPS(t)[:0:0], ""); w.Code != http.StatusBadRequest {
		t.Errorf("foto vacía: want 400, got %d", w.Code)
	}
	third := photoWithGPS(t)
	third = append(third[:len(third):len(third)], []byte("x")...) // otro archivo de origen, misma imagen
	if w := e.upload(t, e.owner, third, `[{"x":0,"y":0,"width":0.2,"height":0.2}]`); w.Code != http.StatusCreated {
		t.Fatalf("tercera foto: %d %s", w.Code, w.Body.String())
	}
	if w := e.upload(t, e.owner, photo, `[{"x":0.5,"y":0.5,"width":0.2,"height":0.2}]`); w.Code != http.StatusConflict {
		t.Errorf("cuarta foto: want 409 (máximo 3), got %d %s", w.Code, w.Body.String())
	}
	if n := filesIn(t, e.store.Root()); n != 3 {
		t.Fatalf("deben quedar 3 archivos en disco (ningún huérfano), hay %d", n)
	}

	// 5. Borrar: otro pasajero no puede; el dueño sí, y el archivo desaparece.
	if w := e.do(t, http.MethodDelete, base+"/"+attID, e.stranger, nil, ""); w.Code != http.StatusNotFound {
		t.Errorf("borrar como otro pasajero: want 404, got %d", w.Code)
	}
	if w := e.do(t, http.MethodDelete, base+"/"+attID, e.owner, nil, ""); w.Code != http.StatusNoContent {
		t.Fatalf("borrar: %d %s", w.Code, w.Body.String())
	}
	if n := filesIn(t, e.store.Root()); n != 2 {
		t.Fatalf("después de borrar deben quedar 2 archivos, hay %d", n)
	}
	if w := e.do(t, http.MethodGet, base+"/"+attID+"/file", e.owner, nil, ""); w.Code != http.StatusNotFound {
		t.Errorf("descargar la imagen borrada: want 404, got %d", w.Code)
	}
}
