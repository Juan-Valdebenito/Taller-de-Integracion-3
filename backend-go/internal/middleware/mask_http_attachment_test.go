package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// Prueba por HTTP: un endpoint responde el detalle de un reclamo con sus
// imágenes usando el modelo real domain.ComplaintAttachment, detrás del
// SensitiveDataMasker (como el grupo /api/v1/complaints del router).

const (
	uploaderID = "a296333c-e797-4d3f-8102-747cf72279a6"
	storageKey = "complaints/comp-seed-03/9f3ca1b2c3d4e5f60718293a4b5c6d7e.jpg"
)

func complaintWithAttachmentsRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(SensitiveDataMasker())
	r.GET("/api/v1/complaints/:id", func(c *gin.Context) {
		uploader := uploaderID
		c.JSON(http.StatusOK, gin.H{
			"id":    c.Param("id"),
			"title": "Micro con patente ilegible",
			"attachments": []domain.ComplaintAttachment{
				{
					ID: "att-1", ComplaintID: c.Param("id"), StorageKey: storageKey,
					MimeType: domain.MimeTypeJPEG, SizeBytes: 245000, Width: 1280, Height: 960,
					SHA256: strings.Repeat("ab", 32), MaskedRegions: 1, UploadedBy: &uploader,
					CreatedAt: time.Date(2026, 10, 23, 15, 0, 0, 0, time.UTC),
				},
				{
					// Usuario eliminado: uploadedBy queda null.
					ID: "att-2", ComplaintID: c.Param("id"), StorageKey: storageKey + "2",
					MimeType: domain.MimeTypePNG, SizeBytes: 1000, Width: 10, Height: 10,
					SHA256: strings.Repeat("cd", 32),
				},
			},
		})
	})
	return r
}

func getComplaint(t *testing.T, query string) (string, []map[string]any) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/complaints/comp-seed-03"+query, nil)
	w := httptest.NewRecorder()
	complaintWithAttachmentsRouter().ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body.String())
	}
	var body struct {
		Attachments []map[string]any `json:"attachments"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("la respuesta debe ser JSON válido: %v (%s)", err, w.Body.String())
	}
	if len(body.Attachments) != 2 {
		t.Fatalf("se esperaban 2 imágenes: %s", w.Body.String())
	}
	return w.Body.String(), body.Attachments
}

// Sin ?mask=true: los datos se ven completos, pero la ruta interna del archivo
// nunca sale (el modelo no la serializa).
func TestComplaintAttachmentsResponseWithoutMask(t *testing.T) {
	raw, attachments := getComplaint(t, "")

	if strings.Contains(raw, "storageKey") || strings.Contains(raw, storageKey) {
		t.Errorf("la ruta interna no debe aparecer nunca: %s", raw)
	}
	if attachments[0]["uploadedBy"] != uploaderID {
		t.Errorf("sin ?mask=true, uploadedBy se ve completo: %v", attachments[0]["uploadedBy"])
	}
	if attachments[1]["uploadedBy"] != nil {
		t.Errorf("sin usuario, uploadedBy debe ser null: %v", attachments[1]["uploadedBy"])
	}
}

// Con ?mask=true: uploadedBy enmascarado, sin ruta interna, y los demás datos de
// la imagen intactos.
func TestComplaintAttachmentsResponseWithMask(t *testing.T) {
	raw, attachments := getComplaint(t, "?mask=true")

	if strings.Contains(raw, "storageKey") || strings.Contains(raw, storageKey) || strings.Contains(raw, uploaderID) {
		t.Errorf("la respuesta enmascarada filtra datos internos o personales: %s", raw)
	}
	first := attachments[0]
	if first["uploadedBy"] != "a296****79a6" {
		t.Errorf("uploadedBy enmascarado: got %v", first["uploadedBy"])
	}
	want := map[string]any{
		"id": "att-1", "complaintId": "comp-seed-03", "mimeType": "image/jpeg",
		"sizeBytes": float64(245000), "width": float64(1280), "height": float64(960),
		"sha256": strings.Repeat("ab", 32), "maskedRegions": float64(1),
		"createdAt": "2026-10-23T15:00:00Z",
	}
	for key, value := range want {
		if first[key] != value {
			t.Errorf("%s: got %v, want %v", key, first[key], value)
		}
	}
	if attachments[1]["uploadedBy"] != nil {
		t.Errorf("sin usuario, uploadedBy sigue null: %v", attachments[1]["uploadedBy"])
	}
}

// Las únicas claves de cada imagen son las públicas: ninguna interna se cuela.
func TestComplaintAttachmentsResponseOnlyPublicFields(t *testing.T) {
	public := map[string]bool{
		"id": true, "complaintId": true, "mimeType": true, "sizeBytes": true, "width": true,
		"height": true, "sha256": true, "maskedRegions": true, "uploadedBy": true, "createdAt": true,
	}
	for _, query := range []string{"", "?mask=true"} {
		_, attachments := getComplaint(t, query)
		for _, a := range attachments {
			for key := range a {
				if !public[key] {
					t.Errorf("%q: campo no público %q en la respuesta", query, key)
				}
			}
		}
	}
}
