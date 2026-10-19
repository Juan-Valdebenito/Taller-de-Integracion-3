package repository

import (
	"encoding/json"
	"testing"
)

// GET /api/v1/companies debe usar los mismos nombres de campo (camelCase) que
// el resto de la API y que espera el frontend.
func TestCompanySummaryJSONFieldNames(t *testing.T) {
	data, err := json.Marshal(CompanySummary{ID: "c1", Name: "Buses Temuco", IsActive: true})
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"id": "c1", "name": "Buses Temuco", "isActive": true}
	for key, value := range want {
		if got[key] != value {
			t.Errorf("field %q: got %v, want %v (json=%s)", key, got[key], value, data)
		}
	}
	if len(got) != len(want) {
		t.Errorf("unexpected fields in %s", data)
	}
}
