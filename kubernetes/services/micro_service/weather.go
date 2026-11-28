package main

// Clima en el costo. Caminar con frío, calor, viento fuerte, lluvia o mala
// calidad del aire se percibe más pesado, así que el tiempo a pie se multiplica
// por un factor.

import (
	"errors"
	"fmt"
	"math"
	"os"
	"strconv"
)

// Umbrales del clima. Son un supuesto ajustable. Para el aire se usa como
// referencia la norma chilena de PM2.5: 50 µg/m³ como norma diaria y 80 como alerta.
const (
	coldTemperatureC         = 5.0
	freezingTemperatureC     = 0.0
	hotTemperatureC          = 30.0
	strongWindKmh            = 30.0
	veryStrongWindKmh        = 50.0
	poorAirPM25              = 50.0
	alertAirPM25             = 80.0
	maxPrecipitationMM       = 1000.0
	moderateWeatherSurcharge = 0.2
	severeWeatherSurcharge   = 0.4
	maxWalkWeatherFactor     = 2.0
)

var errInvalidPrecipitationThresholds = errors.New("precipitation thresholds must be finite, non-negative, ordered, and at most 1000 mm")

type PrecipitationThresholds struct {
	ModerateMM float64
	SevereMM   float64
}

var configuredPrecipitationThresholds = PrecipitationThresholds{ModerateMM: 2.5, SevereMM: 7.6}

func loadPrecipitationThresholdsFromEnv() (PrecipitationThresholds, error) {
	thresholds := configuredPrecipitationThresholds
	values := []struct {
		name string
		dst  *float64
	}{
		{"PRECIPITATION_MODERATE_MM", &thresholds.ModerateMM},
		{"PRECIPITATION_SEVERE_MM", &thresholds.SevereMM},
	}
	for _, value := range values {
		raw := os.Getenv(value.name)
		if raw == "" {
			continue
		}
		parsed, err := strconv.ParseFloat(raw, 64)
		if err != nil {
			return PrecipitationThresholds{}, fmt.Errorf("%s must be numeric: %w", value.name, err)
		}
		*value.dst = parsed
	}
	if err := thresholds.validate(); err != nil {
		return PrecipitationThresholds{}, err
	}
	return thresholds, nil
}

func (thresholds PrecipitationThresholds) validate() error {
	if math.IsNaN(thresholds.ModerateMM) || math.IsInf(thresholds.ModerateMM, 0) ||
		math.IsNaN(thresholds.SevereMM) || math.IsInf(thresholds.SevereMM, 0) ||
		thresholds.ModerateMM < 0 || thresholds.SevereMM <= thresholds.ModerateMM || thresholds.SevereMM > maxPrecipitationMM {
		return errInvalidPrecipitationThresholds
	}
	return nil
}

// WeatherConditions es el clima del momento de la consulta.
type WeatherConditions struct {
	TemperatureC    float64
	WindSpeedKmh    float64
	PrecipitationMM float64
	PM25            float64
}

// walkWeatherFactor convierte el clima en el multiplicador de la caminata. Sin
// clima (nil) no penaliza. Cada condición suma un recargo, y el total tiene un
// máximo para que una suma de condiciones no vuelva absurda la caminata.
func walkWeatherFactor(conditions *WeatherConditions) float64 {
	if conditions == nil {
		return 1
	}
	surcharge := temperatureSurcharge(conditions.TemperatureC) +
		thresholdSurcharge(conditions.WindSpeedKmh, strongWindKmh, veryStrongWindKmh) +
		thresholdSurcharge(conditions.PM25, poorAirPM25, alertAirPM25) +
		thresholdSurcharge(conditions.PrecipitationMM, configuredPrecipitationThresholds.ModerateMM, configuredPrecipitationThresholds.SevereMM)
	return math.Min(1+surcharge, maxWalkWeatherFactor)
}

// temperatureSurcharge penaliza el frío y el calor. Un valor imposible, como NaN,
// no penaliza: las comparaciones con NaN siempre son falsas.
func temperatureSurcharge(temperatureC float64) float64 {
	switch {
	case temperatureC < freezingTemperatureC:
		return severeWeatherSurcharge
	case temperatureC < coldTemperatureC:
		return moderateWeatherSurcharge
	case temperatureC > hotTemperatureC:
		return moderateWeatherSurcharge
	default:
		return 0
	}
}

// thresholdSurcharge penaliza un valor que supera un umbral moderado o uno severo.
func thresholdSurcharge(value, moderateThreshold, severeThreshold float64) float64 {
	switch {
	case value > severeThreshold:
		return severeWeatherSurcharge
	case value > moderateThreshold:
		return moderateWeatherSurcharge
	default:
		return 0
	}
}
