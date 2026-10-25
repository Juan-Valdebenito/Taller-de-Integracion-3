package config

import (
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/rs/zerolog/log"
)

// Config contiene todas las variables de entorno de la aplicación.
type Config struct {
	Port        string
	DatabaseURL string
	JWTSecret   string
	// CORSOrigins: orígenes permitidos (CORS_ORIGIN, separados por coma), ej.
	// la web en :5173 y la vista previa web de la app móvil (Expo) en :8081.
	CORSOrigins []string
	Env         string

	// AttachmentsDir es la carpeta donde se guardan las imágenes de los reclamos
	// (ATTACHMENTS_DIR). En el cluster, un volumen persistente montado ahí.
	AttachmentsDir string

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

	// ── Simulación GPS ────────────────────────────────────────────────────────
	// SimulationEnabled activa el motor de simulación circular de buses.
	// En producción (con datos reales del cluster) dejar en false.
	SimulationEnabled bool

	// SimulationTickMs es el intervalo en milisegundos entre actualizaciones
	// de posición de cada bus simulado.
	SimulationTickMs int

	// SimulationSpeedMultiplier acelera el reloj del recorrido para que el
	// movimiento sea visible en desarrollo sin alterar los tiempos base.
	SimulationSpeedMultiplier float64

	// ── Revocación de tokens (RevocationStore) ─────────────────────────────
	// RedisAddr es la ruta host:port del Redis compartido del cluster
	// (ej. "redis-svc.student-jvaldebenito.svc.cluster.local:6379").
	// Vacío por defecto: el backend cae a un almacén en memoria por proceso
	// (válido solo con una réplica). Ver internal/token.NewStore.
	RedisAddr     string
	RedisPassword string
	RedisDB       int

	// ── Rate limiting de autenticación (por IP) ────────────────────────────
	// RateLimitEnabled activa el límite en /auth/*. Desactivar solo en pruebas de carga.
	RateLimitEnabled bool
	// Login y registro: solicitudes por minuto y ráfaga permitidas por IP.
	AuthRateLimitPerMin int
	AuthRateLimitBurst  int
	// Rotación de tokens (refresh, logout, revoke): solicitudes por minuto y ráfaga por IP.
	TokenRateLimitPerMin int
	TokenRateLimitBurst  int
	// Subida de imágenes a reclamos: solicitudes por minuto y ráfaga por IP
	// (también se desactiva con RATE_LIMIT_ENABLED=false).
	UploadRateLimitPerMin int
	UploadRateLimitBurst  int
	// TrustedProxies son las IPs o rangos CIDR de los proxies (ej. el Ingress)
	// de los que se acepta X-Forwarded-For para saber la IP real del cliente.
	// Vacío = comportamiento por defecto de Gin (confía en cualquier proxy).
	TrustedProxies []string

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
		log.Debug().Str("event", "dotenv_missing").Msg("No .env file found; using system environment")
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
		CORSOrigins: corsOrigins(),
		Env:         getEnv("NODE_ENV", "development"),

		AttachmentsDir: attachmentsDir(),

		JWTAccessExpires:  accessDuration,
		JWTRefreshExpires: refreshDuration,

		// Predicción ML
		PredictionTransport:  getEnv("PREDICTION_TRANSPORT", ""),
		PredictionGRPCAddr:   getEnv("PREDICTION_GRPC_ADDR", "localhost:50051"),
		PredictionHTTPURL:    getEnv("PREDICTION_HTTP_URL", "http://localhost:8000"),
		PredictionTimeoutSec: getEnvInt("PREDICTION_TIMEOUT_SEC", 5),

		// Simulación GPS
		SimulationEnabled:         getEnvBool("SIMULATION_ENABLED", false),
		SimulationTickMs:          getEnvInt("SIMULATION_TICK_MS", 2000),
		SimulationSpeedMultiplier: getEnvFloat("SIMULATION_SPEED_MULTIPLIER", 1),

		// Revocación de tokens
		RedisAddr:     getEnv("REDIS_ADDR", ""),
		RedisPassword: getEnv("REDIS_PASSWORD", ""),
		RedisDB:       getEnvInt("REDIS_DB", 0),

		// Rate limiting de autenticación
		RateLimitEnabled:     getEnvBool("RATE_LIMIT_ENABLED", true),
		AuthRateLimitPerMin:  getEnvInt("RATE_LIMIT_AUTH_PER_MIN", 10),
		AuthRateLimitBurst:   getEnvInt("RATE_LIMIT_AUTH_BURST", 5),
		TokenRateLimitPerMin: getEnvInt("RATE_LIMIT_TOKEN_PER_MIN", 30),
		TokenRateLimitBurst:  getEnvInt("RATE_LIMIT_TOKEN_BURST", 10),
		TrustedProxies:       getEnvList("TRUSTED_PROXIES"),

		UploadRateLimitPerMin: getEnvInt("RATE_LIMIT_UPLOAD_PER_MIN", 10),
		UploadRateLimitBurst:  getEnvInt("RATE_LIMIT_UPLOAD_BURST", 3),

		// Proxies gRPC
		ClimateGRPCTarget: getEnv("CLIMATE_GRPC_TARGET", "localhost:9090"),
		ClimateAPIKey:     getEnv("CLIMATE_API_KEY", "temuco_weather_secret_key"),
		MicroGRPCTarget:   getEnv("MICRO_GRPC_TARGET", "localhost:9091"),
		MicroAPIKey:       getEnv("MICRO_API_KEY", ""),
		GRPCTimeout:       grpcTimeout,
	}
}

// DefaultAttachmentsDir: carpeta de imágenes si no se define ATTACHMENTS_DIR
// (relativa a donde se ejecuta el backend; está excluida de Git).
const DefaultAttachmentsDir = "./data/attachments"

// attachmentsDir lee ATTACHMENTS_DIR; vacío o solo espacios usa el valor por defecto.
func attachmentsDir() string {
	if dir := strings.TrimSpace(os.Getenv("ATTACHMENTS_DIR")); dir != "" {
		return dir
	}
	return DefaultAttachmentsDir
}

// corsOrigins lee CORS_ORIGIN (uno o varios orígenes separados por coma).
func corsOrigins() []string {
	if origins := getEnvList("CORS_ORIGIN"); len(origins) > 0 {
		return origins
	}
	return []string{"http://localhost:5173"}
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

func getEnvFloat(key string, fallback float64) float64 {
	if val := os.Getenv(key); val != "" {
		if n, err := strconv.ParseFloat(val, 64); err == nil {
			return n
		}
	}
	return fallback
}

// getEnvList lee una lista separada por comas, ignorando espacios y elementos vacíos.
func getEnvList(key string) []string {
	var items []string
	for _, item := range strings.Split(os.Getenv(key), ",") {
		if item = strings.TrimSpace(item); item != "" {
			items = append(items, item)
		}
	}
	return items
}

func getEnvBool(key string, fallback bool) bool {
	if val := os.Getenv(key); val != "" {
		return val == "true" || val == "1" || val == "yes"
	}
	return fallback
}
