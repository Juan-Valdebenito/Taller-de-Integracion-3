package config

import (
	"log"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

// Config contiene todas las variables de entorno de la aplicación.
type Config struct {
	Port        string
	DatabaseURL string
	JWTSecret   string
	CORSOrigin  string
	Env         string

	// ── Duración de los JWT ────────────────────────────────────────────────
	// El access token se usa en cada llamada a la API (vida corta); el refresh
	// token solo sirve para pedir un par nuevo en POST /api/v1/auth/refresh.
	JWTAccessExpires  time.Duration
	JWTRefreshExpires time.Duration

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

	// ── Revocación de tokens (RevocationStore) ─────────────────────────────
	// RedisAddr es la ruta host:port del Redis compartido del cluster
	// (ej. "redis-svc.student-jvaldebenito.svc.cluster.local:6379").
	// Vacío por defecto: mientras el equipo de cluster no aprovisione el
	// servicio de Redis, el backend cae a un almacén en memoria por proceso
	// (válido solo con una réplica). Ver internal/token.NewStore.
	RedisAddr     string
	RedisPassword string
	RedisDB       int

	// ── Proxies gRPC (microservicios clima / micro) ────────────────────────
	ClimateGRPCTarget string
	ClimateAPIKey     string
	MicroGRPCTarget   string
	MicroAPIKey       string
	GRPCTimeout       time.Duration
}

// Load carga las variables desde el archivo .env y el entorno del sistema.
func Load() *Config {
	// Intentar cargar .env (no falla si no existe en producción)
	if err := godotenv.Load(); err != nil {
		log.Println("⚠️  No se encontró archivo .env, usando variables de entorno del sistema")
	}

	accessExpires := getEnv("JWT_ACCESS_EXPIRES_IN", "15m")
	refreshExpires := getEnv("JWT_REFRESH_EXPIRES_IN", "168h")

	accessDuration, err := time.ParseDuration(accessExpires)
	if err != nil {
		accessDuration = 15 * time.Minute
	}

	refreshDuration, err := time.ParseDuration(refreshExpires)
	if err != nil {
		refreshDuration = 7 * 24 * time.Hour
	}

	timeout := getEnv("GRPC_TIMEOUT", "5s")
	grpcTimeout, err := time.ParseDuration(timeout)
	if err != nil || grpcTimeout <= 0 {
		grpcTimeout = 5 * time.Second
	}
	return &Config{
		Port:        getEnv("PORT", "3001"),
		DatabaseURL: getEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/transporte_db"),
		JWTSecret:   getEnv("JWT_SECRET", "dev_secret_cambiarlo_en_produccion_123"),
		CORSOrigin:  getEnv("CORS_ORIGIN", "http://localhost:5173"),
		Env:         getEnv("NODE_ENV", "development"),

		JWTAccessExpires:  accessDuration,
		JWTRefreshExpires: refreshDuration,

		// Predicción ML
		PredictionTransport:  getEnv("PREDICTION_TRANSPORT", ""),
		PredictionGRPCAddr:   getEnv("PREDICTION_GRPC_ADDR", "localhost:50051"),
		PredictionHTTPURL:    getEnv("PREDICTION_HTTP_URL", "http://localhost:8000"),
		PredictionTimeoutSec: getEnvInt("PREDICTION_TIMEOUT_SEC", 5),

		// Revocación de tokens
		RedisAddr:     getEnv("REDIS_ADDR", ""),
		RedisPassword: getEnv("REDIS_PASSWORD", ""),
		RedisDB:       getEnvInt("REDIS_DB", 0),

		// Proxies gRPC
		ClimateGRPCTarget: getEnv("CLIMATE_GRPC_TARGET", "localhost:9090"),
		ClimateAPIKey:     getEnv("CLIMATE_API_KEY", "temuco_weather_secret_key"),
		MicroGRPCTarget:   getEnv("MICRO_GRPC_TARGET", "localhost:9091"),
		MicroAPIKey:       getEnv("MICRO_API_KEY", ""),
		GRPCTimeout:       grpcTimeout,
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
