// Package transport — Factory de clientes de predicción.
//
// NewPredictionClient es el único punto de entrada para obtener un PredictionClient.
// Lee la configuración del entorno y devuelve la implementación apropiada
// (gRPC o HTTP) sin que el llamador necesite conocer los detalles del transporte.
package transport

import (
	"fmt"
	"strings"
	"time"
)

// TransportType define el protocolo de comunicación con el microservicio ML.
type TransportType string

const (
	// TransportGRPC usa gRPC + protobuf para comunicación binaria eficiente.
	TransportGRPC TransportType = "grpc"

	// TransportHTTP usa REST/JSON sobre HTTP/1.1 como fallback universal.
	TransportHTTP TransportType = "http"
)

// Config agrupa la configuración necesaria para crear un PredictionClient.
// Los valores se cargan desde variables de entorno en config.Load().
type Config struct {
	// Transport indica el protocolo a usar: "grpc" o "http".
	// Por defecto se usa "http" si el valor es vacío o desconocido.
	Transport TransportType

	// GRPCAddr es la dirección del servidor gRPC (ej: "localhost:50051").
	// Sólo se usa cuando Transport == TransportGRPC.
	GRPCAddr string

	// HTTPURL es la URL base del servidor HTTP (ej: "http://localhost:8000").
	// Sólo se usa cuando Transport == TransportHTTP.
	HTTPURL string

	// TimeoutSec es el timeout de cada llamada RPC, en segundos.
	// Valor 0 o negativo usa el default de 5 segundos.
	TimeoutSec int
}

// NewPredictionClient es la factory que instancia el PredictionClient correcto
// según la configuración proporcionada.
//
// Ejemplo de uso en main.go:
//
//	client, err := transport.NewPredictionClient(transport.Config{
//	    Transport:  transport.TransportHTTP,
//	    HTTPURL:    os.Getenv("PREDICTION_HTTP_URL"),
//	    TimeoutSec: 5,
//	})
//	if err != nil { log.Fatal(err) }
//	defer client.Close()
func NewPredictionClient(cfg Config) (PredictionClient, error) {
	timeout := time.Duration(cfg.TimeoutSec) * time.Second
	if timeout <= 0 {
		timeout = 5 * time.Second
	}

	switch TransportType(strings.ToLower(string(cfg.Transport))) {
	case TransportGRPC:
		return newGRPCClient(cfg.GRPCAddr)

	case TransportHTTP, "": // vacío → HTTP como default seguro
		return NewHTTPPredictionClient(cfg.HTTPURL, timeout)

	default:
		return nil, fmt.Errorf(
			"transport: protocolo desconocido %q — use %q o %q",
			cfg.Transport, TransportGRPC, TransportHTTP,
		)
	}
}

// newGRPCClient encapsula la creación del cliente gRPC con validación previa.
// Separado para facilitar el testeo unitario de la factory.
func newGRPCClient(addr string) (PredictionClient, error) {
	if addr == "" {
		return nil, fmt.Errorf(
			"transport: PREDICTION_GRPC_ADDR es requerida cuando PREDICTION_TRANSPORT=grpc",
		)
	}
	return NewGRPCPredictionClient(addr)
}
