package config

import (
	"log"
	"os"

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
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
