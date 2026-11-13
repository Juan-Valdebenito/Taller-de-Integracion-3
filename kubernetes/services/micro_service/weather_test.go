package main

import (
	"math"
	"testing"
)

func assertFactor(t *testing.T, label string, conditions *WeatherConditions, expectedFactor float64) {
	t.Helper()
	if factor := walkWeatherFactor(conditions); math.Abs(factor-expectedFactor) > 1e-9 {
		t.Errorf("%s: se esperaba %v y se obtuvo %v", label, expectedFactor, factor)
	}
}

func TestWalkWeatherFactorWithoutWeather(t *testing.T) {
	assertFactor(t, "sin clima", nil, 1)
	assertFactor(t, "día templado", &WeatherConditions{TemperatureC: 15, WindSpeedKmh: 10, PM25: 20}, 1)
}

func TestWalkWeatherFactorByTemperature(t *testing.T) {
	assertFactor(t, "frío", &WeatherConditions{TemperatureC: 3}, 1.2)
	assertFactor(t, "frío intenso", &WeatherConditions{TemperatureC: -2}, 1.4)
	assertFactor(t, "calor", &WeatherConditions{TemperatureC: 32}, 1.2)
	assertFactor(t, "justo en 5 °C", &WeatherConditions{TemperatureC: 5}, 1)
	assertFactor(t, "justo en 30 °C", &WeatherConditions{TemperatureC: 30}, 1)
}

func TestWalkWeatherFactorByWind(t *testing.T) {
	assertFactor(t, "viento", &WeatherConditions{TemperatureC: 15, WindSpeedKmh: 35}, 1.2)
	assertFactor(t, "viento fuerte", &WeatherConditions{TemperatureC: 15, WindSpeedKmh: 60}, 1.4)
}

func TestWalkWeatherFactorByAirQuality(t *testing.T) {
	assertFactor(t, "aire sobre la norma", &WeatherConditions{TemperatureC: 15, PM25: 60}, 1.2)
	assertFactor(t, "aire en alerta", &WeatherConditions{TemperatureC: 15, PM25: 90}, 1.4)
}

func TestWalkWeatherFactorAddsConditions(t *testing.T) {
	// Frío y aire sobre la norma, algo típico de un invierno en Temuco.
	assertFactor(t, "frío y mal aire", &WeatherConditions{TemperatureC: 3, PM25: 60}, 1.4)
}

func TestWalkWeatherFactorHasMaximum(t *testing.T) {
	// 0,4 + 0,4 + 0,4 = 1,2 de recargo, pero el factor no pasa de 2.
	assertFactor(t, "todo extremo", &WeatherConditions{TemperatureC: -5, WindSpeedKmh: 70, PM25: 150}, maxWalkWeatherFactor)
}

func TestWalkWeatherFactorIgnoresImpossibleValues(t *testing.T) {
	assertFactor(t, "valores NaN", &WeatherConditions{TemperatureC: math.NaN(), WindSpeedKmh: math.NaN(), PM25: math.NaN()}, 1)
}

func TestWalkWeatherFactorNeverBelowOne(t *testing.T) {
	for temperatureC := -20.0; temperatureC <= 45; temperatureC += 2.5 {
		for windSpeedKmh := 0.0; windSpeedKmh <= 90; windSpeedKmh += 10 {
			conditions := &WeatherConditions{TemperatureC: temperatureC, WindSpeedKmh: windSpeedKmh, PM25: windSpeedKmh * 2}
			if factor := walkWeatherFactor(conditions); factor < 1 || factor > maxWalkWeatherFactor {
				t.Fatalf("%+v: el factor %v está fuera de [1, %v]", conditions, factor, maxWalkWeatherFactor)
			}
		}
	}
}
