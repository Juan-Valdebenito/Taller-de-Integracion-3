package websocket

import (
	"encoding/json"
	"log"
	"time"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
)

// Hub es el motor central del patrón Pub/Sub.
// Gestiona clientes conectados, suscripciones a topics y fan-out de mensajes.
type Hub struct {
	// Clientes registrados.
	clients map[*Client]bool

	// Topics: mapa de topicKey → set de clientes suscritos.
	// Claves con formato "route:{id}" o "bus:{id}".
	topics map[string]map[*Client]bool

	// Canal para registrar nuevos clientes.
	register chan *Client

	// Canal para desregistrar clientes desconectados.
	unregister chan *Client

	// Canal para mensajes de publicación entrantes (ya validados).
	publish chan *PublishMessage

	// Servicio de ocupación para enriquecer broadcasts.
	occupancySvc *service.OccupancyService
}

// NewHub crea un nuevo Hub con el servicio de ocupación inyectado.
func NewHub(occupancySvc *service.OccupancyService) *Hub {
	return &Hub{
		clients:      make(map[*Client]bool),
		topics:       make(map[string]map[*Client]bool),
		register:     make(chan *Client),
		unregister:   make(chan *Client),
		publish:      make(chan *PublishMessage, 256),
		occupancySvc: occupancySvc,
	}
}

// Run inicia el loop principal del Hub. Debe ejecutarse como goroutine.
//
//	go hub.Run()
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
			log.Printf("[WS Hub] Cliente conectado — total: %d", len(h.clients))

		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				// Remover de todos los topics
				for topic := range client.topics {
					h.removeFromTopic(client, topic)
				}
				delete(h.clients, client)
				close(client.send)
				log.Printf("[WS Hub] Cliente desconectado — total: %d", len(h.clients))
			}

		case msg := <-h.publish:
			h.handlePublish(msg)
		}
	}
}

// Subscribe agrega un cliente a un topic.
func (h *Hub) Subscribe(client *Client, topicKey string) {
	if h.topics[topicKey] == nil {
		h.topics[topicKey] = make(map[*Client]bool)
	}
	h.topics[topicKey][client] = true
	client.topics[topicKey] = true
	log.Printf("[WS Hub] Cliente suscrito a %s — suscriptores: %d", topicKey, len(h.topics[topicKey]))
}

// Unsubscribe remueve un cliente de un topic.
func (h *Hub) Unsubscribe(client *Client, topicKey string) {
	h.removeFromTopic(client, topicKey)
	delete(client.topics, topicKey)
	log.Printf("[WS Hub] Cliente desuscrito de %s", topicKey)
}

// handlePublish procesa un mensaje de publicación: enriquece con predicción
// de ocupación y hace broadcast a los topics correspondientes.
func (h *Hub) handlePublish(msg *PublishMessage) {
	data := msg.Data

	// Construir predicción de ocupación
	var occupancy *OccupancyInfo
	if data.Capacity > 0 {
		input := service.OccupancyInput{
			CurrentPassengers: data.CurrentPassengers,
			Capacity:          data.Capacity,
			RouteID:           data.RouteID,
		}
		result, err := h.occupancySvc.Predict(input)
		if err != nil {
			log.Printf("[WS Hub] Error al predecir ocupación: %v", err)
		} else {
			occupancy = &OccupancyInfo{
				CurrentRatio:   result.CurrentRatio,
				PredictedRatio: result.PredictedRatio,
				OccupancyLevel: string(result.OccupancyLevel),
				OccupancyText:  result.OccupancyText,
				OccupancyColor: result.OccupancyColor,
				Confidence:     result.Confidence,
				IsSimulated:    result.IsSimulated,
				PredictorName:  result.PredictorName,
			}
		}
	}

	// Construir broadcast
	broadcast := BusUpdateBroadcast{
		Type: "bus:update",
		Data: BusUpdatePayload{
			BusID:             data.BusID,
			RouteID:           data.RouteID,
			Latitude:          data.Latitude,
			Longitude:         data.Longitude,
			Heading:           data.Heading,
			Speed:             data.Speed,
			CurrentPassengers: data.CurrentPassengers,
			Capacity:          data.Capacity,
			Occupancy:         occupancy,
			Timestamp:         time.Now().UTC().Format(time.RFC3339),
		},
	}

	payload, err := json.Marshal(broadcast)
	if err != nil {
		log.Printf("[WS Hub] Error al serializar broadcast: %v", err)
		return
	}

	// Fan-out: enviar a suscriptores del topic de ruta
	routeTopic := "route:" + data.RouteID
	h.broadcastToTopic(routeTopic, payload)

	// Fan-out: enviar a suscriptores del topic de bus
	busTopic := "bus:" + data.BusID
	h.broadcastToTopic(busTopic, payload)
}

// broadcastToTopic envía un payload a todos los clientes suscritos a un topic.
func (h *Hub) broadcastToTopic(topicKey string, payload []byte) {
	subscribers, ok := h.topics[topicKey]
	if !ok {
		return
	}

	for client := range subscribers {
		select {
		case client.send <- payload:
		default:
			// Buffer del cliente lleno — desconectarlo
			h.removeFromTopic(client, topicKey)
			delete(h.clients, client)
			close(client.send)
			log.Printf("[WS Hub] Cliente removido por buffer lleno en topic %s", topicKey)
		}
	}
}

// removeFromTopic remueve un cliente de un topic específico.
// Limpia el topic si queda vacío.
func (h *Hub) removeFromTopic(client *Client, topicKey string) {
	if subscribers, ok := h.topics[topicKey]; ok {
		delete(subscribers, client)
		if len(subscribers) == 0 {
			delete(h.topics, topicKey)
		}
	}
}

// Publish encola un mensaje para ser publicado por el Hub.
// Es seguro llamarlo desde múltiples goroutines.
func (h *Hub) Publish(msg *PublishMessage) {
	h.publish <- msg
}

// PublishInternal encola un mensaje desde código interno de confianza
// (ej: el motor de simulación GPS) sin requerir autenticación JWT.
// Es seguro llamarlo desde múltiples goroutines.
func (h *Hub) PublishInternal(data BusLocationData) {
	h.publish <- &PublishMessage{
		Type: "publish",
		Data: data,
	}
}
