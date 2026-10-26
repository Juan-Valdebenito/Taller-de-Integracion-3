package attachment

import (
	"bytes"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// JPEGQuality es la calidad con que se vuelven a codificar los JPEG: buena
// calidad visual con un tamaño razonable.
const JPEGQuality = 85

// decodeImage decodifica todos los píxeles con el decodificador del tipo ya
// detectado. A diferencia de ReadDimensions, recorre el archivo completo, así
// que también detecta archivos dañados después de la cabecera.
func decodeImage(data []byte, mimeType string) (image.Image, error) {
	var (
		img image.Image
		err error
	)
	switch mimeType {
	case domain.MimeTypeJPEG:
		img, err = jpeg.Decode(bytes.NewReader(data))
	case domain.MimeTypePNG:
		img, err = png.Decode(bytes.NewReader(data))
	default:
		return nil, domain.ErrAttachmentUnsupportedType
	}
	if err != nil {
		return nil, ErrAttachmentCorrupt
	}
	return img, nil
}

// encodeImage codifica los píxeles desde cero en el mismo formato. Los
// codificadores de Go solo escriben la imagen: no copian metadatos (EXIF, GPS,
// comentarios, miniaturas) ni bytes extra del archivo original.
func encodeImage(img image.Image, mimeType string) ([]byte, error) {
	var buf bytes.Buffer
	var err error
	switch mimeType {
	case domain.MimeTypeJPEG:
		err = jpeg.Encode(&buf, img, &jpeg.Options{Quality: JPEGQuality})
	case domain.MimeTypePNG:
		// PNG se mantiene como PNG para conservar la transparencia.
		encoder := png.Encoder{CompressionLevel: png.BestCompression}
		err = encoder.Encode(&buf, img)
	default:
		return nil, domain.ErrAttachmentUnsupportedType
	}
	if err != nil {
		return nil, fmt.Errorf("attachment: no se pudo codificar la imagen: %w", err)
	}
	return buf.Bytes(), nil
}

// reencode decodifica la imagen validada y la vuelve a codificar desde cero en
// el mismo formato, sin ocultar zonas. Ver reencodeWithMasks.
func reencode(v *ValidatedImage) ([]byte, image.Image, error) {
	data, img, _, err := reencodeWithMasks(v, nil)
	return data, img, err
}

// reencodeWithMasks es la base de la sanitización. El orden importa:
//
//  1. decodificar todos los píxeles,
//  2. aplicar la orientación EXIF (solo JPEG), porque el EXIF no se conserva,
//  3. reducir si el lado mayor supera MaxStoredDimension,
//  4. pixelar las zonas marcadas: van después de 2 y 3 porque el pasajero las
//     marca sobre la foto tal como la ve (derecha), y sus coordenadas relativas
//     no cambian con la reducción,
//  5. codificar desde cero: lo que se guarda ya tiene las zonas ocultas; los
//     píxeles originales de esas zonas nunca llegan al archivo.
//
// Devuelve el archivo, la imagen final y cuántas zonas se ocultaron.
func reencodeWithMasks(v *ValidatedImage, regions []MaskRegion) ([]byte, image.Image, int, error) {
	img, err := decodeImage(v.Data, v.MimeType)
	if err != nil {
		return nil, nil, 0, err
	}
	if v.MimeType == domain.MimeTypeJPEG {
		img = applyOrientation(img, jpegOrientation(v.Data))
	}
	img = limitSize(img)
	img, masked, err := applyMasks(img, regions)
	if err != nil {
		return nil, nil, 0, err
	}
	data, err := encodeImage(img, v.MimeType)
	if err != nil {
		return nil, nil, 0, err
	}
	return data, img, masked, nil
}
