package websocket

import (
	"encoding/json"
	"testing"
)

// ── Test: IncomingMessage envelope ─────────────────────────────────────────

func TestIncomingMessage_UnmarshalSubscribe(t *testing.T) {
	raw := `{"type":"subscribe","topic":"route","id":"route-1"}`
	var msg IncomingMessage
	if err := json.Unmarshal([]byte(raw), &msg); err != nil {
		t.Fatalf("Error al decodificar: %v", err)
	}
	if msg.Type != "subscribe" {
		t.Errorf("Type = %q, want %q", msg.Type, "subscribe")
	}
}

func TestIncomingMessage_UnmarshalPublish(t *testing.T) {
	raw := `{"type":"publish","token":"tok","data":{}}`
	var msg IncomingMessage
	if err := json.Unmarshal([]byte(raw), &msg); err != nil {
		t.Fatalf("Error al decodificar: %v", err)
	}
	if msg.Type != "publish" {
		t.Errorf("Type = %q, want %q", msg.Type, "publish")
	}
}

// ── Test: SubscribeMessage ─────────────────────────────────────────────────

func TestSubscribeMessage_TopicKey_Route(t *testing.T) {
	msg := SubscribeMessage{Topic: "route", ID: "route-1"}
	want := "route:route-1"
	if got := msg.TopicKey(); got != want {
		t.Errorf("TopicKey() = %q, want %q", got, want)
	}
}

func TestSubscribeMessage_TopicKey_Bus(t *testing.T) {
	msg := SubscribeMessage{Topic: "bus", ID: "BUS-101"}
	want := "bus:BUS-101"
	if got := msg.TopicKey(); got != want {
		t.Errorf("TopicKey() = %q, want %q", got, want)
	}
}

// ── Test: PublishMessage ───────────────────────────────────────────────────

func TestPublishMessage_Unmarshal(t *testing.T) {
	raw := `{
		"type": "publish",
		"token": "jwt-token-here",
		"data": {
			"busId": "BUS-101",
			"routeId": "route-1",
			"latitude": -38.7359,
			"longitude": -72.5904,
			"heading": 180,
			"speed": 35,
			"currentPassengers": 45,
			"capacity": 80
		}
	}`

	var msg PublishMessage
	if err := json.Unmarshal([]byte(raw), &msg); err != nil {
		t.Fatalf("Error al decodificar: %v", err)
	}

	if msg.Type != "publish" {
		t.Errorf("Type = %q, want %q", msg.Type, "publish")
	}
	if msg.Token != "jwt-token-here" {
		t.Errorf("Token = %q, want %q", msg.Token, "jwt-token-here")
	}
	if msg.Data.BusID != "BUS-101" {
		t.Errorf("Data.BusID = %q, want %q", msg.Data.BusID, "BUS-101")
	}
	if msg.Data.RouteID != "route-1" {
		t.Errorf("Data.RouteID = %q, want %q", msg.Data.RouteID, "route-1")
	}
	if msg.Data.Latitude != -38.7359 {
		t.Errorf("Data.Latitude = %f, want %f", msg.Data.Latitude, -38.7359)
	}
	if msg.Data.CurrentPassengers != 45 {
		t.Errorf("Data.CurrentPassengers = %d, want %d", msg.Data.CurrentPassengers, 45)
	}
	if msg.Data.Capacity != 80 {
		t.Errorf("Data.Capacity = %d, want %d", msg.Data.Capacity, 80)
	}
}

// ── Test: BusUpdateBroadcast marshal ──────────────────────────────────────

func TestBusUpdateBroadcast_Marshal(t *testing.T) {
	broadcast := BusUpdateBroadcast{
		Type: "bus:update",
		Data: BusUpdatePayload{
			BusID:             "BUS-101",
			RouteID:           "route-1",
			Latitude:          -38.7359,
			Longitude:         -72.5904,
			Heading:           180,
			Speed:             35,
			CurrentPassengers: 45,
			Capacity:          80,
			Occupancy: &OccupancyInfo{
				CurrentRatio:   0.563,
				PredictedRatio: 0.731,
				OccupancyLevel: "HIGH",
				OccupancyText:  "🔴 Muy ocupado",
				OccupancyColor: "#ef4444",
				Confidence:     0.75,
				IsSimulated:    true,
				PredictorName:  "heuristic-v1",
			},
			Timestamp: "2026-09-11T18:38:00Z",
		},
	}

	data, err := json.Marshal(broadcast)
	if err != nil {
		t.Fatalf("Error al serializar: %v", err)
	}

	// Verificar que se deserializa correctamente
	var decoded BusUpdateBroadcast
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Error al decodificar: %v", err)
	}

	if decoded.Type != "bus:update" {
		t.Errorf("Type = %q, want %q", decoded.Type, "bus:update")
	}
	if decoded.Data.BusID != "BUS-101" {
		t.Errorf("Data.BusID = %q, want %q", decoded.Data.BusID, "BUS-101")
	}
	if decoded.Data.Occupancy == nil {
		t.Fatal("Data.Occupancy is nil")
	}
	if decoded.Data.Occupancy.OccupancyLevel != "HIGH" {
		t.Errorf("Occupancy.OccupancyLevel = %q, want %q", decoded.Data.Occupancy.OccupancyLevel, "HIGH")
	}
}

func TestBusUpdateBroadcast_MarshalWithoutOccupancy(t *testing.T) {
	broadcast := BusUpdateBroadcast{
		Type: "bus:update",
		Data: BusUpdatePayload{
			BusID:   "BUS-101",
			RouteID: "route-1",
		},
	}

	data, err := json.Marshal(broadcast)
	if err != nil {
		t.Fatalf("Error al serializar: %v", err)
	}

	// Verificar que occupancy se omite cuando es nil
	var decoded map[string]interface{}
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Error al decodificar: %v", err)
	}

	dataMap := decoded["data"].(map[string]interface{})
	if _, exists := dataMap["occupancy"]; exists {
		t.Error("occupancy debería omitirse cuando es nil (omitempty)")
	}
}

// ── Test: ErrorMessage marshal ────────────────────────────────────────────

func TestErrorMessage_Marshal(t *testing.T) {
	errMsg := ErrorMessage{
		Type:    "error",
		Message: "Token inválido",
		Code:    "AUTH_REQUIRED",
	}

	data, err := json.Marshal(errMsg)
	if err != nil {
		t.Fatalf("Error al serializar: %v", err)
	}

	var decoded ErrorMessage
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Error al decodificar: %v", err)
	}

	if decoded.Type != "error" {
		t.Errorf("Type = %q, want %q", decoded.Type, "error")
	}
	if decoded.Code != "AUTH_REQUIRED" {
		t.Errorf("Code = %q, want %q", decoded.Code, "AUTH_REQUIRED")
	}
}
