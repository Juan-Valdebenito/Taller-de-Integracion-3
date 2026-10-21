package attachment

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/draw"
)

// Los celulares suelen guardar la foto tal como la captura el sensor y anotan en
// el EXIF (etiqueta Orientation, 0x0112) cómo girarla para verla derecha. Como
// la sanitización borra el EXIF, primero se lee esa etiqueta y se aplica el giro
// a los píxeles; si no, las fotos verticales quedarían acostadas.
//
// Valores de la etiqueta (especificación EXIF):
//
//	1 normal            5 transpuesta (espejo sobre la diagonal principal)
//	2 espejo horizontal 6 girar 90° a la derecha
//	3 girar 180°        7 transversa (espejo sobre la diagonal secundaria)
//	4 espejo vertical   8 girar 90° a la izquierda
const (
	orientationNormal  = 1
	exifOrientationTag = 0x0112
	exifTypeShort      = 3
)

var exifHeader = []byte("Exif\x00\x00")

// jpegOrientation busca la orientación en los segmentos APP1 (EXIF) de un JPEG.
// Los datos vienen del cliente: se revisa cada largo y, ante cualquier dato
// inválido, se asume orientación normal en vez de fallar.
func jpegOrientation(data []byte) int {
	if !bytes.HasPrefix(data, []byte{0xFF, 0xD8}) {
		return orientationNormal
	}
	i := 2
	for i+4 <= len(data) {
		if data[i] != 0xFF {
			return orientationNormal
		}
		marker := data[i+1]
		switch {
		case marker == 0xFF: // byte de relleno
			i++
			continue
		case marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7): // marcadores sin largo
			i += 2
			continue
		case marker == 0xDA || marker == 0xD9: // inicio de la imagen comprimida o fin: no hay más metadatos
			return orientationNormal
		}
		length := int(binary.BigEndian.Uint16(data[i+2:]))
		end := i + 2 + length
		if length < 2 || end > len(data) {
			return orientationNormal
		}
		if marker == 0xE1 { // APP1
			if o, ok := exifOrientation(data[i+4 : end]); ok {
				return o
			}
		}
		i = end
	}
	return orientationNormal
}

// exifOrientation lee la etiqueta Orientation del primer directorio (IFD0) de un
// bloque EXIF ("Exif\0\0" + cabecera TIFF).
func exifOrientation(segment []byte) (int, bool) {
	if !bytes.HasPrefix(segment, exifHeader) {
		return 0, false
	}
	tiff := segment[len(exifHeader):]
	if len(tiff) < 8 {
		return 0, false
	}
	var order binary.ByteOrder
	switch string(tiff[:2]) {
	case "II":
		order = binary.LittleEndian
	case "MM":
		order = binary.BigEndian
	default:
		return 0, false
	}
	if order.Uint16(tiff[2:]) != 42 {
		return 0, false
	}

	// uint64 para que posiciones enormes no se desborden al sumar.
	size := uint64(len(tiff))
	ifd := uint64(order.Uint32(tiff[4:]))
	if ifd+2 > size {
		return 0, false
	}
	entries := uint64(order.Uint16(tiff[ifd:]))
	// Un directorio que declara más entradas de las que caben está dañado: se
	// descarta entero en vez de confiar en una parte.
	if ifd+2+entries*12 > size {
		return 0, false
	}
	for k := uint64(0); k < entries; k++ {
		entry := ifd + 2 + k*12
		if order.Uint16(tiff[entry:]) != exifOrientationTag {
			continue
		}
		if order.Uint16(tiff[entry+2:]) != exifTypeShort || order.Uint32(tiff[entry+4:]) != 1 {
			return 0, false
		}
		value := int(order.Uint16(tiff[entry+8:]))
		if value < 1 || value > 8 {
			return 0, false
		}
		return value, true
	}
	return 0, false
}

// applyOrientation devuelve la imagen girada o reflejada según la orientación
// EXIF, para que se vea derecha sin necesitar el metadato.
func applyOrientation(img image.Image, orientation int) image.Image {
	if orientation < 2 || orientation > 8 {
		return img
	}
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()

	// Copia normalizada con origen (0,0) para trabajar con índices simples.
	src := image.NewNRGBA(image.Rect(0, 0, w, h))
	draw.Draw(src, src.Bounds(), img, b.Min, draw.Src)

	dw, dh := w, h
	if orientation >= 5 { // las orientaciones 5 a 8 intercambian ancho y alto
		dw, dh = h, w
	}
	dst := image.NewNRGBA(image.Rect(0, 0, dw, dh))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			var dx, dy int
			switch orientation {
			case 2:
				dx, dy = w-1-x, y
			case 3:
				dx, dy = w-1-x, h-1-y
			case 4:
				dx, dy = x, h-1-y
			case 5:
				dx, dy = y, x
			case 6:
				dx, dy = h-1-y, x
			case 7:
				dx, dy = h-1-y, w-1-x
			case 8:
				dx, dy = y, w-1-x
			}
			dst.SetNRGBA(dx, dy, src.NRGBAAt(x, y))
		}
	}
	return dst
}
