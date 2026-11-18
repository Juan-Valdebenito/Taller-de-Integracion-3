package main

// Pruebas de la traducción de las preferencias de gRPC. Deben seguir las mismas
// reglas que REST: mismos valores aceptados, mismos valores por defecto y
// mismos errores.

import (
	"errors"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/protobuf/proto"
)

// Sin mensaje no hay preferencias: la petición usará las de por defecto.
func TestRoutePreferencesFromProtoWithoutMessage(t *testing.T) {
	preferences, err := routePreferencesFromProto(nil)
	if err != nil || preferences != nil {
		t.Errorf("se esperaba nil sin error y se obtuvo %+v, %v", preferences, err)
	}
}

// Un mensaje vacío equivale a las preferencias por defecto. En particular,
// avoid_crowding no enviado debe ser true.
func TestRoutePreferencesFromProtoEmptyMessageUsesDefaults(t *testing.T) {
	preferences, err := routePreferencesFromProto(&microv1.RoutePreferences{})
	if err != nil || preferences == nil {
		t.Fatalf("se esperaban preferencias y se obtuvo %+v, %v", preferences, err)
	}
	if *preferences != defaultRoutePreferences() {
		t.Errorf("se esperaba %+v y se obtuvo %+v", defaultRoutePreferences(), *preferences)
	}
}

func TestRoutePreferencesFromProtoReadsEveryField(t *testing.T) {
	preferences, err := routePreferencesFromProto(&microv1.RoutePreferences{
		Priority: "fewest_transfers", MaxWalkMeters: 400, AvoidCrowding: proto.Bool(false),
	})
	if err != nil {
		t.Fatal(err)
	}
	expected := RoutePreferences{Priority: priorityFewestTransfers, MaxWalkMeters: 400, AvoidCrowding: false}
	if *preferences != expected {
		t.Errorf("se esperaba %+v y se obtuvo %+v", expected, *preferences)
	}
}

// avoid_crowding enviado como true se respeta, igual que el valor por defecto.
func TestRoutePreferencesFromProtoReadsAvoidCrowdingTrue(t *testing.T) {
	preferences, err := routePreferencesFromProto(&microv1.RoutePreferences{AvoidCrowding: proto.Bool(true)})
	if err != nil || !preferences.AvoidCrowding {
		t.Errorf("se esperaba avoid_crowding=true y se obtuvo %+v, %v", preferences, err)
	}
}

// La prioridad se normaliza como en REST. Si quedara "  FASTEST ", los pesos la
// tratarían como desconocida y usarían balanced sin avisar.
func TestRoutePreferencesFromProtoNormalizesPriority(t *testing.T) {
	preferences, err := routePreferencesFromProto(&microv1.RoutePreferences{Priority: "  FASTEST "})
	if err != nil || preferences.Priority != priorityFastest {
		t.Errorf("se esperaba fastest y se obtuvo %+v, %v", preferences, err)
	}
}

// Los errores son los mismos que devuelve REST.
func TestRoutePreferencesFromProtoRejectsInvalidValues(t *testing.T) {
	invalidMessages := []struct {
		name        string
		message     *microv1.RoutePreferences
		expectedErr error
	}{
		{"prioridad desconocida", &microv1.RoutePreferences{Priority: "slowest"}, errInvalidRoutePriority},
		{"caminata muy corta", &microv1.RoutePreferences{MaxWalkMeters: 50}, errInvalidMaxWalk},
		{"caminata muy larga", &microv1.RoutePreferences{MaxWalkMeters: 5000}, errInvalidMaxWalk},
		{"caminata negativa", &microv1.RoutePreferences{MaxWalkMeters: -1}, errInvalidMaxWalk},
	}
	for _, invalid := range invalidMessages {
		if preferences, err := routePreferencesFromProto(invalid.message); !errors.Is(err, invalid.expectedErr) || preferences != nil {
			t.Errorf("%s: se esperaba %v y se obtuvo %+v, %v", invalid.name, invalid.expectedErr, preferences, err)
		}
	}
}

// Las preferencias traducidas siempre pasan la validación de planUniversityRoutes.
func TestRoutePreferencesFromProtoAreValid(t *testing.T) {
	for _, priority := range routePriorities() {
		for _, maxWalkMeters := range []int32{0, minPreferredWalkMeters, maxPreferredWalkMeters} {
			preferences, err := routePreferencesFromProto(&microv1.RoutePreferences{Priority: string(priority), MaxWalkMeters: maxWalkMeters})
			if err != nil {
				t.Fatalf("%s, %d m: %v", priority, maxWalkMeters, err)
			}
			if err := preferences.validate(); err != nil {
				t.Errorf("%s, %d m: las preferencias no son válidas: %v", priority, maxWalkMeters, err)
			}
		}
	}
}
