package load

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	vegeta "github.com/tsenart/vegeta/v12/lib"
)

// loginResponse es la respuesta esperada del endpoint POST /api/v1/auth/login.
type loginResponse struct {
	Token string `json:"token"`
}

// Login hace POST /api/v1/auth/login y retorna el JWT obtenido.
func Login(baseURL, email, password string) (string, error) {
	body, _ := json.Marshal(map[string]string{"email": email, "password": password})
	resp, err := http.Post(baseURL+"/api/v1/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("error conectando al servidor: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("login fallido (%d): %s", resp.StatusCode, string(raw))
	}
	var lr loginResponse
	if err := json.NewDecoder(resp.Body).Decode(&lr); err != nil {
		return "", fmt.Errorf("error decodificando respuesta de login: %w", err)
	}
	if lr.Token == "" {
		return "", fmt.Errorf("el servidor no retorno un token")
	}
	return lr.Token, nil
}

// jsonBody serializa v a JSON y retorna los bytes.
func jsonBody(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

// BuildPublicTargets construye los targets que no requieren autenticacion.
func BuildPublicTargets(baseURL string) []vegeta.Target {
	hdr := http.Header{"Content-Type": []string{"application/json"}}
	return []vegeta.Target{
		// Health check
		{
			Method: "GET",
			URL:    baseURL + "/health",
			Header: hdr,
		},
		// Prediccion de ocupacion — varios escenarios realistas
		{
			Method: "POST",
			URL:    baseURL + "/api/v1/occupancy",
			Header: hdr,
			Body: jsonBody(map[string]any{
				"currentPassengers": 30,
				"capacity":          45,
				"routeId":           "route-001",
				"hour":              8,
				"dayOfWeek":         1,
			}),
		},
		{
			Method: "POST",
			URL:    baseURL + "/api/v1/occupancy",
			Header: hdr,
			Body: jsonBody(map[string]any{
				"currentPassengers": 44,
				"capacity":          45,
				"routeId":           "route-002",
				"hour":              17,
				"dayOfWeek":         5,
			}),
		},
		{
			Method: "POST",
			URL:    baseURL + "/api/v1/occupancy",
			Header: hdr,
			Body: jsonBody(map[string]any{
				"currentPassengers": 15,
				"capacity":          45,
				"routeId":           "route-003",
				"hour":              12,
				"dayOfWeek":         3,
			}),
		},
		// Occupancy en hora punta sin routeId
		{
			Method: "POST",
			URL:    baseURL + "/api/v1/occupancy",
			Header: hdr,
			Body: jsonBody(map[string]any{
				"currentPassengers": 1,
				"capacity":          30,
			}),
		},
	}
}

// BuildAuthTargets construye los targets que requieren JWT.
func BuildAuthTargets(baseURL, token string) []vegeta.Target {
	hdr := http.Header{
		"Content-Type":  []string{"application/json"},
		"Authorization": []string{"Bearer " + token},
	}
	return []vegeta.Target{
		// GET /auth/me
		{Method: "GET", URL: baseURL + "/api/v1/auth/me", Header: hdr},
		// GET /buses
		{Method: "GET", URL: baseURL + "/api/v1/buses/", Header: hdr},
		// GET /routes
		{Method: "GET", URL: baseURL + "/api/v1/routes/", Header: hdr},
		// GET /complaints (requiere rol ADMIN o COMPANY)
		{Method: "GET", URL: baseURL + "/api/v1/complaints/", Header: hdr},
		// GET /users (requiere rol ADMIN)
		{Method: "GET", URL: baseURL + "/api/v1/users/", Header: hdr},
	}
}

// BuildTargets combina targets publicos y (opcionalmente) autenticados.
// Retorna un vegeta.Targeter que rota los targets en round-robin.
func BuildTargets(cfg *Config, token string) vegeta.Targeter {
	targets := BuildPublicTargets(cfg.BaseURL)
	if !cfg.PublicOnly && token != "" {
		targets = append(targets, BuildAuthTargets(cfg.BaseURL, token)...)
	}
	return vegeta.NewStaticTargeter(targets...)
}
