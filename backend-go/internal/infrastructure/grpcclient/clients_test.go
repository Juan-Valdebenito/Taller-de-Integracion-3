package grpcclient

import (
	"context"
	"testing"
	"time"
)

// Puerto donde no escucha nadie: simula un microservicio caído.
const unreachableTarget = "127.0.0.1:1"

func TestClientsCanBeCreatedWhileServiceIsDown(t *testing.T) {
	// grpc.NewClient conecta al primer uso: el backend debe poder arrancar
	// aunque clima_service o micro_service todavía no estén disponibles.
	climate, err := NewClimateClient(unreachableTarget, "key", time.Second)
	if err != nil {
		t.Fatalf("NewClimateClient: %v", err)
	}
	defer climate.Close()

	micro, err := NewMicroClient(unreachableTarget, "key", time.Second)
	if err != nil {
		t.Fatalf("NewMicroClient: %v", err)
	}
	defer micro.Close()
}

func TestCallToDownServiceFailsWithinTimeout(t *testing.T) {
	climate, err := NewClimateClient(unreachableTarget, "key", 500*time.Millisecond)
	if err != nil {
		t.Fatalf("NewClimateClient: %v", err)
	}
	defer climate.Close()

	started := time.Now()
	_, err = climate.ListTelemetry(context.Background(), time.Now().Add(-time.Hour), time.Now(), "", 10)
	if err == nil {
		t.Fatal("expected an error calling a service that is down")
	}
	if elapsed := time.Since(started); elapsed > 5*time.Second {
		t.Fatalf("call should fail within the client timeout, took %s", elapsed)
	}
}
