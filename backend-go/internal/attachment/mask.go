package attachment

import (
	"errors"
	"fmt"
	"image"
	"math"
)

// MaskRegion es una zona de la foto que el pasajero marca en la app para
// ocultarla (un rostro, una patente) antes de guardar la imagen.
//
// Las coordenadas son relativas, de 0 a 1, sobre la foto tal como la ve el
// usuario: x=0.2 es el 20 % del ancho desde la izquierda. Así la zona sigue
// siendo correcta aunque la sanitización gire o reduzca la imagen.
type MaskRegion struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

const (
	// MaxMaskRegions es la cantidad máxima de zonas a ocultar por imagen.
	MaxMaskRegions = 10
	// MinMaskRegionSize: cada lado de la zona mide al menos el 1 % de la foto.
	MinMaskRegionSize = 0.01
	// maskTolerance absorbe errores de redondeo de la app (ej. 0.7 + 0.3 = 1.0000000000000002).
	maskTolerance = 1e-9
)

var (
	// ErrTooManyMaskRegions: se enviaron más zonas de las permitidas.
	ErrTooManyMaskRegions = fmt.Errorf("se pueden ocultar como máximo %d zonas por imagen", MaxMaskRegions)
	// ErrInvalidMaskRegion agrupa los errores de una zona concreta (ver MaskRegionError).
	ErrInvalidMaskRegion = errors.New("zona a ocultar inválida")
)

// MaskRegionError indica qué zona es inválida y por qué, con un mensaje para el usuario.
type MaskRegionError struct {
	// Index es la posición de la zona, desde 1 (como la ve el usuario).
	Index  int
	Reason string
}

func (e *MaskRegionError) Error() string {
	return fmt.Sprintf("la zona %d %s", e.Index, e.Reason)
}

// Is permite usar errors.Is(err, ErrInvalidMaskRegion).
func (e *MaskRegionError) Is(target error) bool { return target == ErrInvalidMaskRegion }

// Validate comprueba que la zona tenga valores numéricos válidos, un tamaño
// mínimo y que quede completamente dentro de la foto.
func (r MaskRegion) Validate() error {
	for _, v := range []float64{r.X, r.Y, r.Width, r.Height} {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return errors.New("tiene valores inválidos")
		}
	}
	if r.Width < MinMaskRegionSize || r.Height < MinMaskRegionSize {
		return errors.New("es demasiado pequeña")
	}
	if r.X < 0 || r.Y < 0 || r.X+r.Width > 1+maskTolerance || r.Y+r.Height > 1+maskTolerance {
		return errors.New("sale de la imagen")
	}
	return nil
}

// ToPixels convierte la zona relativa en un rectángulo de píxeles para una
// imagen de width×height. Redondea hacia afuera (inicio hacia abajo, final
// hacia arriba) para que la zona cubra siempre todo lo marcado: es preferible
// ocultar un píxel de más que dejar sin ocultar el borde de una patente.
// El resultado queda recortado a los límites de la imagen.
func (r MaskRegion) ToPixels(width, height int) image.Rectangle {
	x0 := floorPixel(r.X * float64(width))
	y0 := floorPixel(r.Y * float64(height))
	x1 := ceilPixel((r.X + r.Width) * float64(width))
	y1 := ceilPixel((r.Y + r.Height) * float64(height))
	return image.Rect(x0, y0, x1, y1).Intersect(image.Rect(0, 0, width, height))
}

// pixelTolerance: un valor a menos de una millonésima de un entero es ese
// entero. Evita que el ruido de float64 (0.4+0.2 = 0.6000000000000001) agregue
// un píxel de más; las fracciones reales (ej. 66.7) se siguen redondeando.
const pixelTolerance = 1e-6

func floorPixel(v float64) int {
	if n := math.Round(v); math.Abs(v-n) < pixelTolerance {
		return int(n)
	}
	return int(math.Floor(v))
}

func ceilPixel(v float64) int {
	if n := math.Round(v); math.Abs(v-n) < pixelTolerance {
		return int(n)
	}
	return int(math.Ceil(v))
}

// ValidateMaskRegions comprueba la lista completa de zonas de una imagen. Una
// lista vacía es válida (no se oculta nada).
func ValidateMaskRegions(regions []MaskRegion) error {
	if len(regions) > MaxMaskRegions {
		return ErrTooManyMaskRegions
	}
	for i, r := range regions {
		if err := r.Validate(); err != nil {
			return &MaskRegionError{Index: i + 1, Reason: err.Error()}
		}
	}
	return nil
}
