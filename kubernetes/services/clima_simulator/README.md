# Simulador climático

El simulador obtiene temperatura, humedad y viento de Open-Meteo Forecast API, y PM2.5/PM10 de Open-Meteo Air Quality API. Los valores son estimaciones de modelos para las coordenadas configuradas; no son mediciones de sensores físicos.

Las consultas externas se realizan cada 15 minutos por estación y endpoint. La telemetría al clima-service mantiene el intervalo definido en `config.json` y reutiliza la última lectura completa. Si no hay datos iniciales o la caché supera una hora, no se envía telemetría para esa estación hasta recuperar datos válidos.

## Configuración

| Variable | Predeterminado | Descripción |
| --- | --- | --- |
| `OPEN_METEO_WEATHER_URL` | `https://api.open-meteo.com/v1/forecast` | Endpoint de pronóstico meteorológico |
| `OPEN_METEO_AIR_QUALITY_URL` | `https://air-quality-api.open-meteo.com/v1/air-quality` | Endpoint de calidad del aire |
| `OPEN_METEO_REFRESH_INTERVAL_SECONDS` | `900` | Frecuencia de consulta externa |
| `OPEN_METEO_MAX_STALENESS_SECONDS` | `3600` | Antigüedad máxima para publicar datos cacheados |

El nivel gratuito de Open-Meteo es para uso no comercial y publica límites de 10.000 llamadas diarias y 300.000 mensuales. Con cuatro estaciones consultadas cada 15 minutos y dos endpoints por estación, el simulador realiza como máximo 768 llamadas al día, sin contar con descuentos por solicitudes multicoordenadas. Revisa [precios y condiciones](https://open-meteo.com/en/pricing) antes de usarlo fuera de desarrollo o estudio no comercial.

## Atribución de datos

Datos meteorológicos: [Open-Meteo](https://open-meteo.com/), licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Datos de calidad del aire: [CAMS Global Atmospheric Composition Forecasts](https://open-meteo.com/en/docs/air-quality-api), Copernicus Atmosphere Monitoring Service (CAMS), consultados mediante Open-Meteo. Los datos CAMS requieren atribución a CAMS y referencia a Open-Meteo.