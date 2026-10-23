package middleware

import (
	"reflect"
	"testing"
)

// Con ?mask=true, quién subió una imagen adjunta a un reclamo se enmascara igual
// que los demás identificadores (MaskIdentifier).
func TestMaskJSONMasksAttachmentUploader(t *testing.T) {
	cases := []struct {
		key, id, want string
	}{
		{"uploadedBy", "a296333c-e797-4d3f-8102-747cf72279a6", "a296****79a6"}, // UUID
		{"uploadedBy", "usr-pass-01", "usr-****-01"},                           // id del seeder
		{"uploaded_by", "usr-pass-01", "usr-****-01"},                          // snake_case
		{"UploadedBy", "usr-pass-01", "usr-****-01"},                           // sin importar mayúsculas
	}
	for _, tc := range cases {
		got := maskJSONRecursive(map[string]interface{}{tc.key: tc.id}).(map[string]interface{})
		if got[tc.key] != tc.want {
			t.Errorf("%s=%q: got %v, want %q", tc.key, tc.id, got[tc.key], tc.want)
		}
	}
}

// Una imagen sin usuario (uploadedBy null, usuario eliminado) queda null; el
// resto de los datos de la imagen no se modifica.
func TestMaskJSONKeepsTheRestOfTheAttachment(t *testing.T) {
	attachment := map[string]interface{}{
		"id":            "att-1",
		"complaintId":   "comp-seed-03",
		"mimeType":      "image/jpeg",
		"sizeBytes":     float64(245000),
		"width":         float64(1280),
		"height":        float64(960),
		"sha256":        "ab12",
		"maskedRegions": float64(2),
		"uploadedBy":    nil,
		"createdAt":     "2026-10-23T15:00:00Z",
	}
	got := maskJSONRecursive(attachment)
	if !reflect.DeepEqual(got, attachment) {
		t.Fatalf("no debe cambiar nada más:\n got  %v\n want %v", got, attachment)
	}
}

// Dentro del detalle de un reclamo, las imágenes vienen en una lista: también se enmascaran.
func TestMaskJSONMasksUploaderInsideComplaintAttachments(t *testing.T) {
	complaint := map[string]interface{}{
		"id":          "comp-seed-03",
		"passengerId": "usr-pass-02",
		"attachments": []interface{}{
			map[string]interface{}{"id": "att-1", "uploadedBy": "usr-pass-02"},
			map[string]interface{}{"id": "att-2", "uploadedBy": "a296333c-e797-4d3f-8102-747cf72279a6"},
		},
	}
	got := maskJSONRecursive(complaint).(map[string]interface{})
	attachments := got["attachments"].([]interface{})
	if a := attachments[0].(map[string]interface{}); a["uploadedBy"] != "usr-****-02" || a["id"] != "att-1" {
		t.Errorf("imagen 1: %v", a)
	}
	if a := attachments[1].(map[string]interface{}); a["uploadedBy"] != "a296****79a6" {
		t.Errorf("imagen 2: %v", a)
	}
}
