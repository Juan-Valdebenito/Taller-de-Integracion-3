package websocket

import (
	"encoding/json"
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
)

// ── Test: Hub creation ────────────────────────────────────────────────────

func TestNewHub(t *testing.T) {
	svc := service.NewOccupancyService()
	hub := NewHub(svc)

	if hub == nil {
		t.Fatal("NewHub retornó nil")
	}
	if hub.clients == nil {
		t.Error("clients map no inicializado")
	}
	if hub.topics == nil {
		t.Error("topics map no inicializado")
	}
	if hub.occupancySvc == nil {
		t.Error("occupancySvc no inicializado")
	}
}

// ── Test: Subscribe/Unsubscribe ───────────────────────────────────────────

func TestHub_Subscribe(t *testing.T) {
	svc := service.NewOccupancyService()
	hub := NewHub(svc)

	client := &Client{
		hub:    hub,
		send:   make(chan []byte, 256),
		topics: make(map[string]bool),
	}
	hub.clients[client] = true

	// Suscribir a un topic
	hub.Subscribe(client, "route:route-1")

	// Verificar que el topic existe
	if _, ok := hub.topics["route:route-1"]; !ok {
		t.Error("Topic 'route:route-1' no fue creado")
	}

	// Verificar que el cliente está en el topic
	if _, ok := hub.topics["route:route-1"][client]; !ok {
		t.Error("Cliente no está suscrito al topic")
	}

	// Verificar que el cliente tiene el topic registrado
	if !client.topics["route:route-1"] {
		t.Error("Cliente no registró el topic internamente")
	}
}

func TestHub_SubscribeMultipleTopics(t *testing.T) {
	svc := service.NewOccupancyService()
	hub := NewHub(svc)

	client := &Client{
		hub:    hub,
		send:   make(chan []byte, 256),
		topics: make(map[string]bool),
	}
	hub.clients[client] = true

	hub.Subscribe(client, "route:route-1")
	hub.Subscribe(client, "bus:BUS-101")
	hub.Subscribe(client, "route:route-3")

	if len(client.topics) != 3 {
		t.Errorf("Cliente tiene %d topics, want 3", len(client.topics))
	}

	if len(hub.topics) != 3 {
		t.Errorf("Hub tiene %d topics, want 3", len(hub.topics))
	}
}

func TestHub_Unsubscribe(t *testing.T) {
	svc := service.NewOccupancyService()
	hub := NewHub(svc)

	client := &Client{
		hub:    hub,
		send:   make(chan []byte, 256),
		topics: make(map[string]bool),
	}
	hub.clients[client] = true

	hub.Subscribe(client, "route:route-1")
	hub.Subscribe(client, "bus:BUS-101")

	// Desuscribir de un topic
	hub.Unsubscribe(client, "route:route-1")

	// Verificar que el topic fue removido (era el único suscriptor)
	if _, ok := hub.topics["route:route-1"]; ok {
		t.Error("Topic vacío 'route:route-1' no fue limpiado")
	}

	// Verificar que el cliente no tiene el topic
	if client.topics["route:route-1"] {
		t.Error("Cliente aún tiene el topic 'route:route-1'")
	}

	// Verificar que el otro topic sigue
	if !client.topics["bus:BUS-101"] {
		t.Error("Cliente perdió el topic 'bus:BUS-101'")
	}
}

func TestHub_UnsubscribeKeepsTopicForOthers(t *testing.T) {
	svc := service.NewOccupancyService()
	hub := NewHub(svc)

	client1 := &Client{hub: hub, send: make(chan []byte, 256), topics: make(map[string]bool)}
	client2 := &Client{hub: hub, send: make(chan []byte, 256), topics: make(map[string]bool)}
	hub.clients[client1] = true
	hub.clients[client2] = true

	hub.Subscribe(client1, "route:route-1")
	hub.Subscribe(client2, "route:route-1")

	// Verificar que hay 2 suscriptores
	if len(hub.topics["route:route-1"]) != 2 {
		t.Errorf("Suscriptores = %d, want 2", len(hub.topics["route:route-1"]))
	}

	// Desuscribir solo client1
	hub.Unsubscribe(client1, "route:route-1")

	// El topic debería seguir existiendo con 1 suscriptor
	if subs, ok := hub.topics["route:route-1"]; !ok {
		t.Error("Topic fue eliminado prematuramente")
	} else if len(subs) != 1 {
		t.Errorf("Suscriptores restantes = %d, want 1", len(subs))
	}
}

// ── Test: broadcastToTopic ────────────────────────────────────────────────

