package middleware

import (
	"bytes"
	"encoding/json"
	"html"
	"io"
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
)

// RFC 5322 regex estándar para validación de formato de correo electrónico
var emailRegexRFC5322 = regexp.MustCompile(`^[a-zA-Z0-9.!#$%&'*+/=?^_` + "`" + `{|platform}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$`)

// Expresión regular para detectar scripts peligrosos o eventos inline (XSS)
var scriptTagRegex = regexp.MustCompile(`(?i)<\s*script[^>]*>[\s\S]*?<\s*/\s*script\s*>`)
var javascriptProtocolRegex = regexp.MustCompile(`(?i)javascript:`)
var inlineEventHandlerRegex = regexp.MustCompile(`(?i)on\w+\s*=`)

// AllowedLines define las líneas autorizadas en el sistema
var allowedLines = map[string]bool{
	"7A": true,
	"7B": true,
	"1C": true,
}

// ValidationError representa un error individual de campo.
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// ValidationErrorResponse estructura el mensaje HTTP 400 Bad Request.
type ValidationErrorResponse struct {
	Status  string            `json:"status"`
	Message string            `json:"message"`
	Errors  []ValidationError `json:"errors"`
}

// SanitizeXSS neutraliza secuencias de script maliciosas y escapa caracteres HTML.
// Cumple con normativas OWASP de mitigación de Cross-Site Scripting (XSS).
func SanitizeXSS(input string) string {
	if input == "" {
		return ""
	}
	// 1. Neutralizar etiquetas <script> completas
	cleaned := scriptTagRegex.ReplaceAllString(input, "")
	// 2. Neutralizar protocolos javascript:
	cleaned = javascriptProtocolRegex.ReplaceAllString(cleaned, "")
	// 3. Neutralizar manejadores de eventos inline como onerror=, onload=
	cleaned = inlineEventHandlerRegex.ReplaceAllString(cleaned, "")
	// 4. Escapar caracteres HTML reservados (<, >, &, ", ')
	return html.EscapeString(strings.TrimSpace(cleaned))
}

// NormalizeEmail aplica trim y minúsculas al correo electrónico según estándares de normalización.
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// IsValidRFC5322Email valida si un correo cumple estrictamente con el formato RFC 5322.
func IsValidRFC5322Email(email string) bool {
	if len(email) < 3 || len(email) > 254 {
		return false
	}
	return emailRegexRFC5322.MatchString(email)
}

