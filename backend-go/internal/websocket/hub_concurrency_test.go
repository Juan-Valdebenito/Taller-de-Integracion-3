package websocket

import (
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
)

// Muchos clientes se suscriben y se van a la vez, mientras se publican micros. Sin
// el mutex, Go termina el proceso con "concurrent map writes".
func TestHubSurvivesConcurrentSubscriptions(t *testing.T) {
	hub := NewHub(service.NewOccupancyService())
	go hub.Run()
	const clientCount, roundsPerClient = 50, 40
	var workers sync.WaitGroup
	for clientIndex := 0; clientIndex < clientCount; clientIndex++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			client := NewClient(hub, nil, "secret")
			hub.register <- client
			for round := 0; round < roundsPerClient; round++ {
				topicKey := fmt.Sprintf("route:route-%d", round%5)
				hub.Subscribe(client, topicKey)
				hub.PublishInternal(BusLocationData{BusID: "bus", RouteID: "route-1"})
				client.sendError("TEST", "error")
				hub.Unsubscribe(client, topicKey)
			}
			hub.Subscribe(client, "route:route-1")
			hub.unregister <- client
		}()
	}
	finished := make(chan struct{})
	go func() { workers.Wait(); close(finished) }()
	select {
	case <-finished:
	case <-time.After(20 * time.Second):
		t.Fatal("the hub got stuck")
	}
	// Run atiende los canales en orden, así que al procesar un registro posterior ya
	// terminó con las bajas anteriores.
	lastClient := NewClient(hub, nil, "secret")
	hub.register <- lastClient
	hub.unregister <- lastClient
	hub.register <- NewClient(hub, nil, "secret")
	hub.mutex.Lock()
	defer hub.mutex.Unlock()
	if len(hub.topics) != 0 {
		t.Fatalf("%d topics still have clients that left", len(hub.topics))
	}
}

// Un cliente lento, suscrito a dos temas, se quita de ambos. Antes quedaba en el
// segundo con el canal cerrado, y el siguiente envío hacía panic.
func TestSlowClientIsRemovedFromEveryTopic(t *testing.T) {
	hub := NewHub(service.NewOccupancyService())
	slowClient, fastClient := NewClient(hub, nil, "secret"), NewClient(hub, nil, "secret")
	hub.clients[slowClient], hub.clients[fastClient] = true, true
	for _, topicKey := range []string{"route:route-1", "bus:BUS-101"} {
		hub.Subscribe(slowClient, topicKey)
		hub.Subscribe(fastClient, topicKey)
	}
	for len(slowClient.send) < cap(slowClient.send) {
		slowClient.send <- []byte("pending")
	}
	hub.broadcastToTopic("route:route-1", []byte("first"))
	hub.broadcastToTopic("bus:BUS-101", []byte("second"))

	if hub.clients[slowClient] || len(slowClient.topics) != 0 || hub.topics["bus:BUS-101"][slowClient] {
		t.Fatal("the slow client is still connected")
	}
	if !hub.clients[fastClient] || len(fastClient.send) != 2 {
		t.Fatalf("the other client received %d messages, want 2", len(fastClient.send))
	}
}

// Después de cerrar la conexión, responder un error o cerrarla de nuevo no hace
// panic.
func TestClosedClientIgnoresMessages(t *testing.T) {
	client := NewClient(NewHub(service.NewOccupancyService()), nil, "secret")
	if !client.trySend([]byte("before")) {
		t.Fatal("an open client rejected a message")
	}
	client.closeSend()
	client.closeSend()
	client.sendError("TEST", "error")
	if client.trySend([]byte("after")) {
		t.Fatal("a closed client accepted a message")
	}
}
