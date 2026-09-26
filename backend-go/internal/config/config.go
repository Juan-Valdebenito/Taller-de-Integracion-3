package config

import (
	"log"
	"os"
	"time"

	"github.com/joho/godotenv"
)

// Config contiene todas las variables de entorno de la aplicación.
type Config struct {
	Port              string
	DatabaseURL       string
	JWTSecret         string
	JWTExpires        string
	CORSOrigin        string
	Env               string
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

	timeout := getEnv("GRPC_TIMEOUT", "5s")
	grpcTimeout, err := time.ParseDuration(timeout)
	if err != nil || grpcTimeout <= 0 {
		grpcTimeout = 5 * time.Second
	}
	return &Config{
		Port:              getEnv("PORT", "3001"),
		DatabaseURL:       getEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/transporte_db"),
		JWTSecret:         getEnv("JWT_SECRET", "dev_secret_cambiarlo_en_produccion_123"),
		JWTExpires:        getEnv("JWT_EXPIRES_IN", "7d"),
		CORSOrigin:        getEnv("CORS_ORIGIN", "http://localhost:5173"),
		Env:               getEnv("NODE_ENV", "development"),
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
