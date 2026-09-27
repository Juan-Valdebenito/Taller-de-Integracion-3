package websocket

import (
	"net/http"

	gorillaWS "github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
)

// upgrader configura el upgrade HTTP → WebSocket.
var upgrader = gorillaWS.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// CheckOrigin se configura dinámicamente en NewWSHandler.
	CheckOrigin: func(r *http.Request) bool {
		return true // se sobreescribe abajo
	},
}

// WSHandler maneja el upgrade HTTP → WebSocket y la creación de clientes.
type WSHandler struct {
	hub       *Hub
	jwtSecret string
	origins   []string
}

// NewWSHandler crea un handler WebSocket configurado.
func NewWSHandler(hub *Hub, jwtSecret string, allowedOrigins []string) *WSHandler {
	h := &WSHandler{
		hub:       hub,
		jwtSecret: jwtSecret,
		origins:   allowedOrigins,
	}

	// Configurar CheckOrigin del upgrader
	upgrader.CheckOrigin = func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true // Conexiones sin Origin (ej: wscat, Postman)
		}
		for _, allowed := range h.origins {
			if origin == allowed {
				return true
			}
		}
		log.Warn().Str("event", "websocket_origin_rejected").Str("origin", origin).Msg("WebSocket origin rejected")
		return false
	}

	return h
}

// ServeHTTP implementa http.Handler para el upgrade WebSocket.
// Se registra como handler de Gin vía gin.WrapH o directamente.
func (h *WSHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Warn().Err(err).Str("event", "websocket_upgrade_failed").Msg("WebSocket upgrade failed")
		return
	}

	client := NewClient(h.hub, conn, h.jwtSecret)
	h.hub.register <- client

	// Lanzar goroutines de lectura y escritura
	go client.writePump()
	go client.readPump()
}
