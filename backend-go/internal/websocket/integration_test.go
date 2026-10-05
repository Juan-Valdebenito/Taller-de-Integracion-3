package websocket

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	gorillaWS "github.com/gorilla/websocket"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
)

const testJWTSecret = "test-secret-key-for-websocket-tests"

// ── Helpers ───────────────────────────────────────────────────────────────

// createTestServer crea un servidor httptest con el WebSocket handler.
func createTestServer(t *testing.T) (*httptest.Server, *Hub) {
	t.Helper()

	svc := service.NewOccupancyService()
	hub := NewHub(svc)
	go hub.Run()

	wsHandler := NewWSHandler(hub, testJWTSecret, []string{"http://localhost"})
	server := httptest.NewServer(http.Handler(wsHandler))

	return server, hub
}

// dialWS conecta un cliente WebSocket al servidor de test.
func dialWS(t *testing.T, server *httptest.Server) *gorillaWS.Conn {
	t.Helper()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, _, err := gorillaWS.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Error al conectar WebSocket: %v", err)
	}

	return conn
}

// generateJWT genera un token JWT de prueba con el rol indicado.
func generateJWT(role string) string {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"id":    "test-user-id",
		"email": "test@example.com",
		"role":  role,
		"exp":   time.Now().Add(time.Hour).Unix(),
	})
	tokenStr, _ := token.SignedString([]byte(testJWTSecret))
	return tokenStr
}

// readJSON lee un mensaje JSON del WebSocket con timeout.
func readJSON(t *testing.T, conn *gorillaWS.Conn, v interface{}) {
	t.Helper()
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, msg, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("Error al leer mensaje: %v", err)
	}
	if err := json.Unmarshal(msg, v); err != nil {
		t.Fatalf("Error al decodificar JSON: %v (raw: %s)", err, msg)
	}
}

// sendJSON envía un mensaje JSON al WebSocket.
func sendJSON(t *testing.T, conn *gorillaWS.Conn, v interface{}) {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("Error al serializar: %v", err)
	}
	if err := conn.WriteMessage(gorillaWS.TextMessage, data); err != nil {
		t.Fatalf("Error al enviar mensaje: %v", err)
	}
}

// ── Test: Conexión básica ─────────────────────────────────────────────────

func TestIntegration_Connect(t *testing.T) {
	server, _ := createTestServer(t)
	defer server.Close()

	conn := dialWS(t, server)
	defer conn.Close()

	// Si llegamos aquí, la conexión fue exitosa
	t.Log("✅ Conexión WebSocket exitosa")
}

// ── Test: Subscribe + Publish + Receive ───────────────────────────────────

func TestIntegration_SubscribeAndReceiveBroadcast(t *testing.T) {
	server, _ := createTestServer(t)
	defer server.Close()

	// Cliente suscriptor
	subscriber := dialWS(t, server)
	defer subscriber.Close()

	// Cliente publicador
	publisher := dialWS(t, server)
	defer publisher.Close()

	// Dar tiempo al Hub para registrar los clientes
	time.Sleep(50 * time.Millisecond)

	// Suscribir a route-1
	sendJSON(t, subscriber, SubscribeMessage{
		Type:  "subscribe",
		Topic: "route",
		ID:    "route-1",
	})

	// Dar tiempo al Hub para procesar la suscripción
	time.Sleep(50 * time.Millisecond)

	// Publicar ubicación (con JWT de COMPANY)
	token := generateJWT("COMPANY")
	sendJSON(t, publisher, PublishMessage{
		Type:  "publish",
		Token: token,
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
	})

	// Suscriptor debería recibir el broadcast
	var broadcast BusUpdateBroadcast
	readJSON(t, subscriber, &broadcast)

	if broadcast.Type != "bus:update" {
		t.Errorf("Type = %q, want %q", broadcast.Type, "bus:update")
	}
	if broadcast.Data.BusID != "BUS-101" {
		t.Errorf("BusID = %q, want %q", broadcast.Data.BusID, "BUS-101")
	}
	if broadcast.Data.RouteID != "route-1" {
		t.Errorf("RouteID = %q, want %q", broadcast.Data.RouteID, "route-1")
	}
	if broadcast.Data.Latitude != -38.7359 {
		t.Errorf("Latitude = %f, want %f", broadcast.Data.Latitude, -38.7359)
	}
	if broadcast.Data.CurrentPassengers != 45 {
		t.Errorf("CurrentPassengers = %d, want %d", broadcast.Data.CurrentPassengers, 45)
	}
	if broadcast.Data.Occupancy == nil {
		t.Fatal("Occupancy es nil — debería estar enriquecido")
	}
	if broadcast.Data.Occupancy.PredictorName != "heuristic-v1" {
		t.Errorf("PredictorName = %q, want %q", broadcast.Data.Occupancy.PredictorName, "heuristic-v1")
	}
	if broadcast.Data.Timestamp == "" {
		t.Error("Timestamp está vacío")
	}

	t.Log("✅ Subscribe + Publish + Broadcast funciona correctamente")
}

