package websocket

// ── Tipos de mensajes del protocolo WebSocket Pub/Sub ──────────────────────

// IncomingMessage es el envelope genérico de cualquier mensaje entrante.
// Se decodifica primero para determinar el tipo y luego se re-parsea
// al tipo concreto.
type IncomingMessage struct {
	Type string `json:"type"` // "subscribe" | "unsubscribe" | "publish"
}

// ── Suscripción ────────────────────────────────────────────────────────────

// SubscribeMessage representa un mensaje de suscripción o desuscripción.
//
//	{ "type": "subscribe", "topic": "route", "id": "route-1" }
//	{ "type": "subscribe", "topic": "bus",   "id": "BUS-101" }
//	{ "type": "unsubscribe", "topic": "route", "id": "route-1" }
type SubscribeMessage struct {
	Type  string `json:"type"`  // "subscribe" | "unsubscribe"
	Topic string `json:"topic"` // "route" | "bus"
	ID    string `json:"id"`    // routeId o busId
}

// TopicKey construye la clave del topic tal como se usa en el Hub.
// Ej: "route:route-1", "bus:BUS-101".
func (m *SubscribeMessage) TopicKey() string {
	return m.Topic + ":" + m.ID
}

// ── Publicación (requiere JWT) ─────────────────────────────────────────────

// PublishMessage es enviado por dispositivos GPS / empresas para reportar
// la ubicación y aforo de un bus. Requiere un token JWT válido con rol
// COMPANY o ADMIN.
type PublishMessage struct {
	Type  string          `json:"type"`  // "publish"
	Token string          `json:"token"` // JWT
	Data  BusLocationData `json:"data"`
}

// BusLocationData contiene la posición y aforo reportado por un bus.
type BusLocationData struct {
	BusID             string  `json:"busId"`
	RouteID           string  `json:"routeId"`
	Latitude          float64 `json:"latitude"`
	Longitude         float64 `json:"longitude"`
	Heading           float64 `json:"heading"`
	Speed             float64 `json:"speed"`
	CurrentPassengers int     `json:"currentPassengers"`
	Capacity          int     `json:"capacity"`
}

// ── Broadcast (servidor → suscriptores) ────────────────────────────────────

// BusUpdateBroadcast es el mensaje enviado a los suscriptores con la
// ubicación actualizada, aforo y predicción de ocupación.
type BusUpdateBroadcast struct {
	Type string           `json:"type"` // "bus:update"
	Data BusUpdatePayload `json:"data"`
}

// BusUpdatePayload contiene todos los datos emitidos en un broadcast.
type BusUpdatePayload struct {
	BusID             string         `json:"busId"`
	RouteID           string         `json:"routeId"`
	Latitude          float64        `json:"latitude"`
	Longitude         float64        `json:"longitude"`
	Heading           float64        `json:"heading"`
	Speed             float64        `json:"speed"`
	CurrentPassengers int            `json:"currentPassengers"`
	Capacity          int            `json:"capacity"`
	Occupancy         *OccupancyInfo `json:"occupancy,omitempty"`
	Timestamp         string         `json:"timestamp"`
}

// OccupancyInfo es un subset del OccupancyResult del servicio, adaptado
// para el broadcast WebSocket.
type OccupancyInfo struct {
	CurrentRatio   float64 `json:"currentRatio"`
	PredictedRatio float64 `json:"predictedRatio"`
	OccupancyLevel string  `json:"occupancyLevel"`
	OccupancyText  string  `json:"occupancyText"`
	OccupancyColor string  `json:"occupancyColor"`
	Confidence     float64 `json:"confidence"`
	IsSimulated    bool    `json:"isSimulated"`
	PredictorName  string  `json:"predictorName"`
}

// ── Error ──────────────────────────────────────────────────────────────────

// ErrorMessage se envía al cliente cuando ocurre un error de protocolo
// o de autenticación.
type ErrorMessage struct {
	Type    string `json:"type"`    // "error"
	Message string `json:"message"`
	Code    string `json:"code"` // "AUTH_REQUIRED" | "INVALID_MESSAGE" | "INVALID_TOPIC"
}