// ValidateComplaintPayload middleware que valida y sanitiza payloads de reclamos.
func ValidateComplaintPayload() gin.HandlerFunc {
	return func(c *gin.Context) {
		bodyBytes, err := io.ReadAll(c.Request.Body)
		if err != nil || len(bodyBytes) == 0 {
			c.AbortWithStatusJSON(http.StatusBadRequest, ValidationErrorResponse{
				Status:  "fail",
				Message: "El cuerpo de la solicitud no puede estar vacío",
				Errors: []ValidationError{
					{Field: "body", Message: "Payload JSON requerido"},
				},
			})
			return
		}

		var raw map[string]interface{}
		if err := json.Unmarshal(bodyBytes, &raw); err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, ValidationErrorResponse{
				Status:  "fail",
				Message: "Formato JSON inválido",
				Errors: []ValidationError{
					{Field: "json", Message: "El payload contiene una sintaxis JSON no válida"},
				},
			})
			return
		}

		var validationErrors []ValidationError

		// 1. Validar rating [1, 5]
		ratingRaw, hasRating := raw["rating"]
		if !hasRating || ratingRaw == nil {
			validationErrors = append(validationErrors, ValidationError{
				Field:   "rating",
				Message: "La calificación (rating) es obligatoria y debe ser un entero entre 1 y 5",
			})
		} else {
			ratingFloat, ok := ratingRaw.(float64)
			if !ok || ratingFloat != float64(int(ratingFloat)) || int(ratingFloat) < 1 || int(ratingFloat) > 5 {
				validationErrors = append(validationErrors, ValidationError{
					Field:   "rating",
					Message: "El campo rating debe ser un número entero en el rango [1, 5]",
				})
			}
		}

		// 2. Validar lineName ('7A', '7B', '1C')
		lineNameRaw, hasLineName := raw["lineName"]
		var lineNameStr string
		if !hasLineName || lineNameRaw == nil {
			validationErrors = append(validationErrors, ValidationError{
				Field:   "lineName",
				Message: "El campo lineName es obligatorio y debe ser '7A', '7B' o '1C'",
			})
		} else {
			lineNameStr, _ = lineNameRaw.(string)
			lineNameStr = strings.ToUpper(strings.TrimSpace(lineNameStr))
			if !allowedLines[lineNameStr] {
				validationErrors = append(validationErrors, ValidationError{
					Field:   "lineName",
					Message: "La línea especificada no es válida. Valores permitidos: '7A', '7B', '1C'",
				})
			}
			raw["lineName"] = lineNameStr
		}

		// 3. Validar motivo / descripción (no vacío)
		motivoRaw, hasMotivo := raw["motivo"]
		descRaw, hasDesc := raw["description"]

		var finalMotivo string
		if hasMotivo && motivoRaw != nil {
			if s, ok := motivoRaw.(string); ok {
				finalMotivo = strings.TrimSpace(s)
			}
		}
		if finalMotivo == "" && hasDesc && descRaw != nil {
			if s, ok := descRaw.(string); ok {
				finalMotivo = strings.TrimSpace(s)
			}
		}

		if finalMotivo == "" {
			validationErrors = append(validationErrors, ValidationError{
				Field:   "motivo",
				Message: "El campo motivo o descripción no puede estar vacío",
			})
		} else {
			// Sanitización XSS estricta en motivo y descripción
			sanitizedMotivo := SanitizeXSS(finalMotivo)
			raw["motivo"] = sanitizedMotivo
			raw["description"] = sanitizedMotivo
		}

		// Sanitizar título si viene
		if titleRaw, ok := raw["title"]; ok && titleRaw != nil {
			if s, ok := titleRaw.(string); ok {
				raw["title"] = SanitizeXSS(s)
			}
		}

		if len(validationErrors) > 0 {
			c.AbortWithStatusJSON(http.StatusBadRequest, ValidationErrorResponse{
				Status:  "fail",
				Message: "Datos de entrada inválidos o no cumplen con los requisitos de validación",
				Errors:  validationErrors,
			})
			return
		}

		// Reinyectar el cuerpo sanitizado para los siguientes handlers
		sanitizedBytes, _ := json.Marshal(raw)
		c.Request.Body = io.NopCloser(bytes.NewReader(sanitizedBytes))
		c.Next()
	}
}

