# Modelo de ocupación

Predice qué tan llena irá una línea **dentro de 15 minutos**, más o menos cuando el
pasajero llega al paradero. backend-go lo usa en las rutas recomendadas: una micro
que hoy va a la mitad, pero que se llenará en hora punta, pesa como llena.

## Cómo funciona

Es una **regresión lineal con regularización (ridge)** entrenada con mínimos
cuadrados. Usa solo la biblioteca estándar de Python, así la imagen no instala nada.

| Variable | Para qué |
|---|---|
| Ocupación actual | Una micro llena ahora sigue llena después |
| Hora del día (una variable por hora) | Aprende las horas punta sin que se las digan |
| Fin de semana, y fin de semana por bloque de 4 horas | Viaja menos gente, con otro horario |
| Línea (`L1C`, `L7A`, `L7B`) | Cada línea tiene su demanda. Una línea desconocida usa la de todas |

## Datos de entrenamiento

**Todavía no hay historial real.** `micro_telemetry` guarda los pasajeros, pero no
se pueden consultar. Por eso `train.py` entrena con 6000 viajes **simulados**, con los
supuestos del equipo: horas punta a las 7:45, 13:00 y 18:15, y 40 % menos pasajeros
el fin de semana. Con historial real, solo cambia `generate_trips`.

El error se mide con otros 2000 viajes que el modelo no vio:

| Método | Error medio |
|---|---|
| Suponer que la ocupación no cambia | 0,069 (6,9 puntos) |
| Este modelo | **0,040 (4,0 puntos)** |

Como los datos son simulados, este error solo dice que el modelo aprende el patrón,
no cuánto acierta con pasajeros reales.

## API

`POST /predict`, con los nombres que usa `backend-go/internal/transport/http_client.go`:

```json
{"route_id": "L7B", "current_passengers": 20, "capacity": 40, "hour": 18, "day_of_week": 2}
```

```json
{"predicted_ratio": 0.64, "predicted_passengers": 26, "occupancy_level": "MEDIUM",
 "confidence": 0.919, "predictor_name": "ridge-occupancy-v1", "predicted_at": "2026-11-30T21:00:00Z"}
```

| Regla | Valor |
|---|---|
| Capacidad | De 1 a 500 |
| Pasajeros | De 0 al doble de la capacidad |
| Hora y día | 0 a 23, y 0 (domingo) a 6 (sábado) |
| Cuerpo | Hasta 4096 bytes |
| Predicción | Entre 0 y 1,5 |
| Confianza | 1 − 2 × error medio |

Un dato inválido responde 400 con `{"error": "..."}`. `GET /health` responde 200.

## Uso

```bash
python train.py              # vuelve a entrenar y reescribe model.json
python -m unittest -v        # pruebas del modelo y de la API
python server.py             # escucha en el puerto 8000 (PORT)
```

`model.json` está en el repositorio, y una prueba comprueba que `train.py` lo
reproduce exactamente. La imagen no se construye si una prueba falla.

## Despliegue

Va en el stack `foundation`, junto a backend-go:

```bash
bash kubernetes/deploy.sh foundation build    # construye y publica prediction-service
bash kubernetes/deploy.sh foundation apply
```

backend-go lo llama en `http://prediction-svc:8000`, con 2 segundos de espera. Si no
responde, usa la ocupación actual. `network_policies/prediction-network-policy.yaml`
solo deja entrar a backend-go; `deploy.sh` no aplica las NetworkPolicies.
