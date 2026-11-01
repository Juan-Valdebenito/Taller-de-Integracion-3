package attachment

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
)

// MaxMaskRegionsJSONBytes limita el texto JSON con las zonas a ocultar: 10 zonas
// ocupan menos de 1 KB, así que 4 KB sobra y evita textos gigantes.
const MaxMaskRegionsJSONBytes = 4 << 10

var (
	// ErrMaskRegionsTooLarge: el texto con las zonas supera MaxMaskRegionsJSONBytes.
	ErrMaskRegionsTooLarge = errors.New("la lista de zonas a ocultar es demasiado grande")
	// ErrInvalidMaskRegionsFormat: el texto no es una lista JSON de zonas válida.
	ErrInvalidMaskRegionsFormat = errors.New(`el formato de las zonas a ocultar no es válido: se espera una lista como [{"x":0.2,"y":0.3,"width":0.25,"height":0.1}]`)
)

// maskRegionInput: forma en que llega cada zona. Los campos son punteros para
// distinguir "no enviado" de 0 (una x olvidada no debe pasar como x=0).
type maskRegionInput struct {
	X      *float64 `json:"x"`
	Y      *float64 `json:"y"`
	Width  *float64 `json:"width"`
	Height *float64 `json:"height"`
}

// ParseMaskRegions lee las zonas a ocultar que envía la app junto a la foto,
// como texto JSON. Un texto vacío significa que no se oculta nada. La lectura es
// estricta (lista JSON, sin campos desconocidos, con los cuatro campos y sin
// texto extra) y después aplica las reglas de ValidateMaskRegions.
func ParseMaskRegions(raw string) ([]MaskRegion, error) {
	if len(raw) > MaxMaskRegionsJSONBytes {
		return nil, ErrMaskRegionsTooLarge
	}
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}

	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.DisallowUnknownFields()
	var inputs []maskRegionInput
	if err := decoder.Decode(&inputs); err != nil {
		return nil, ErrInvalidMaskRegionsFormat
	}
	// Nada más después de la lista (ej. "[] []" o "[]basura").
	if _, err := decoder.Token(); !errors.Is(err, io.EOF) {
		return nil, ErrInvalidMaskRegionsFormat
	}
	if len(inputs) > MaxMaskRegions {
		return nil, ErrTooManyMaskRegions
	}

	regions := make([]MaskRegion, 0, len(inputs))
	for i, in := range inputs {
		if missing := missingMaskFields(in); missing != "" {
			return nil, &MaskRegionError{Index: i + 1, Reason: fmt.Sprintf("no tiene %s", missing)}
		}
		regions = append(regions, MaskRegion{X: *in.X, Y: *in.Y, Width: *in.Width, Height: *in.Height})
	}
	if err := ValidateMaskRegions(regions); err != nil {
		return nil, err
	}
	return regions, nil
}

// missingMaskFields devuelve los campos que faltan, ej. "los campos x, width".
func missingMaskFields(in maskRegionInput) string {
	var missing []string
	for _, f := range []struct {
		name  string
		value *float64
	}{{"x", in.X}, {"y", in.Y}, {"width", in.Width}, {"height", in.Height}} {
		if f.value == nil {
			missing = append(missing, f.name)
		}
	}
	switch len(missing) {
	case 0:
		return ""
	case 1:
		return "el campo " + missing[0]
	default:
		return "los campos " + strings.Join(missing, ", ")
	}
}
