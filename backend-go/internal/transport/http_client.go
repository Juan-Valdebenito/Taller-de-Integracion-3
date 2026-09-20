package transport

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// ── DTOs HTTP (contrato REST con el microservicio ML) ─────────────────────────

// httpPredictRequestBody es el cuerpo JSON enviado al endpoint POST /predict.
// Mantiene snake_case para compatibilidad con APIs Python/Flask/FastAPI.
type httpPredictRequestBody struct {
	RouteID           string `json:"route_id"`
	CurrentPassengers int    `json:"current_passengers"`
	Capacity          int    `json:"capacity"`
	Hour              int    `json:"hour"`
	DayOfWeek         int    `json:"day_of_week"`
}

// httpPredictResponseBody es el cuerpo JSON esperado como respuesta de POST /predict.
type httpPredictResponseBody struct {
	PredictedRatio      float64 `json:"predicted_ratio"`
	PredictedPassengers int     `json:"predicted_passengers"`
	OccupancyLevel      string  `json:"occupancy_level"`
	Confidence          float64 `json:"confidence"`
	PredictorName       string  `json:"predictor_name"`
	PredictedAt         string  `json:"predicted_at"`
}

// httpErrorBody es el cuerpo JSON devuelto por el servidor en caso de error.
type httpErrorBody struct {
	Error   string `json:"error"`
	Detail  string `json:"detail,omitempty"`
	Message string `json:"message,omitempty"`
}

// ── Implementación HTTP ───────────────────────────────────────────────────────

// HTTPPredictionClient implementa PredictionClient usando net/http estándar.
// Es el fallback cuando gRPC no está disponible o se prefiere REST.
//
// Llama a: POST {baseURL}/predict
//
// Esta implementación no requiere dependencias externas más allá de la
// librería estándar de Go, lo que la hace ideal para entornos donde
// no es posible agregar protobuf/gRPC.
type HTTPPredictionClient struct {
	baseURL string
	http    *http.Client
}

// NewHTTPPredictionClient crea un cliente HTTP hacia el microservicio de predicción.
//
// baseURL debe incluir esquema y host sin barra final (ej: "http://localhost:8000").
// timeout controla el tiempo máximo de espera por llamada. Se recomienda 5s.
func NewHTTPPredictionClient(baseURL string, timeout time.Duration) (*HTTPPredictionClient, error) {
	if baseURL == "" {
		return nil, fmt.Errorf("http: baseURL no puede estar vacía")
	}
	if timeout <= 0 {
		timeout = 5 * time.Second
	}

	return &HTTPPredictionClient{
		baseURL: baseURL,
		http: &http.Client{
			Timeout: timeout,
			// Transport con keep-alive y pool de conexiones para reutilización eficiente
			Transport: &http.Transport{
				MaxIdleConns:        10,
				MaxIdleConnsPerHost: 5,
				IdleConnTimeout:     30 * time.Second,
			},
		},
	}, nil
}

// Predict serializa la solicitud como JSON, llama a POST /predict en el
// servidor ML y mapea la respuesta al DTO de dominio PredictResponse.
//
// Manejo de errores HTTP:
//   - 4xx → error de cliente (datos inválidos, ruta no encontrada)
//   - 5xx → error del servidor ML
//   - timeout → context.DeadlineExceeded propagado
func (c *HTTPPredictionClient) Predict(ctx context.Context, req PredictRequest) (*PredictResponse, error) {
	start := time.Now()

	// Resolver hora y día de la semana si no se proveen
	now := time.Now()
	hour := now.Hour()
	if req.Hour != nil {
		hour = *req.Hour
	}

	dayOfWeek := int(now.Weekday())
	if req.DayOfWeek != nil {
		dayOfWeek = *req.DayOfWeek
	}

	// Serializar body JSON
	body := httpPredictRequestBody{
		RouteID:           req.RouteID,
		CurrentPassengers: req.CurrentPassengers,
		Capacity:          req.Capacity,
		Hour:              hour,
		DayOfWeek:         dayOfWeek,
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("http: error serializando solicitud: %w", err)
	}

	// Construir la solicitud HTTP con el contexto del llamador
	url := c.baseURL + "/predict"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("http: error creando solicitud a %s: %w", url, err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json")

	// Ejecutar la solicitud
	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("http: error llamando a %s: %w", url, err)
	}
	defer resp.Body.Close()

	// Leer el cuerpo completo (con límite para evitar ataques de memoria)
	const maxResponseBytes = 1 << 20 // 1 MiB
	respBytes, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		return nil, fmt.Errorf("http: error leyendo respuesta de %s: %w", url, err)
	}

	// Manejar errores HTTP
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, parseHTTPError(resp.StatusCode, url, respBytes)
	}

	// Deserializar respuesta exitosa
	var respBody httpPredictResponseBody
	if err := json.Unmarshal(respBytes, &respBody); err != nil {
		return nil, fmt.Errorf("http: error deserializando respuesta de %s: %w", url, err)
	}

	return &PredictResponse{
		PredictedRatio:      respBody.PredictedRatio,
		PredictedPassengers: respBody.PredictedPassengers,
		OccupancyLevel:      respBody.OccupancyLevel,
		Confidence:          respBody.Confidence,
		PredictorName:       respBody.PredictorName,
		PredictedAt:         respBody.PredictedAt,
		Latency:             time.Since(start),
	}, nil
}

// Close es un no-op para el cliente HTTP; el pool de conexiones se gestiona
// automáticamente por net/http. Se implementa para satisfacer la interfaz PredictionClient.
func (c *HTTPPredictionClient) Close() error {
	// El http.Client con Transport no requiere cierre explícito.
	// El idle pool se libera al finalizar el proceso.
	return nil
}

// parseHTTPError construye un error descriptivo a partir del status HTTP
// e intenta extraer el mensaje del body JSON si está disponible.
func parseHTTPError(statusCode int, url string, body []byte) error {
	var errBody httpErrorBody
	if jsonErr := json.Unmarshal(body, &errBody); jsonErr == nil {
		msg := errBody.Error
		if msg == "" {
			msg = errBody.Message
		}
		if msg == "" {
			msg = errBody.Detail
		}
		if msg != "" {
			return fmt.Errorf("http: servidor ML respondió %d desde %s: %s", statusCode, url, msg)
		}
	}

	// Fallback: truncar el body crudo para el mensaje de error
	preview := string(body)
	if len(preview) > 200 {
		preview = preview[:200] + "..."
	}
	return fmt.Errorf("http: servidor ML respondió %d desde %s: %s", statusCode, url, preview)
}
