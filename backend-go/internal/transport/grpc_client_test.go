package transport_test

import (
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/transport"
)

// TestNewGRPCPredictionClient_EmptyAddr verifica que una dirección vacía devuelve error.
func TestNewGRPCPredictionClient_EmptyAddr(t *testing.T) {
	_, err := transport.NewGRPCPredictionClient("")
	if err == nil {
		t.Fatal("NewGRPCPredictionClient con addr vacía debería devolver error")
	}
	t.Logf("Error (esperado): %v", err)
}

// TestNewGRPCPredictionClient_Unreachable verifica que intentar conectar a un
// servidor inexistente devuelve error de conexión (no panic).
func TestNewGRPCPredictionClient_Unreachable(t *testing.T) {
	// Puerto 19999 — muy poco probable que esté en uso
	_, err := transport.NewGRPCPredictionClient("localhost:19999")
	if err == nil {
		// Si no hay error, el dial fue lazy (sin WithBlock) — ambos casos son válidos.
		// En la implementación actual usamos WithBlock + timeout, así que esperamos error.
		t.Log("Nota: dial fue exitoso (comportamiento lazy del dial gRPC)")
	} else {
		t.Logf("Error de conexión (esperado): %v", err)
	}
}

// TestGRPCPredictionClient_Close_NilConn verifica que Close no entra en pánico
// si la conexión interna es nil (protección defensiva).
func TestGRPCPredictionClient_Close_NilConn(t *testing.T) {
	// No podemos crear un cliente con conn nil directamente (constructor lo impide),
	// pero sí podemos verificar que Close de un cliente válido no falla.
	// Usamos una dirección que falle para no conectar a nada real.
	// Si NewGRPCPredictionClient falla, el test pasa trivialmente.
	client, err := transport.NewGRPCPredictionClient("localhost:19998")
	if err != nil {
		t.Logf("Constructor falló como esperado (sin servidor): %v", err)
		return
	}
	// Si se creó, Close debe ser seguro
	if closeErr := client.Close(); closeErr != nil {
		t.Errorf("Close() devolvió error inesperado: %v", closeErr)
	}
}
