// Package push envía notificaciones push a la app móvil con el servicio de
// Expo Push (https://docs.expo.dev/push-notifications/sending-notifications/).
package push

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Message es una notificación para un teléfono (token de Expo Push).
type Message struct {
	To        string            `json:"to"`
	Title     string            `json:"title"`
	Body      string            `json:"body"`
	Data      map[string]string `json:"data,omitempty"`
	Sound     string            `json:"sound,omitempty"`
	ChannelID string            `json:"channelId,omitempty"`
}

// Ticket es la respuesta de Expo para cada mensaje, en el mismo orden.
type Ticket struct {
	Status  string `json:"status"` // "ok" | "error"
	ID      string `json:"id,omitempty"`
	Message string `json:"message,omitempty"`
	Details struct {
		Error string `json:"error,omitempty"`
	} `json:"details"`
}

// DeviceNotRegistered: el teléfono ya no recibe push con ese token; hay que olvidarlo.
func (t Ticket) DeviceNotRegistered() bool {
	return t.Status == "error" && t.Details.Error == "DeviceNotRegistered"
}

// maxBatch: Expo acepta hasta 100 mensajes por solicitud.
const maxBatch = 100

// ExpoClient envía mensajes al servicio de Expo Push.
type ExpoClient struct {
	URL string
	// AccessToken es opcional (si el proyecto de EAS exige autenticación).
	AccessToken string
	HTTP        *http.Client
}

// NewExpoClient crea un cliente con un tiempo límite por solicitud.
func NewExpoClient(url, accessToken string) *ExpoClient {
	return &ExpoClient{URL: url, AccessToken: accessToken, HTTP: &http.Client{Timeout: 10 * time.Second}}
}

// Send envía los mensajes en lotes de 100 y devuelve un ticket por mensaje.
func (c *ExpoClient) Send(ctx context.Context, messages []Message) ([]Ticket, error) {
	tickets := make([]Ticket, 0, len(messages))
	for start := 0; start < len(messages); start += maxBatch {
		end := min(start+maxBatch, len(messages))
		batch, err := c.sendBatch(ctx, messages[start:end])
		if err != nil {
			return tickets, err
		}
		tickets = append(tickets, batch...)
	}
	return tickets, nil
}

func (c *ExpoClient) sendBatch(ctx context.Context, messages []Message) ([]Ticket, error) {
	body, err := json.Marshal(messages)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.URL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if c.AccessToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.AccessToken)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("expo push: %w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("expo push: leyendo la respuesta: %w", err)
	}
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("expo push: HTTP %d", resp.StatusCode)
	}
	var parsed struct {
		Data []Ticket `json:"data"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("expo push: respuesta inválida: %w", err)
	}
	if len(parsed.Data) != len(messages) {
		return nil, fmt.Errorf("expo push: %d tickets para %d mensajes", len(parsed.Data), len(messages))
	}
	return parsed.Data, nil
}
