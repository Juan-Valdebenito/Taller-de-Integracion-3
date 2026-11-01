package attachment

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

func TestParseMaskRegionsValid(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		want []MaskRegion
	}{
		{
			"una patente",
			`[{"x":0.2,"y":0.3,"width":0.25,"height":0.1}]`,
			[]MaskRegion{{X: 0.2, Y: 0.3, Width: 0.25, Height: 0.1}},
		},
		{
			"dos zonas, campos en otro orden y espacios",
			` [ {"height":0.2,"width":0.2,"y":0,"x":0}, {"x":0.5,"y":0.5,"width":0.5,"height":0.5} ] `,
			[]MaskRegion{{X: 0, Y: 0, Width: 0.2, Height: 0.2}, {X: 0.5, Y: 0.5, Width: 0.5, Height: 0.5}},
		},
		{
			"números en notación científica",
			`[{"x":1e-1,"y":2E-1,"width":0.3,"height":0.4}]`,
			[]MaskRegion{{X: 0.1, Y: 0.2, Width: 0.3, Height: 0.4}},
		},
	}
	for _, tc := range cases {
		got, err := ParseMaskRegions(tc.raw)
		if err != nil {
			t.Fatalf("%s: %v", tc.name, err)
		}
		if !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%s: got %+v, want %+v", tc.name, got, tc.want)
		}
	}
}

// Sin zonas no se oculta nada.
func TestParseMaskRegionsEmpty(t *testing.T) {
	for _, raw := range []string{"", "   ", "\n\t", "[]", "null"} {
		got, err := ParseMaskRegions(raw)
		if err != nil || len(got) != 0 {
			t.Errorf("%q: want sin zonas, got %+v, %v", raw, got, err)
		}
	}
}

func TestParseMaskRegionsRejectsBadFormat(t *testing.T) {
	bad := []string{
		`{"x":0.1,"y":0.1,"width":0.2,"height":0.2}`,               // objeto en vez de lista
		`[{"x":"0.1","y":0.1,"width":0.2,"height":0.2}]`,           // número como texto
		`[{"x":0.1,"y":0.1,"width":0.2,"height":0.2,"blur":true}]`, // campo desconocido
		`[{"x":0.1,"y":0.1,"width":0.2,"height":0.2}`,              // lista sin cerrar
		`[] []`,           // dos listas
		`[]basura`,        // texto extra
		`[1, 2, 3]`,       // números sueltos
		`[[0.1,0.1,0.2]]`, // listas en vez de objetos
		`no es json`,
		`"[]"`,
	}
	for _, raw := range bad {
		if got, err := ParseMaskRegions(raw); !errors.Is(err, ErrInvalidMaskRegionsFormat) || got != nil {
			t.Errorf("%s: want ErrInvalidMaskRegionsFormat, got %+v, %v", raw, got, err)
		}
	}
}

// Un campo olvidado no pasa como 0: se informa qué zona y qué campo falta.
func TestParseMaskRegionsRequiresAllFields(t *testing.T) {
	cases := []struct {
		raw, want string
	}{
		{`[{"y":0.1,"width":0.2,"height":0.2}]`, "la zona 1 no tiene el campo x"},
		{`[{"x":0,"y":0,"width":0.2,"height":0.2},{"x":0.1,"y":0.1}]`, "la zona 2 no tiene los campos width, height"},
		{`[{}]`, "la zona 1 no tiene los campos x, y, width, height"},
	}
	for _, tc := range cases {
		_, err := ParseMaskRegions(tc.raw)
		if !errors.Is(err, ErrInvalidMaskRegion) || err.Error() != tc.want {
			t.Errorf("%s: want %q, got %v", tc.raw, tc.want, err)
		}
	}
}

// Las reglas de cada zona (4a1) se aplican al leer.
func TestParseMaskRegionsAppliesTheRules(t *testing.T) {
	_, err := ParseMaskRegions(`[{"x":0,"y":0,"width":0.2,"height":0.2},{"x":0.9,"y":0,"width":0.3,"height":0.2}]`)
	if err == nil || err.Error() != "la zona 2 sale de la imagen" {
		t.Errorf("want 'la zona 2 sale de la imagen', got %v", err)
	}
	_, err = ParseMaskRegions(`[{"x":0,"y":0,"width":0.001,"height":0.2}]`)
	if err == nil || err.Error() != "la zona 1 es demasiado pequeña" {
		t.Errorf("want 'la zona 1 es demasiado pequeña', got %v", err)
	}

	zone := `{"x":0,"y":0,"width":0.1,"height":0.1}`
	eleven := "[" + strings.Repeat(zone+",", MaxMaskRegions) + zone + "]"
	if _, err := ParseMaskRegions(eleven); !errors.Is(err, ErrTooManyMaskRegions) {
		t.Errorf("%d zonas: want ErrTooManyMaskRegions, got %v", MaxMaskRegions+1, err)
	}
}

func TestParseMaskRegionsSizeLimit(t *testing.T) {
	// Relleno de espacios justo hasta el límite: se acepta.
	valid := `[{"x":0,"y":0,"width":0.1,"height":0.1}]`
	atLimit := valid + strings.Repeat(" ", MaxMaskRegionsJSONBytes-len(valid))
	if _, err := ParseMaskRegions(atLimit); err != nil {
		t.Errorf("texto de exactamente %d bytes debe aceptarse: %v", MaxMaskRegionsJSONBytes, err)
	}
	// Un byte más se rechaza antes de interpretarlo.
	if _, err := ParseMaskRegions(atLimit + " "); !errors.Is(err, ErrMaskRegionsTooLarge) {
		t.Errorf("want ErrMaskRegionsTooLarge, got %v", err)
	}
}

// Todos los errores de lectura son culpa de la solicitud (4xx).
func TestParseMaskRegionsErrorsAreClientErrors(t *testing.T) {
	inputs := []string{
		strings.Repeat(" ", MaxMaskRegionsJSONBytes+1) + "[]",
		"no es json",
		`[{"x":0.1}]`,
		`[{"x":0.9,"y":0,"width":0.3,"height":0.2}]`,
	}
	for _, raw := range inputs {
		_, err := ParseMaskRegions(raw)
		if err == nil || !IsClientError(err) {
			t.Errorf("%.40q: %v debe ser error del cliente", raw, err)
		}
	}
}
