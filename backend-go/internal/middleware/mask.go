package middleware

import (
	"bytes"
	"encoding/json"
	"regexp"
	"strings"
	"unicode"

	"github.com/gin-gonic/gin"
)

// MaskEmail pseudonimiza un correo electrónico manteniendo la primera letra visible del buzón local.
// Cumple con la Ley N° 19.628 de Protección de la Vida Privada y principios de minimización GDPR.
// Ejemplo: "johndoe@dominio.cl" -> "j***@dominio.cl"
func MaskEmail(email string) string {
	email = strings.TrimSpace(email)
	if email == "" || !strings.Contains(email, "@") {
		return "***@***.com"
	}

	parts := strings.SplitN(email, "@", 2)
	local := parts[0]
	domain := parts[1]

	if len(local) == 0 {
		return "***@" + domain
	}

	firstChar := string([]rune(local)[0])
	return firstChar + "***@" + domain
}

// MaskPhone enmascara los dígitos intermedios de un número telefónico resguardando la privacidad.
// Ejemplo: "+56912345678" -> "+569****5678" o "912345678" -> "9****5678"
func MaskPhone(phone string) string {
	phone = strings.TrimSpace(phone)
	if phone == "" {
		return ""
	}

	// Extraer caracteres no numéricos iniciales (como '+')
	prefix := ""
	cleanDigits := ""
	for i, r := range phone {
		if i == 0 && r == '+' {
			prefix = "+"
			continue
		}
		if unicode.IsDigit(r) {
			cleanDigits += string(r)
		}
	}

	if len(cleanDigits) <= 4 {
		return prefix + strings.Repeat("*", len(cleanDigits))
	}

	// Si tiene formato chileno con código país (+569xxxxxxxx)
	if strings.HasPrefix(prefix+cleanDigits, "+569") && len(cleanDigits) >= 11 {
		// +56 9 XXXX 5678
		start := cleanDigits[:3] // "569"
		end := cleanDigits[len(cleanDigits)-4:]
		return prefix + start + "****" + end
	}

	if len(cleanDigits) >= 8 {
		start := cleanDigits[:1]
		end := cleanDigits[len(cleanDigits)-4:]
		return prefix + start + "****" + end
	}

	// Caso genérico
	start := cleanDigits[:1]
	end := cleanDigits[len(cleanDigits)-2:]
	return prefix + start + "***" + end
}

// uuidRegex para identificar identificadores UUID estándar
var uuidRegex = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// MaskIdentifier reemplaza los caracteres intermedios de un identificador sensible (RUT, UUID, Card ID) por asteriscos.
// Ejemplos:
// UUID: "a296333c-e797-4d3f-8102-747cf72279a6" -> "a296****79a6"
// ID personalizado: "usr-admin-01" -> "usr-****-01"
// RUT: "12.345.678-9" -> "12.***.***-9"
func MaskIdentifier(id string) string {
	id = strings.TrimSpace(id)
	if id == "" {
		return ""
	}

	// Manejo específico de RUT chileno (ej: 12.345.678-9 o 12345678-9)
	if strings.Contains(id, "-") && (len(id) >= 9 && len(id) <= 12) {
		parts := strings.Split(id, "-")
		body := parts[0]
		dv := parts[1]
		if len(body) >= 7 {
			start := body[:2]
			return start + ".***.***-" + dv
		}
	}

	// Identificador UUID
	if uuidRegex.MatchString(id) {
		start := id[:4]
		end := id[len(id)-4:]
		return start + "****" + end
	}

	// Identificador con prefijo guion (ej: usr-pass-01, comp-temuco-01)
	if strings.Contains(id, "-") {
		parts := strings.Split(id, "-")
		if len(parts) >= 3 {
			return parts[0] + "-****-" + parts[len(parts)-1]
		}
	}

	if len(id) > 6 {
		return id[:2] + "****" + id[len(id)-2:]
	}

	return strings.Repeat("*", len(id))
}

// maskingResponseWriter intercepta la respuesta HTTP para transformar el cuerpo si ?mask=true está activo.
type maskingResponseWriter struct {
	gin.ResponseWriter
	body *bytes.Buffer
}

func (w *maskingResponseWriter) Write(b []byte) (int, error) {
	return w.body.Write(b)
}

func (w *maskingResponseWriter) WriteString(s string) (int, error) {
	return w.body.WriteString(s)
}

// SensitiveDataMasker middleware que evalúa la query string `?mask=true`.
// Si está presente, enmascara correos, teléfonos e identificadores sensibles en el payload JSON de salida.
func SensitiveDataMasker() gin.HandlerFunc {
	return func(c *gin.Context) {
		shouldMask := strings.EqualFold(c.Query("mask"), "true")
		if !shouldMask {
			c.Next()
			return
		}

		// Interceptar el escritor de respuestas
		blw := &maskingResponseWriter{
			ResponseWriter: c.Writer,
			body:           &bytes.Buffer{},
		}
		c.Writer = blw

		c.Next()

		// Solo intervenir en respuestas JSON exitosas
		contentType := blw.Header().Get("Content-Type")
		if strings.Contains(contentType, "application/json") || len(blw.body.Bytes()) > 0 {
			var parsed interface{}
			if err := json.Unmarshal(blw.body.Bytes(), &parsed); err == nil {
				maskedData := maskJSONRecursive(parsed)
				maskedBytes, err := json.Marshal(maskedData)
				if err == nil {
					blw.Header().Set("Content-Length", "")
					blw.ResponseWriter.Write(maskedBytes)
					return
				}
			}
		}

		// Si no era JSON o falló la serialización, escribir original
		blw.ResponseWriter.Write(blw.body.Bytes())
	}
}

// maskJSONRecursive recorre recursivamente mapas y slices enmascarando campos sensibles.
func maskJSONRecursive(node interface{}) interface{} {
	switch v := node.(type) {
	case map[string]interface{}:
		result := make(map[string]interface{}, len(v))
		for k, val := range v {
			lowerKey := strings.ToLower(k)
			switch {
			case strings.Contains(lowerKey, "email") || lowerKey == "mail":
				if strVal, ok := val.(string); ok {
					result[k] = MaskEmail(strVal)
					continue
				}
			case strings.Contains(lowerKey, "phone") || strings.Contains(lowerKey, "telefono") || strings.Contains(lowerKey, "celular"):
				if strVal, ok := val.(string); ok {
					result[k] = MaskPhone(strVal)
					continue
				}
			case lowerKey == "rut":
				if strVal, ok := val.(string); ok {
					result[k] = MaskIdentifier(strVal)
					continue
				}
			case lowerKey == "carduid" || lowerKey == "card_uid" || lowerKey == "cardnumber":
				if strVal, ok := val.(string); ok {
					result[k] = MaskIdentifier(strVal)
					continue
				}
			case lowerKey == "pseudoid" || lowerKey == "pseudo_id":
				if strVal, ok := val.(string); ok {
					result[k] = MaskIdentifier(strVal)
					continue
				}
			}
			result[k] = maskJSONRecursive(val)
		}
		return result
	case []interface{}:
		result := make([]interface{}, len(v))
		for i, item := range v {
			result[i] = maskJSONRecursive(item)
		}
		return result
	default:
		return v
	}
}
