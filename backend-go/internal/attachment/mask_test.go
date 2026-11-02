package attachment

import (
	"encoding/json"
	"errors"
	"math"
	"testing"
)

func TestMaskRegionValidate(t *testing.T) {
	valid := []MaskRegion{
		{X: 0.2, Y: 0.3, Width: 0.25, Height: 0.1}, // una patente
		{X: 0, Y: 0, Width: 1, Height: 1},          // toda la foto
		{X: 0.7, Y: 0.9, Width: 0.3, Height: 0.1},  // pegada al borde inferior derecho
		{X: 0.5, Y: 0.5, Width: MinMaskRegionSize, Height: MinMaskRegionSize},
		{X: 0.7, Y: 0, Width: 0.3, Height: 0.3}, // 0.7+0.3 da 1.0000000000000002 en float64
	}
	for _, r := range valid {
		if err := r.Validate(); err != nil {
			t.Errorf("%+v debe ser válida: %v", r, err)
		}
	}

	invalid := []struct {
		region MaskRegion
		reason string
	}{
		{MaskRegion{X: math.NaN(), Y: 0, Width: 0.1, Height: 0.1}, "tiene valores inválidos"},
		{MaskRegion{X: 0, Y: 0, Width: math.Inf(1), Height: 0.1}, "tiene valores inválidos"},
		{MaskRegion{X: 0, Y: 0, Width: 0.005, Height: 0.5}, "es demasiado pequeña"},
		{MaskRegion{X: 0, Y: 0, Width: 0.5, Height: 0}, "es demasiado pequeña"},
		{MaskRegion{X: 0, Y: 0, Width: -0.2, Height: 0.5}, "es demasiado pequeña"},
		{MaskRegion{X: -0.1, Y: 0, Width: 0.5, Height: 0.5}, "sale de la imagen"},
		{MaskRegion{X: 0, Y: -0.01, Width: 0.5, Height: 0.5}, "sale de la imagen"},
		{MaskRegion{X: 0.8, Y: 0, Width: 0.3, Height: 0.5}, "sale de la imagen"},
		{MaskRegion{X: 0, Y: 0.95, Width: 0.5, Height: 0.1}, "sale de la imagen"},
		{MaskRegion{X: 2, Y: 2, Width: 0.5, Height: 0.5}, "sale de la imagen"},
	}
	for _, tc := range invalid {
		err := tc.region.Validate()
		if err == nil || err.Error() != tc.reason {
			t.Errorf("%+v: want %q, got %v", tc.region, tc.reason, err)
		}
	}
}

func TestValidateMaskRegions(t *testing.T) {
	if err := ValidateMaskRegions(nil); err != nil {
		t.Errorf("sin zonas es válido (no se oculta nada): %v", err)
	}

	max := make([]MaskRegion, MaxMaskRegions)
	for i := range max {
		max[i] = MaskRegion{X: 0, Y: 0, Width: 0.5, Height: 0.5}
	}
	if err := ValidateMaskRegions(max); err != nil {
		t.Errorf("%d zonas deben aceptarse: %v", MaxMaskRegions, err)
	}
	if err := ValidateMaskRegions(append(max, max[0])); !errors.Is(err, ErrTooManyMaskRegions) {
		t.Errorf("%d zonas: want ErrTooManyMaskRegions, got %v", MaxMaskRegions+1, err)
	}
}

// El error dice qué zona falla, contando desde 1 como el usuario.
func TestValidateMaskRegionsReportsWhichRegion(t *testing.T) {
	regions := []MaskRegion{
		{X: 0.1, Y: 0.1, Width: 0.2, Height: 0.2},
		{X: 0.9, Y: 0.1, Width: 0.2, Height: 0.2}, // sale por la derecha
	}
	err := ValidateMaskRegions(regions)
	if !errors.Is(err, ErrInvalidMaskRegion) {
		t.Fatalf("want ErrInvalidMaskRegion, got %v", err)
	}
	var regionErr *MaskRegionError
	if !errors.As(err, &regionErr) || regionErr.Index != 2 {
		t.Fatalf("debe indicar la zona 2, got %v", err)
	}
	if got := err.Error(); got != "la zona 2 sale de la imagen" {
		t.Errorf("mensaje para el usuario: %q", got)
	}
}

// Zonas mal enviadas son culpa de la solicitud: la API responderá 4xx con el mensaje.
func TestMaskRegionErrorsAreClientErrors(t *testing.T) {
	if got := ErrTooManyMaskRegions.Error(); got != "se pueden ocultar como máximo 10 zonas por imagen" {
		t.Errorf("mensaje inesperado: %q", got)
	}
	tooMany := ValidateMaskRegions(make([]MaskRegion, MaxMaskRegions+1))
	outside := ValidateMaskRegions([]MaskRegion{{X: 0.9, Y: 0, Width: 0.5, Height: 0.5}})
	for _, err := range []error{tooMany, outside} {
		if !IsClientError(err) {
			t.Errorf("%v debe considerarse error del cliente (4xx)", err)
		}
	}
}

// Formato JSON que enviará la app.
func TestMaskRegionJSON(t *testing.T) {
	var regions []MaskRegion
	if err := json.Unmarshal([]byte(`[{"x":0.2,"y":0.3,"width":0.25,"height":0.1}]`), &regions); err != nil {
		t.Fatal(err)
	}
	want := MaskRegion{X: 0.2, Y: 0.3, Width: 0.25, Height: 0.1}
	if len(regions) != 1 || regions[0] != want {
		t.Fatalf("got %+v, want %+v", regions, want)
	}
}
