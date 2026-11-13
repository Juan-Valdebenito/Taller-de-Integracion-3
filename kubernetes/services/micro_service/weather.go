package main

// Clima en el costo. Caminar con frío, calor, viento fuerte o mala calidad del
// aire se percibe más pesado, así que el tiempo a pie se multiplica por un factor.
// clima_service no informa lluvia, por eso no se considera: inferirla de la
// humedad sería inventar el dato.

import "math"

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
	moderateWeatherSurcharge = 0.2
	severeWeatherSurcharge   = 0.4
	maxWalkWeatherFactor     = 2.0
)

// WeatherConditions es el clima del momento de la consulta.
type WeatherConditions struct {
	TemperatureC float64
	WindSpeedKmh float64
	PM25         float64
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
		thresholdSurcharge(conditions.PM25, poorAirPM25, alertAirPM25)
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
