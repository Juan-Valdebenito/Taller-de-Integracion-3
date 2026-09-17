# Como funcionará la parte del clima de la API

Por ahora se tiene un solo endpoint, el que usará el simulador para enviar la información al backend

## Endpoint

**Método**: POST
**Ruta**: /api/v1/telemetry/weather
**Headers**:
    - Content-Type: application/json
    - X-API-Key: <token_de_estacion_autorizada>
**Código de respuesta esperado**: 202 Accepted (procesamiento asíncrono para no bloquear al simulador)


Se admitirá el envío de tanto un objeto como de una lista de estos (batch), siguiendo este formato:
```
[
  {
    "station_id": "STATION-PADRE-LAS-CASAS-01",
    "location": {
      "latitude": -38.7523,
      "longitude": -72.5981,
      "sector": "Padre Las Casas"
    },
    "readings": {
      "temperature_c": 7.5,
      "humidity_pct": 91.2,
      "wind_speed_kmh": 12.4,
      "pm25_ug_m3": 85.3,   <-- quizas
      "pm10_ug_m3": 120.1   <-- quizas
    },
    "status": "OPERATIONAL",
    "timestamp": 1724628000
  }
]
```

## Almacenamiento de datos históricos

Los datos se guardarán en una base de datos TimescaleDB con los siguientes atributos:
    time TIMESTAMPTZ NOT NULL,
    station_id VARCHAR(64) NOT NULL,
    sector VARCHAR(64),
    temperature_c REAL,
    humidity_pct REAL,
    wind_speed_kmh REAL,
    pm25 REAL,
    pm10 REAL,
    location GEOMETRY(Point, 4326)

## Envió de datos en tiempo real

Al recibir datos meteorológicos, el servicio de clima los guarda y además los publica en el bus de datos para que puedan
ser considerados por el motor de predicción.