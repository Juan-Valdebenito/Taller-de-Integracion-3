package handler

// Traducción de IDs de línea. backend-go y micro_service nombran distinto la misma
// línea: "route-7A" o "route-7a" en backend-go, y "L7A" en micro_service. El
// código de línea ("7A") es el dato común (ver MODELO_GRAFO.md).

import (
	"strings"
	"unicode"
)

const (
	backendRoutePrefix = "route-"
	microLinePrefix    = "L"
)

// MicroLineID expone la traducción para conectar otros servicios en main.go.
func MicroLineID(backendRouteID string) (string, bool) {
	return microLineID(backendRouteID)
}

// microLineID traduce un ID de backend-go al de micro_service. Responde false si
// el ID no sigue el formato "route-<código>", para no enviar líneas inventadas.
func microLineID(backendRouteID string) (string, bool) {
	lineCode, hasPrefix := strings.CutPrefix(backendRouteID, backendRoutePrefix)
	if !hasPrefix || lineCode == "" {
		return "", false
	}
	for _, character := range lineCode {
		if !unicode.IsLetter(character) && !unicode.IsDigit(character) {
			return "", false
		}
	}
	return microLinePrefix + strings.ToUpper(lineCode), true
}
