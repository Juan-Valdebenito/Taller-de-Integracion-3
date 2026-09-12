package websocket

import (
	"encoding/json"
	"log"
	"time"

	"github.com/golang-jwt/jwt/v5"
	gorillaWS "github.com/gorilla/websocket"
)

const (
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
				log.Printf("[WS Client] Error de lectura: %v", err)
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

	claims, err := c.validateJWT(msg.Token)
	if err != nil {
		c.sendError("AUTH_REQUIRED", "Token JWT inválido: "+err.Error())
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

	// Enviar al Hub para broadcast
	c.hub.publish <- &msg
}

// validateJWT valida un token JWT y retorna los claims.
func (c *Client) validateJWT(tokenString string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(c.jwtSecret), nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return nil, jwt.ErrSignatureInvalid
	}

	return claims, nil
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
