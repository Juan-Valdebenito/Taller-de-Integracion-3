package domain

import (
	"errors"
	"testing"
)

func TestNormalizeRut(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{"con puntos y guion", "76.000.000-0", "76.000.000-0", false},
		{"sin formato", "760000000", "76.000.000-0", false},
		{"dígito K en minúscula", "12.345.678-5", "12.345.678-5", false},
		{"verificador K", "10.000.013-k", "10.000.013-K", false},
		{"cuerpo corto", "1-9", "1-9", false},
		{"con espacios", " 76 000 000 - 0 ", "76.000.000-0", false},
		{"verificador incorrecto", "76.000.000-1", "", true},
		{"letras", "AB.CDE.FGH-I", "", true},
		{"vacío", "", "", true},
		{"solo ceros", "0-0", "", true},
		{"demasiado largo", "123456789-0", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := NormalizeRut(tt.input)
			if tt.wantErr {
				if !errors.Is(err, ErrCompanyRutInvalid) {
					t.Fatalf("NormalizeRut(%q) error = %v; esperado ErrCompanyRutInvalid", tt.input, err)
				}
				return
			}
			if err != nil || got != tt.want {
				t.Fatalf("NormalizeRut(%q) = %q, %v; esperado %q", tt.input, got, err, tt.want)
			}
		})
	}
}

func ptr(s string) *string { return &s }

func TestCompanyInputNormalize(t *testing.T) {
	valid := CompanyInput{Name: "  Buses Ñielol  ", Rut: "760000000", Email: " Contacto@Nielol.CL ", Phone: ptr(" +56 45 2345 678 "), Address: ptr("  ")}

	got, err := valid.Normalize()
	if err != nil {
		t.Fatalf("Normalize() error = %v", err)
	}
	if got.Name != "Buses Ñielol" || got.Rut != "76.000.000-0" || got.Email != "contacto@nielol.cl" {
		t.Errorf("Normalize() = %+v", got)
	}
	if got.Phone == nil || *got.Phone != "+56 45 2345 678" {
		t.Errorf("teléfono = %v", got.Phone)
	}
	if got.Address != nil {
		t.Errorf("una dirección vacía debe quedar nil, es %q", *got.Address)
	}

	invalid := []struct {
		name   string
		mutate func(*CompanyInput)
		want   error
	}{
		{"sin nombre", func(in *CompanyInput) { in.Name = "  " }, ErrCompanyNameRequired},
		{"nombre largo", func(in *CompanyInput) { in.Name = string(make([]rune, MaxCompanyNameLength+1)) + "x" }, ErrCompanyNameTooLong},
		{"RUT inválido", func(in *CompanyInput) { in.Rut = "76.000.000-1" }, ErrCompanyRutInvalid},
		{"correo sin arroba", func(in *CompanyInput) { in.Email = "contacto.cl" }, ErrCompanyEmailInvalid},
		{"teléfono con letras", func(in *CompanyInput) { in.Phone = ptr("llamar al 123") }, ErrCompanyPhoneInvalid},
		{"dirección larga", func(in *CompanyInput) { in.Address = ptr(string(make([]byte, MaxCompanyAddressLength+1))) }, ErrCompanyAddressLong},
	}
	for _, tt := range invalid {
		t.Run(tt.name, func(t *testing.T) {
			in := valid
			tt.mutate(&in)
			if _, err := in.Normalize(); !errors.Is(err, tt.want) {
				t.Fatalf("error = %v; esperado %v", err, tt.want)
			}
			if !IsCompanyValidationError(tt.want) {
				t.Errorf("%v debería ser error de validación", tt.want)
			}
		})
	}
}
