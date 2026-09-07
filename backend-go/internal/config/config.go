package config

import (
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

// Config contiene todas las variables de entorno de la aplicación.
type Config struct {
	Port        string
	DatabaseURL string
	JWTSecret   string
	JWTExpires  string
	CORSOrigin  string
	Env         string

	// ── Predicción ML (microservicio externo) ─────────────────────────────────
	// PredictionTransport es el protocolo de comunicación: "grpc" | "http".
	// Si está vacío, el servidor ML no se conecta y se usa el predictor heurístico.
	PredictionTransport string

	// PredictionGRPCAddr es la dirección del servidor gRPC (ej: "localhost:50051").
	PredictionGRPCAddr string

	// PredictionHTTPURL es la URL base del servidor HTTP (ej: "http://localhost:8000").
	PredictionHTTPURL string

	// PredictionTimeoutSec es el timeout en segundos para cada llamada al ML.
	PredictionTimeoutSec int
}

// Load carga las variables desde el archivo .env y el entorno del sistema.
func Load() *Config {
	// Intentar cargar .env (no falla si no existe en producción)
	if err := godotenv.Load(); err != nil {
		log.Println("⚠️  No se encontró archivo .env, usando variables de entorno del sistema")
	}

	return &Config{
		Port:        getEnv("PORT", "3001"),
		DatabaseURL: getEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/transporte_db"),
		JWTSecret:   getEnv("JWT_SECRET", "dev_secret_cambiarlo_en_produccion_123"),
		JWTExpires:  getEnv("JWT_EXPIRES_IN", "7d"),
		CORSOrigin:  getEnv("CORS_ORIGIN", "http://localhost:5173"),
		Env:         getEnv("NODE_ENV", "development"),

		// Predicción ML
		PredictionTransport:  getEnv("PREDICTION_TRANSPORT", ""),
		PredictionGRPCAddr:   getEnv("PREDICTION_GRPC_ADDR", "localhost:50051"),
		PredictionHTTPURL:    getEnv("PREDICTION_HTTP_URL", "http://localhost:8000"),
		PredictionTimeoutSec: getEnvInt("PREDICTION_TIMEOUT_SEC", 5),
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if val := os.Getenv(key); val != "" {
		if n, err := strconv.Atoi(val); err == nil {
			return n
		}
	}
	return fallback
}