// ValidateUserPayload middleware que valida y sanitiza payloads de registro de usuarios.
func ValidateUserPayload() gin.HandlerFunc {
	return func(c *gin.Context) {
		bodyBytes, err := io.ReadAll(c.Request.Body)
		if err != nil || len(bodyBytes) == 0 {
			c.AbortWithStatusJSON(http.StatusBadRequest, ValidationErrorResponse{
				Status:  "fail",
				Message: "El cuerpo de la solicitud no puede estar vacío",
				Errors: []ValidationError{
					{Field: "body", Message: "Payload JSON requerido"},
				},
			})
			return
		}

		var raw map[string]interface{}
		if err := json.Unmarshal(bodyBytes, &raw); err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, ValidationErrorResponse{
				Status:  "fail",
				Message: "Formato JSON inválido",
				Errors: []ValidationError{
					{Field: "json", Message: "El payload contiene una sintaxis JSON no válida"},
				},
			})
			return
		}

		var validationErrors []ValidationError

		// 1. Validar y normalizar email RFC 5322
		emailRaw, hasEmail := raw["email"]
		if !hasEmail || emailRaw == nil {
			validationErrors = append(validationErrors, ValidationError{
				Field:   "email",
				Message: "El correo electrónico es requerido",
			})
		} else {
			emailStr, ok := emailRaw.(string)
			normalizedEmail := NormalizeEmail(emailStr)
			if !ok || !IsValidRFC5322Email(normalizedEmail) {
				validationErrors = append(validationErrors, ValidationError{
					Field:   "email",
					Message: "El formato de correo electrónico no cumple con la norma RFC 5322",
				})
			} else {
				raw["email"] = normalizedEmail
			}
		}

		// 2. Validar longitud mínima de contraseña (8 caracteres)
		passRaw, hasPass := raw["password"]
		if !hasPass || passRaw == nil {
			validationErrors = append(validationErrors, ValidationError{
				Field:   "password",
				Message: "La contraseña es requerida",
			})
		} else {
			passStr, ok := passRaw.(string)
			if !ok || len(passStr) < 8 {
				validationErrors = append(validationErrors, ValidationError{
					Field:   "password",
					Message: "La contraseña debe tener una longitud mínima de 8 caracteres",
				})
			}
		}

		// 3. Sanitizar nombre (XSS)
		if nameRaw, ok := raw["name"]; ok && nameRaw != nil {
			if s, ok := nameRaw.(string); ok {
				trimmed := strings.TrimSpace(s)
				if trimmed == "" {
					validationErrors = append(validationErrors, ValidationError{
						Field:   "name",
						Message: "El nombre no puede estar vacío",
					})
				} else {
					raw["name"] = SanitizeXSS(trimmed)
				}
			}
		}

		if len(validationErrors) > 0 {
			c.AbortWithStatusJSON(http.StatusBadRequest, ValidationErrorResponse{
				Status:  "fail",
				Message: "Datos de usuario inválidos o no cumplen con las políticas de seguridad",
				Errors:  validationErrors,
			})
			return
		}

		// Reinyectar cuerpo sanitizado y normalizado
		sanitizedBytes, _ := json.Marshal(raw)
		c.Request.Body = io.NopCloser(bytes.NewReader(sanitizedBytes))
		c.Next()
	}
}

// ValidateUserUpdatePayload middleware para validar actualización de usuarios (campos opcionales).
func ValidateUserUpdatePayload() gin.HandlerFunc {
	return func(c *gin.Context) {
		bodyBytes, err := io.ReadAll(c.Request.Body)
		if err != nil || len(bodyBytes) == 0 {
			c.Next()
			return
		}

		var raw map[string]interface{}
		if err := json.Unmarshal(bodyBytes, &raw); err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, ValidationErrorResponse{
				Status:  "fail",
				Message: "Formato JSON inválido",
				Errors: []ValidationError{
					{Field: "json", Message: "El payload contiene una sintaxis JSON no válida"},
				},
			})
			return
		}

		var validationErrors []ValidationError

		// Validar email si fue provisto
		if emailRaw, ok := raw["email"]; ok && emailRaw != nil {
			if s, ok := emailRaw.(string); ok {
				normalized := NormalizeEmail(s)
				if !IsValidRFC5322Email(normalized) {
					validationErrors = append(validationErrors, ValidationError{
						Field:   "email",
						Message: "El formato de correo electrónico no cumple con la norma RFC 5322",
					})
				} else {
					raw["email"] = normalized
				}
			}
		}

		// Validar password si fue provisto
		if passRaw, ok := raw["password"]; ok && passRaw != nil {
			if s, ok := passRaw.(string); ok {
				if len(s) < 8 {
					validationErrors = append(validationErrors, ValidationError{
						Field:   "password",
						Message: "La contraseña debe tener una longitud mínima de 8 caracteres",
					})
				}
			}
		}

		// Sanitizar nombre si fue provisto
		if nameRaw, ok := raw["name"]; ok && nameRaw != nil {
			if s, ok := nameRaw.(string); ok {
				raw["name"] = SanitizeXSS(s)
			}
		}

		if len(validationErrors) > 0 {
			c.AbortWithStatusJSON(http.StatusBadRequest, ValidationErrorResponse{
				Status:  "fail",
				Message: "Datos de actualización inválidos",
				Errors:  validationErrors,
			})
			return
		}

		sanitizedBytes, _ := json.Marshal(raw)
		c.Request.Body = io.NopCloser(bytes.NewReader(sanitizedBytes))
		c.Next()
	}
}
