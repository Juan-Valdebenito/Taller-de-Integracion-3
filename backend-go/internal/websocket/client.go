package websocket

import (
	"context"
	"encoding/json"
	"time"

	"github.com/golang-jwt/jwt/v5"
	gorillaWS "github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/token"
)

const (
	// Tiempo máximo para comprobar en la base que la micro sea de quien publica.
	authorizeTimeout = 5 * time.Second

	// Tiempo máximo para escribir un mensaje al cliente.
	writeWait = 10 * time.Second

	// Tiempo máximo entre pongs del cliente. Si se excede, se cierra la conexión.
	pongWait = 60 * time.Second

	// Intervalo de envío de pings al cliente. Debe ser menor que pongWait.
	pingPeriod = (pongWait * 9) / 10

	// Tamaño máximo de mensaje entrante (4 KB).
	maxMessageSize = 4096

	// Tamaño del buffer de envío por cliente.
	sendBufferSize = 256
)

// Client representa una conexión WebSocket individual.
type Client struct {
	hub  *Hub
	conn *gorillaWS.Conn
	send chan []byte

	// Topics a los que está suscrito este cliente (set).
	topics map[string]bool

	// Secreto JWT para validar mensajes de publicación.
	jwtSecret string

	// revStore rechaza tokens revocados (logout o revocación de un admin);
	// nil = sin comprobación (solo en la demo local).
	revStore token.RevocationStore

	// authz comprueba que la micro y la ruta sean de quien publica; nil = sin
	// comprobación (solo en la demo local).
	authz PublishAuthorizer
}

// NewClient crea un nuevo Client asociado al Hub.
func NewClient(hub *Hub, conn *gorillaWS.Conn, jwtSecret string) *Client {
	return &Client{
		hub:       hub,
		conn:      conn,
		send:      make(chan []byte, sendBufferSize),
		topics:    make(map[string]bool),
		jwtSecret: jwtSecret,
	}
}

// readPump lee mensajes del WebSocket y los procesa.
// Debe ejecutarse como goroutine dedicada por cliente.
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if gorillaWS.IsUnexpectedCloseError(err, gorillaWS.CloseGoingAway, gorillaWS.CloseNormalClosure) {
				log.Warn().Err(err).Str("event", "websocket_read_failed").Msg("WebSocket read failed")
			}
			break
		}

		c.handleMessage(message)
	}
}

// writePump escribe mensajes al WebSocket desde el channel send.
// Debe ejecutarse como goroutine dedicada por cliente.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub cerró el channel.
				c.conn.WriteMessage(gorillaWS.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(gorillaWS.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Drenar mensajes pendientes en el buffer para batch writing.
			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(gorillaWS.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// handleMessage despacha un mensaje entrante según su tipo.
func (c *Client) handleMessage(raw []byte) {
	var envelope IncomingMessage
	if err := json.Unmarshal(raw, &envelope); err != nil {
		c.sendError("INVALID_MESSAGE", "Mensaje JSON inválido")
		return
	}

	switch envelope.Type {
	case "subscribe", "unsubscribe":
		c.handleSubscription(raw, envelope.Type)
	case "publish":
		c.handlePublish(raw)
	default:
		c.sendError("INVALID_MESSAGE", "Tipo de mensaje desconocido: "+envelope.Type)
	}
}

// handleSubscription procesa mensajes de suscripción/desuscripción.
func (c *Client) handleSubscription(raw []byte, msgType string) {
	var msg SubscribeMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		c.sendError("INVALID_MESSAGE", "Formato de suscripción inválido")
		return
	}

	// Validar topic
	if msg.Topic != "route" && msg.Topic != "bus" {
		c.sendError("INVALID_TOPIC", "Topic debe ser 'route' o 'bus'")
		return
	}
	if msg.ID == "" {
		c.sendError("INVALID_MESSAGE", "El campo 'id' es requerido")
		return
	}

	topicKey := msg.TopicKey()

	if msgType == "subscribe" {
		c.hub.Subscribe(c, topicKey)
	} else {
		c.hub.Unsubscribe(c, topicKey)
	}
}

// handlePublish procesa mensajes de publicación (requiere JWT válido).
func (c *Client) handlePublish(raw []byte) {
	var msg PublishMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		c.sendError("INVALID_MESSAGE", "Formato de publicación inválido")
		return
	}

	// Validar JWT
	if msg.Token == "" {
		c.sendError("AUTH_REQUIRED", "Token JWT requerido para publicar")
		return
	}

	claims, problem := validatePublishToken(c.jwtSecret, c.revStore, msg.Token)
	if problem != "" {
		c.sendError("AUTH_REQUIRED", problem)
		return
	}

	// Solo COMPANY y ADMIN pueden publicar
	role, _ := claims["role"].(string)
	if role != "COMPANY" && role != "ADMIN" {
		c.sendError("AUTH_REQUIRED", "Rol insuficiente — se requiere COMPANY o ADMIN")
		return
	}

	// Validar campos mínimos
	if msg.Data.BusID == "" || msg.Data.RouteID == "" {
		c.sendError("INVALID_MESSAGE", "busId y routeId son requeridos")
		return
	}

	// Una empresa solo publica la posición de sus micros, en sus rutas.
	if c.authz != nil {
		userID, _ := claims["id"].(string)
		ctx, cancel := context.WithTimeout(context.Background(), authorizeTimeout)
		problem := c.authz.CanPublish(ctx, userID, role, msg.Data.BusID, msg.Data.RouteID)
		cancel()
		if problem != "" {
			c.sendError("FORBIDDEN", problem)
			return
		}
	}

	// Enviar al Hub para broadcast
	c.hub.publish <- &msg
}

// validatePublishToken valida el token de una publicación con las mismas
// reglas que la API REST (middleware.Authenticate): firma y vencimiento, que
// sea un access token (no uno de renovación) y que no esté revocado. Devuelve
// los claims o el motivo del rechazo.
func validatePublishToken(secret string, store token.RevocationStore, tokenString string) (jwt.MapClaims, string) {
	parsed, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(secret), nil
	})
	if err != nil || !parsed.Valid {
		return nil, "Token JWT inválido o vencido"
	}
	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return nil, "Token JWT inválido o vencido"
	}
	if tokenType, _ := claims["type"].(string); tokenType != "access" {
		return nil, "Se requiere un access token"
	}
	if store == nil {
		return claims, ""
	}
	jti, _ := claims["jti"].(string)
	if jti == "" {
		return nil, "Token JWT inválido o vencido"
	}
	revoked, err := store.IsRevoked(jti)
	if err != nil {
		// Fail-closed, como la API: si no se puede consultar, se rechaza.
		return nil, "No se pudo verificar el estado del token, intenta nuevamente"
	}
	if revoked {
		return nil, "El token ha sido revocado. Por favor inicia sesión nuevamente"
	}
	return claims, ""
}

// sendError envía un mensaje de error al cliente.
func (c *Client) sendError(code, message string) {
	errMsg := ErrorMessage{
		Type:    "error",
		Code:    code,
		Message: message,
	}
	data, err := json.Marshal(errMsg)
	if err != nil {
		return
	}

	select {
	case c.send <- data:
	default:
		// Buffer lleno — el writePump eventualmente lo detectará
	}
}