// ── Test: Subscribe por Bus ID ────────────────────────────────────────────

func TestIntegration_SubscribeByBusID(t *testing.T) {
	server, _ := createTestServer(t)
	defer server.Close()

	subscriber := dialWS(t, server)
	defer subscriber.Close()
	publisher := dialWS(t, server)
	defer publisher.Close()

	time.Sleep(50 * time.Millisecond)

	// Suscribir a bus específico
	sendJSON(t, subscriber, SubscribeMessage{
		Type:  "subscribe",
		Topic: "bus",
		ID:    "BUS-101",
	})

	time.Sleep(50 * time.Millisecond)

	token := generateJWT("ADMIN")
	sendJSON(t, publisher, PublishMessage{
		Type:  "publish",
		Token: token,
		Data: BusLocationData{
			BusID:             "BUS-101",
			RouteID:           "route-1",
			CurrentPassengers: 30,
			Capacity:          80,
		},
	})

	var broadcast BusUpdateBroadcast
	readJSON(t, subscriber, &broadcast)

	if broadcast.Data.BusID != "BUS-101" {
		t.Errorf("BusID = %q, want %q", broadcast.Data.BusID, "BUS-101")
	}

	t.Log("✅ Subscribe por Bus ID funciona correctamente")
}

// ── Test: No recibe mensajes de otro topic ─────────────────────────────────

func TestIntegration_NoMessageFromDifferentTopic(t *testing.T) {
	server, _ := createTestServer(t)
	defer server.Close()

	subscriber := dialWS(t, server)
	defer subscriber.Close()
	publisher := dialWS(t, server)
	defer publisher.Close()

	time.Sleep(50 * time.Millisecond)

	// Suscribir a route-3
	sendJSON(t, subscriber, SubscribeMessage{
		Type:  "subscribe",
		Topic: "route",
		ID:    "route-3",
	})

	time.Sleep(50 * time.Millisecond)

	// Publicar en route-1 (diferente)
	token := generateJWT("COMPANY")
	sendJSON(t, publisher, PublishMessage{
		Type:  "publish",
		Token: token,
		Data: BusLocationData{
			BusID:             "BUS-101",
			RouteID:           "route-1",
			CurrentPassengers: 20,
			Capacity:          80,
		},
	})

	// No debería recibir nada (timeout esperado)
	subscriber.SetReadDeadline(time.Now().Add(300 * time.Millisecond))
	_, _, err := subscriber.ReadMessage()
	if err == nil {
		t.Error("Suscriptor recibió mensaje de un topic diferente")
	}

	t.Log("✅ Aislamiento de topics funciona correctamente")
}

// ── Test: Publish sin JWT falla ───────────────────────────────────────────

func TestIntegration_PublishWithoutJWT(t *testing.T) {
	server, _ := createTestServer(t)
	defer server.Close()

	conn := dialWS(t, server)
	defer conn.Close()

	time.Sleep(50 * time.Millisecond)

	// Publicar sin token
	sendJSON(t, conn, PublishMessage{
		Type:  "publish",
		Token: "",
		Data: BusLocationData{
			BusID:   "BUS-101",
			RouteID: "route-1",
		},
	})

	var errMsg ErrorMessage
	readJSON(t, conn, &errMsg)

	if errMsg.Type != "error" {
		t.Errorf("Type = %q, want %q", errMsg.Type, "error")
	}
	if errMsg.Code != "AUTH_REQUIRED" {
		t.Errorf("Code = %q, want %q", errMsg.Code, "AUTH_REQUIRED")
	}

	t.Log("✅ Publicación sin JWT rechazada correctamente")
}

