package repository

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// GET /api/v1/companies debe usar los mismos nombres de campo (camelCase) que
// el resto de la API y que esperan el frontend y la app móvil.
func TestCompanyJSONFieldNames(t *testing.T) {
	phone := "+56 45 1234 567"
	data, err := json.Marshal(domain.Company{ID: "c1", Name: "Buses Temuco", Rut: "76.000.000-0", Email: "a@b.cl", Phone: &phone, IsActive: true, CreatedAt: time.Unix(0, 0)})
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"id", "name", "rut", "email", "phone", "address", "isActive", "createdAt", "updatedAt"} {
		if _, ok := got[key]; !ok {
			t.Errorf("falta el campo %q en %s", key, data)
		}
	}
	if len(got) != 9 {
		t.Errorf("campos inesperados en %s", data)
	}
}
