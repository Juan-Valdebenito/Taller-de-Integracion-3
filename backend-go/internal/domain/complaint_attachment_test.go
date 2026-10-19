package domain

import (
	"encoding/json"
	"io/fs"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/migrations"
)

func sampleAttachment() ComplaintAttachment {
	uploader := "user-1"
	return ComplaintAttachment{
		ID:            "att-1",
		ComplaintID:   "complaint-1",
		StorageKey:    "complaints/complaint-1/7f3c9b2e.jpg",
		MimeType:      "image/jpeg",
		SizeBytes:     245_000,
		Width:         1280,
		Height:        960,
		SHA256:        strings.Repeat("ab", 32),
		MaskedRegions: 2,
		UploadedBy:    &uploader,
		CreatedAt:     time.Date(2026, 10, 19, 15, 0, 0, 0, time.UTC),
	}
}

func TestComplaintAttachmentJSONNeverExposesStorageKey(t *testing.T) {
	raw, err := json.Marshal(sampleAttachment())
	if err != nil {
		t.Fatal(err)
	}

	if strings.Contains(string(raw), "storageKey") || strings.Contains(string(raw), "complaints/complaint-1/7f3c9b2e.jpg") {
		t.Fatalf("la respuesta JSON no debe incluir la ruta interna del archivo: %s", raw)
	}

	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	want := map[string]any{
		"id":            "att-1",
		"complaintId":   "complaint-1",
		"mimeType":      "image/jpeg",
		"sizeBytes":     float64(245_000),
		"width":         float64(1280),
		"height":        float64(960),
		"sha256":        strings.Repeat("ab", 32),
		"maskedRegions": float64(2),
		"uploadedBy":    "user-1",
		"createdAt":     "2026-10-19T15:00:00Z",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("JSON inesperado:\n got  %v\n want %v", got, want)
	}
}

func TestComplaintAttachmentJSONIgnoresStorageKeyFromClients(t *testing.T) {
	// Un cliente no puede elegir dónde se guarda el archivo enviando "storageKey".
	var att ComplaintAttachment
	if err := json.Unmarshal([]byte(`{"storageKey":"../../etc/passwd","mimeType":"image/png"}`), &att); err != nil {
		t.Fatal(err)
	}
	if att.StorageKey != "" {
		t.Fatalf("StorageKey no debe poder fijarse desde JSON, got %q", att.StorageKey)
	}
}

func TestComplaintAttachmentUploadedByIsNullWhenUnknown(t *testing.T) {
	att := sampleAttachment()
	att.UploadedBy = nil
	raw, err := json.Marshal(att)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), `"uploadedBy":null`) {
		t.Fatalf("uploadedBy debe ser null si el usuario se eliminó: %s", raw)
	}
}

// Los tags db deben coincidir con las columnas de la migración 000002.
func TestComplaintAttachmentDBTagsMatchMigration(t *testing.T) {
	up, err := fs.ReadFile(migrations.Filesystem(), "000002_complaint_attachments.up.sql")
	if err != nil {
		t.Fatal(err)
	}
	sql := string(up)

	typ := reflect.TypeOf(ComplaintAttachment{})
	for i := 0; i < typ.NumField(); i++ {
		column := typ.Field(i).Tag.Get("db")
		if column == "" {
			t.Errorf("campo %s sin tag db", typ.Field(i).Name)
			continue
		}
		// Las columnas camelCase van entre comillas en el SQL; las simples, sin ellas.
		quoted, plain := `"`+column+`"`, "    "+column+" "
		if !strings.Contains(sql, quoted) && !strings.Contains(sql, plain) {
			t.Errorf("la columna %q (campo %s) no existe en la migración 000002", column, typ.Field(i).Name)
		}
	}
}