func TestHub_BroadcastToTopic(t *testing.T) {
	svc := service.NewOccupancyService()
	hub := NewHub(svc)

	client1 := &Client{hub: hub, send: make(chan []byte, 256), topics: make(map[string]bool)}
	client2 := &Client{hub: hub, send: make(chan []byte, 256), topics: make(map[string]bool)}
	client3 := &Client{hub: hub, send: make(chan []byte, 256), topics: make(map[string]bool)}
	hub.clients[client1] = true
	hub.clients[client2] = true
	hub.clients[client3] = true

	hub.Subscribe(client1, "route:route-1")
	hub.Subscribe(client2, "route:route-1")
	hub.Subscribe(client3, "route:route-3") // Diferente topic

	payload := []byte(`{"type":"bus:update","data":{}}`)
	hub.broadcastToTopic("route:route-1", payload)

	// client1 y client2 deberían recibir el mensaje
	select {
	case msg := <-client1.send:
		if string(msg) != string(payload) {
			t.Errorf("client1 recibió %q, want %q", msg, payload)
		}
	default:
		t.Error("client1 no recibió mensaje")
	}

	select {
	case msg := <-client2.send:
		if string(msg) != string(payload) {
			t.Errorf("client2 recibió %q, want %q", msg, payload)
		}
	default:
		t.Error("client2 no recibió mensaje")
	}

	// client3 NO debería recibir
	select {
	case <-client3.send:
		t.Error("client3 recibió mensaje de un topic al que no está suscrito")
	default:
		// OK
	}
}

func TestHub_BroadcastToNonExistentTopic(t *testing.T) {
	svc := service.NewOccupancyService()
	hub := NewHub(svc)

	// No debería hacer panic
	hub.broadcastToTopic("route:inexistente", []byte("test"))
}

// ── Test: handlePublish con enriquecimiento de ocupación ──────────────────

func TestHub_HandlePublish_EnrichesWithOccupancy(t *testing.T) {
	svc := service.NewOccupancyService()
	hub := NewHub(svc)

	// Crear un suscriptor en route:route-1
	client := &Client{hub: hub, send: make(chan []byte, 256), topics: make(map[string]bool)}
	hub.clients[client] = true
	hub.Subscribe(client, "route:route-1")

	// Publicar un mensaje
	msg := &PublishMessage{
		Type:  "publish",
		Token: "ignored-in-hub",
		Data: BusLocationData{
			BusID:             "BUS-101",
			RouteID:           "route-1",
			Latitude:          -38.7359,
			Longitude:         -72.5904,
			Heading:           180,
			Speed:             35,
			CurrentPassengers: 45,
			Capacity:          80,
		},
	}

	hub.handlePublish(msg)

	// El suscriptor debería recibir un broadcast enriquecido
	select {
	case rawMsg := <-client.send:
		var broadcast BusUpdateBroadcast
		if err := json.Unmarshal(rawMsg, &broadcast); err != nil {
			t.Fatalf("Error al decodificar broadcast: %v", err)
		}

		if broadcast.Type != "bus:update" {
			t.Errorf("Type = %q, want %q", broadcast.Type, "bus:update")
		}
		if broadcast.Data.BusID != "BUS-101" {
			t.Errorf("BusID = %q, want %q", broadcast.Data.BusID, "BUS-101")
		}
		if broadcast.Data.Occupancy == nil {
			t.Fatal("Occupancy es nil — debería estar enriquecido")
		}
		if broadcast.Data.Occupancy.CurrentRatio == 0 {
			t.Error("CurrentRatio es 0 — debería ser ~0.563")
		}
		if broadcast.Data.Occupancy.OccupancyLevel == "" {
			t.Error("OccupancyLevel está vacío")
		}
		if broadcast.Data.Occupancy.PredictorName != "heuristic-v1" {
			t.Errorf("PredictorName = %q, want %q", broadcast.Data.Occupancy.PredictorName, "heuristic-v1")
		}
		if broadcast.Data.Timestamp == "" {
			t.Error("Timestamp está vacío")
		}
	default:
		t.Error("Suscriptor no recibió broadcast")
	}
}

func TestHub_HandlePublish_DualFanOut(t *testing.T) {
	svc := service.NewOccupancyService()
	hub := NewHub(svc)

	// Un suscriptor de ruta y otro de bus
	routeClient := &Client{hub: hub, send: make(chan []byte, 256), topics: make(map[string]bool)}
	busClient := &Client{hub: hub, send: make(chan []byte, 256), topics: make(map[string]bool)}
	hub.clients[routeClient] = true
	hub.clients[busClient] = true

	hub.Subscribe(routeClient, "route:route-1")
	hub.Subscribe(busClient, "bus:BUS-101")

	msg := &PublishMessage{
		Data: BusLocationData{
			BusID:             "BUS-101",
			RouteID:           "route-1",
			CurrentPassengers: 20,
			Capacity:          80,
		},
	}

	hub.handlePublish(msg)

	// Ambos deberían recibir el broadcast
	select {
	case <-routeClient.send:
		// OK — suscriptor de ruta recibió
	default:
		t.Error("Suscriptor de ruta no recibió broadcast")
	}

	select {
	case <-busClient.send:
		// OK — suscriptor de bus recibió
	default:
		t.Error("Suscriptor de bus no recibió broadcast")
	}
}

// ── Test: removeFromTopic ─────────────────────────────────────────────────

func TestHub_RemoveFromTopic_CleansEmptyTopic(t *testing.T) {
	svc := service.NewOccupancyService()
	hub := NewHub(svc)

	client := &Client{hub: hub, send: make(chan []byte, 256), topics: make(map[string]bool)}
	hub.clients[client] = true
	hub.Subscribe(client, "route:route-1")

	hub.removeFromTopic(client, "route:route-1")

	if _, ok := hub.topics["route:route-1"]; ok {
		t.Error("Topic vacío no fue limpiado")
	}
}
