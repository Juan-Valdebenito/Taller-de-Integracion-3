// Package telemetry reenvía las posiciones GPS de las micros al microservicio
// micro_telemetry (histórico en TimescaleDB y estado en NATS). Es una llamada
// de servidor a servidor: la API key nunca llega a la app móvil.
package telemetry

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

// GPSReading es el cuerpo de POST /api/v1/telemetry/gps de micro_telemetry.
type GPSReading struct {
	EventID   string    `json:"event_id"`
	BusID     string    `json:"bus_id"`
	RouteID   string    `json:"route_id,omitempty"`
	Latitude  float64   `json:"latitude"`
	Longitude float64   `json:"longitude"`
	Heading   float64   `json:"heading,omitempty"`
	SpeedKMH  float64   `json:"speed_kmh,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

// Client llama a micro_telemetry.
type Client struct {
	URL    string // ej. http://micro-telemetry-svc:8080/api/v1/telemetry/gps
	APIKey string // header X-API-Key (secreto)
	HTTP   *http.Client
}

func NewClient(url, apiKey string) *Client {
	return &Client{URL: url, APIKey: apiKey, HTTP: &http.Client{Timeout: 5 * time.Second}}
}

// SendGPS envía una lectura. micro_telemetry responde 202 si la guardó.
func (c *Client) SendGPS(ctx context.Context, reading GPSReading) error {
	body, err := json.Marshal(reading)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.URL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.APIKey != "" {
		req.Header.Set("X-API-Key", c.APIKey)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("micro_telemetry: %w", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10))
	if resp.StatusCode >= 300 {
		return fmt.Errorf("micro_telemetry: HTTP %d", resp.StatusCode)
	}
	return nil
}

// sendTimeout limita cuánto puede tardar un reenvío (va aparte de la petición).
const sendTimeout = 10 * time.Second

// Forwarder reenvía en segundo plano: la API responde a la app sin esperar a
// micro_telemetry, y si este no responde la posición igual llega al mapa.
type Forwarder struct {
	client interface {
		SendGPS(ctx context.Context, reading GPSReading) error
	}
	wg sync.WaitGroup
}

func NewForwarder(client *Client) *Forwarder {
	return &Forwarder{client: client}
}

// Forward envía la lectura sin bloquear. Un Forwarder nil no hace nada
// (micro_telemetry sin configurar).
func (f *Forwarder) Forward(reading GPSReading) {
	if f == nil {
		return
	}
	f.wg.Add(1)
	go func() {
		defer f.wg.Done()
		ctx, cancel := context.WithTimeout(context.Background(), sendTimeout)
		defer cancel()
		if err := f.client.SendGPS(ctx, reading); err != nil {
			log.Warn().Err(err).Str("event", "telemetry_forward_failed").Str("bus_id", reading.BusID).
				Msg("Could not forward GPS reading to micro_telemetry")
		}
	}()
}

// Wait espera los reenvíos en curso (para los tests).
func (f *Forwarder) Wait() {
	if f != nil {
		f.wg.Wait()
	}
}