// ── Test: Publish con JWT de rol PASSENGER falla ──────────────────────────

func TestIntegration_PublishWithPassengerRole(t *testing.T) {
	server, _ := createTestServer(t)
	defer server.Close()

	conn := dialWS(t, server)
	defer conn.Close()

	time.Sleep(50 * time.Millisecond)

	token := generateJWT("PASSENGER")
	sendJSON(t, conn, PublishMessage{
		Type:  "publish",
		Token: token,
		Data: BusLocationData{
			BusID:   "BUS-101",
			RouteID: "route-1",
		},
	})

	var errMsg ErrorMessage
	readJSON(t, conn, &errMsg)

	if errMsg.Type != "error" {
		t.Errorf("Type = %q, want %q", errMsg.Type, "error")
	}
	if errMsg.Code != "AUTH_REQUIRED" {
		t.Errorf("Code = %q, want %q", errMsg.Code, "AUTH_REQUIRED")
	}

	t.Log("✅ Publicación con rol PASSENGER rechazada correctamente")
}

// ── Test: Publish con JWT inválido ────────────────────────────────────────

func TestIntegration_PublishWithInvalidJWT(t *testing.T) {
	server, _ := createTestServer(t)
	defer server.Close()

	conn := dialWS(t, server)
	defer conn.Close()

	time.Sleep(50 * time.Millisecond)

	sendJSON(t, conn, PublishMessage{
		Type:  "publish",
		Token: "invalid-token-not-jwt",
		Data: BusLocationData{
			BusID:   "BUS-101",
			RouteID: "route-1",
		},
	})

	var errMsg ErrorMessage
	readJSON(t, conn, &errMsg)

	if errMsg.Type != "error" {
		t.Errorf("Type = %q, want %q", errMsg.Type, "error")
	}
	if errMsg.Code != "AUTH_REQUIRED" {
		t.Errorf("Code = %q, want %q", errMsg.Code, "AUTH_REQUIRED")
	}

	t.Log("✅ JWT inválido rechazado correctamente")
}

// ── Test: Invalid topic ───────────────────────────────────────────────────

func TestIntegration_InvalidTopic(t *testing.T) {
	server, _ := createTestServer(t)
	defer server.Close()

	conn := dialWS(t, server)
	defer conn.Close()

	time.Sleep(50 * time.Millisecond)

	sendJSON(t, conn, SubscribeMessage{
		Type:  "subscribe",
		Topic: "invalid",
		ID:    "test",
	})

	var errMsg ErrorMessage
	readJSON(t, conn, &errMsg)

	if errMsg.Code != "INVALID_TOPIC" {
		t.Errorf("Code = %q, want %q", errMsg.Code, "INVALID_TOPIC")
	}

	t.Log("✅ Topic inválido rechazado correctamente")
}

// ── Test: Invalid message type ────────────────────────────────────────────

func TestIntegration_InvalidMessageType(t *testing.T) {
	server, _ := createTestServer(t)
	defer server.Close()

	conn := dialWS(t, server)
	defer conn.Close()

	time.Sleep(50 * time.Millisecond)

	sendJSON(t, conn, map[string]string{
		"type": "unknown_type",
	})

	var errMsg ErrorMessage
	readJSON(t, conn, &errMsg)

	if errMsg.Code != "INVALID_MESSAGE" {
		t.Errorf("Code = %q, want %q", errMsg.Code, "INVALID_MESSAGE")
	}

	t.Log("✅ Tipo de mensaje inválido rechazado correctamente")
}

// ── Test: Invalid JSON ────────────────────────────────────────────────────

func TestIntegration_InvalidJSON(t *testing.T) {
	server, _ := createTestServer(t)
	defer server.Close()

	conn := dialWS(t, server)
	defer conn.Close()

	time.Sleep(50 * time.Millisecond)

	conn.WriteMessage(gorillaWS.TextMessage, []byte("not valid json{{{"))

	var errMsg ErrorMessage
	readJSON(t, conn, &errMsg)

	if errMsg.Code != "INVALID_MESSAGE" {
		t.Errorf("Code = %q, want %q", errMsg.Code, "INVALID_MESSAGE")
	}

	t.Log("✅ JSON inválido rechazado correctamente")
}

