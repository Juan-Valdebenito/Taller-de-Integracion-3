package transport_test

import (
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/transport"
)

// TestNewPredictionClient_HTTP verifica que la factory devuelve un cliente HTTP
// cuando Transport == "http".
func TestNewPredictionClient_HTTP(t *testing.T) {
	cfg := transport.Config{
		Transport: transport.TransportHTTP,
		HTTPURL:   "http://localhost:8000",
	}

	client, err := transport.NewPredictionClient(cfg)
	if err != nil {
		t.Fatalf("NewPredictionClient(http): %v", err)
	}
	defer client.Close()

	if client == nil {
		t.Fatal("NewPredictionClient(http) devolvió nil sin error")
	}
}

// TestNewPredictionClient_DefaultIsHTTP verifica que un Transport vacío
// devuelve un cliente HTTP (default seguro).
func TestNewPredictionClient_DefaultIsHTTP(t *testing.T) {
	cfg := transport.Config{
		Transport: "", // vacío → debe usar HTTP
		HTTPURL:   "http://localhost:8001",
	}

	client, err := transport.NewPredictionClient(cfg)
	if err != nil {
		t.Fatalf("NewPredictionClient(vacío): %v", err)
	}
	defer client.Close()

	if client == nil {
		t.Fatal("NewPredictionClient(vacío) devolvió nil sin error")
	}
}

// TestNewPredictionClient_HTTPEmptyURL verifica que HTTP con URL vacía devuelve error.
func TestNewPredictionClient_HTTPEmptyURL(t *testing.T) {
	cfg := transport.Config{
		Transport: transport.TransportHTTP,
		HTTPURL:   "", // sin URL → error
	}

	_, err := transport.NewPredictionClient(cfg)
	if err == nil {
		t.Fatal("NewPredictionClient(http, url vacía) debería devolver error")
	}
	t.Logf("Error (esperado): %v", err)
}

// TestNewPredictionClient_GRPCEmptyAddr verifica que gRPC con addr vacía devuelve error.
func TestNewPredictionClient_GRPCEmptyAddr(t *testing.T) {
	cfg := transport.Config{
		Transport: transport.TransportGRPC,
		GRPCAddr:  "", // sin addr → error
	}

	_, err := transport.NewPredictionClient(cfg)
	if err == nil {
		t.Fatal("NewPredictionClient(grpc, addr vacía) debería devolver error")
	}
	t.Logf("Error (esperado): %v", err)
}

// TestNewPredictionClient_UnknownTransport verifica que un protocolo desconocido
// devuelve un error descriptivo en lugar de silenciar el problema.
func TestNewPredictionClient_UnknownTransport(t *testing.T) {
	cfg := transport.Config{
		Transport: "websocket", // no soportado
	}

	_, err := transport.NewPredictionClient(cfg)
	if err == nil {
		t.Fatal("NewPredictionClient(websocket) debería devolver error")
	}
	t.Logf("Error (esperado): %v", err)
}

// TestNewPredictionClient_DefaultTimeout verifica que un TimeoutSec <= 0
// no produce pánico (usa default de 5s internamente).
func TestNewPredictionClient_DefaultTimeout(t *testing.T) {
	cfg := transport.Config{
		Transport:  transport.TransportHTTP,
		HTTPURL:    "http://localhost:8002",
		TimeoutSec: 0, // debe usar default
	}

	client, err := transport.NewPredictionClient(cfg)
	if err != nil {
		t.Fatalf("NewPredictionClient con TimeoutSec=0: %v", err)
	}
	defer client.Close()
}
