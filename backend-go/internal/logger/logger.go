package logger

import (
	"os"
	"strings"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// Configure inicializa el logger global con campos comunes del servicio.
func Configure() {
	environment := os.Getenv("NODE_ENV")
	if environment == "" {
		environment = "development"
	}

	zerolog.TimeFieldFormat = zerolog.TimeFormatUnixMs
	zerolog.SetGlobalLevel(parseLevel(os.Getenv("LOG_LEVEL")))

	logger := zerolog.New(os.Stdout).With().
		Timestamp().
		Str("service", "transithub-api").
		Str("environment", environment).
		Logger()

	if strings.EqualFold(os.Getenv("LOG_FORMAT"), "console") {
		logger = zerolog.New(zerolog.ConsoleWriter{
			Out:        os.Stdout,
			TimeFormat: "2006-01-02 15:04:05.000",
		}).With().
			Timestamp().
			Str("service", "transithub-api").
			Str("environment", environment).
			Logger()
	}

	log.Logger = logger
}

func parseLevel(value string) zerolog.Level {
	switch strings.ToLower(value) {
	case "trace":
		return zerolog.TraceLevel
	case "debug":
		return zerolog.DebugLevel
	case "warn", "warning":
		return zerolog.WarnLevel
	case "error":
		return zerolog.ErrorLevel
	case "fatal":
		return zerolog.FatalLevel
	case "panic":
		return zerolog.PanicLevel
	default:
		return zerolog.InfoLevel
	}
}