// ── Test: Unsubscribe deja de recibir ─────────────────────────────────────

func TestIntegration_UnsubscribeStopsMessages(t *testing.T) {
	server, _ := createTestServer(t)
	defer server.Close()

	subscriber := dialWS(t, server)
	defer subscriber.Close()
	publisher := dialWS(t, server)
	defer publisher.Close()

	time.Sleep(50 * time.Millisecond)

	// Suscribir
	sendJSON(t, subscriber, SubscribeMessage{Type: "subscribe", Topic: "route", ID: "route-1"})
	time.Sleep(50 * time.Millisecond)

	// Desuscribir
	sendJSON(t, subscriber, SubscribeMessage{Type: "unsubscribe", Topic: "route", ID: "route-1"})
	time.Sleep(50 * time.Millisecond)

	// Publicar
	token := generateJWT("COMPANY")
	sendJSON(t, publisher, PublishMessage{
		Type:  "publish",
		Token: token,
		Data: BusLocationData{
			BusID:             "BUS-101",
			RouteID:           "route-1",
			CurrentPassengers: 10,
			Capacity:          80,
		},
	})

	// No debería recibir nada
	subscriber.SetReadDeadline(time.Now().Add(300 * time.Millisecond))
	_, _, err := subscriber.ReadMessage()
	if err == nil {
		t.Error("Suscriptor recibió mensaje después de desuscribirse")
	}

	t.Log("✅ Unsubscribe funciona correctamente — no se reciben más mensajes")
}

// ── Test: Múltiples suscriptores reciben el mismo broadcast ───────────────

func TestIntegration_MultipleSuscribers(t *testing.T) {
	server, _ := createTestServer(t)
	defer server.Close()

	sub1 := dialWS(t, server)
	defer sub1.Close()
	sub2 := dialWS(t, server)
	defer sub2.Close()
	pub := dialWS(t, server)
	defer pub.Close()

	time.Sleep(50 * time.Millisecond)

	// Ambos se suscriben a route-1
	sendJSON(t, sub1, SubscribeMessage{Type: "subscribe", Topic: "route", ID: "route-1"})
	sendJSON(t, sub2, SubscribeMessage{Type: "subscribe", Topic: "route", ID: "route-1"})
	time.Sleep(50 * time.Millisecond)

	// Publicar
	token := generateJWT("COMPANY")
	sendJSON(t, pub, PublishMessage{
		Type:  "publish",
		Token: token,
		Data: BusLocationData{
			BusID:             "BUS-101",
			RouteID:           "route-1",
			CurrentPassengers: 50,
			Capacity:          80,
		},
	})

	// Ambos deberían recibir
	var b1, b2 BusUpdateBroadcast
	readJSON(t, sub1, &b1)
	readJSON(t, sub2, &b2)

	if b1.Data.BusID != "BUS-101" || b2.Data.BusID != "BUS-101" {
		t.Error("No todos los suscriptores recibieron el broadcast correcto")
	}

	t.Log("✅ Múltiples suscriptores reciben broadcast correctamente")
}

// ── Test: Publish con datos faltantes ─────────────────────────────────────

func TestIntegration_PublishMissingFields(t *testing.T) {
	server, _ := createTestServer(t)
	defer server.Close()

	conn := dialWS(t, server)
	defer conn.Close()

	time.Sleep(50 * time.Millisecond)

	token := generateJWT("COMPANY")
	sendJSON(t, conn, PublishMessage{
		Type:  "publish",
		Token: token,
		Data: BusLocationData{
			BusID:   "", // Faltante
			RouteID: "", // Faltante
		},
	})

	var errMsg ErrorMessage
	readJSON(t, conn, &errMsg)

	if errMsg.Code != "INVALID_MESSAGE" {
		t.Errorf("Code = %q, want %q", errMsg.Code, "INVALID_MESSAGE")
	}

	t.Log("✅ Campos faltantes rechazados correctamente")
}
