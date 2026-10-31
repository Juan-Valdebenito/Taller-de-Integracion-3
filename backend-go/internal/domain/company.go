package domain

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Company es una empresa de transporte (tabla companies).
type Company struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Rut       string    `json:"rut"`
	Email     string    `json:"email"`
	Phone     *string   `json:"phone"`
	Address   *string   `json:"address"`
	IsActive  bool      `json:"isActive"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// CompanyInput son los datos editables de una empresa (crear o editar).
type CompanyInput struct {
	Name    string
	Rut     string
	Email   string
	Phone   *string
	Address *string
}

const (
	MaxCompanyNameLength    = 120
	MaxCompanyAddressLength = 200
	MaxCompanyPhoneLength   = 30
)

var (
	ErrCompanyNameRequired = errors.New("el nombre de la empresa es obligatorio")
	ErrCompanyNameTooLong  = fmt.Errorf("el nombre de la empresa no puede superar %d caracteres", MaxCompanyNameLength)
	ErrCompanyRutInvalid   = errors.New("el RUT no es válido (ej: 76.123.456-7)")
	ErrCompanyEmailInvalid = errors.New("el correo electrónico no es válido")
	ErrCompanyPhoneInvalid = fmt.Errorf("el teléfono solo puede tener números, espacios, + y guiones (máximo %d caracteres)", MaxCompanyPhoneLength)
	ErrCompanyAddressLong  = fmt.Errorf("la dirección no puede superar %d caracteres", MaxCompanyAddressLength)
)

var (
	rutPattern   = regexp.MustCompile(`^(\d{1,8})([\dK])$`)
	phonePattern = regexp.MustCompile(`^[\d +\-()]+$`)
	// Correo simple: algo@algo.dominio, sin espacios (el formato estricto lo valida el middleware de usuarios).
	emailPattern = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
)

// rutCheckDigit calcula el dígito verificador de un RUT chileno (módulo 11).
func rutCheckDigit(body string) string {
	sum, factor := 0, 2
	for i := len(body) - 1; i >= 0; i-- {
		sum += int(body[i]-'0') * factor
		factor++
		if factor > 7 {
			factor = 2
		}
	}
	switch rest := 11 - sum%11; rest {
	case 11:
		return "0"
	case 10:
		return "K"
	default:
		return strconv.Itoa(rest)
	}
}

// NormalizeRut valida el RUT (con su dígito verificador) y lo devuelve con
// puntos y guion: "76123456-0" → "76.123.456-0". Así el mismo RUT escrito de
// distintas formas no se registra dos veces.
func NormalizeRut(raw string) (string, error) {
	clean := strings.ToUpper(strings.NewReplacer(".", "", "-", "", " ", "").Replace(strings.TrimSpace(raw)))
	m := rutPattern.FindStringSubmatch(clean)
	if m == nil {
		return "", ErrCompanyRutInvalid
	}
	body := strings.TrimLeft(m[1], "0")
	if body == "" || rutCheckDigit(body) != m[2] {
		return "", ErrCompanyRutInvalid
	}
	var groups []string
	for len(body) > 3 {
		groups = append([]string{body[len(body)-3:]}, groups...)
		body = body[:len(body)-3]
	}
	groups = append([]string{body}, groups...)
	return strings.Join(groups, ".") + "-" + m[2], nil
}

// optionalText recorta el texto; vacío → nil.
func optionalText(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

// Normalize valida los datos y devuelve una copia lista para guardar: textos
// recortados, RUT con formato y correo en minúsculas.
func (in CompanyInput) Normalize() (CompanyInput, error) {
	out := CompanyInput{
		Name:    strings.TrimSpace(in.Name),
		Email:   strings.ToLower(strings.TrimSpace(in.Email)),
		Phone:   optionalText(in.Phone),
		Address: optionalText(in.Address),
	}
	switch {
	case out.Name == "":
		return out, ErrCompanyNameRequired
	case len([]rune(out.Name)) > MaxCompanyNameLength:
		return out, ErrCompanyNameTooLong
	}
	rut, err := NormalizeRut(in.Rut)
	if err != nil {
		return out, err
	}
	out.Rut = rut
	if len(out.Email) > 254 || !emailPattern.MatchString(out.Email) {
		return out, ErrCompanyEmailInvalid
	}
	if out.Phone != nil && (len(*out.Phone) > MaxCompanyPhoneLength || !phonePattern.MatchString(*out.Phone)) {
		return out, ErrCompanyPhoneInvalid
	}
	if out.Address != nil && len([]rune(*out.Address)) > MaxCompanyAddressLength {
		return out, ErrCompanyAddressLong
	}
	return out, nil
}

// IsCompanyValidationError indica si el error es de datos inválidos (respuesta 400).
func IsCompanyValidationError(err error) bool {
	for _, target := range []error{
		ErrCompanyNameRequired, ErrCompanyNameTooLong, ErrCompanyRutInvalid,
		ErrCompanyEmailInvalid, ErrCompanyPhoneInvalid, ErrCompanyAddressLong,
	} {
		if errors.Is(err, target) {
			return true
		}
	}
	return false
}
