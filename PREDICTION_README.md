# Predicción de Ocupación — API Reference

Documentación del endpoint de predicción simulada de nivel de ocupación de micros.

> **Nota:** Actualmente este endpoint usa **lógica simulada** (heurísticas de hora punta y día de semana). Cuando se conecte al clúster ML real, el comportamiento externo del endpoint permanece idéntico — solo cambia el motor interno.

---

## Tabla de Contenidos

- [Endpoint](#-endpoint)
- [Body de la solicitud](#-body-de-la-solicitud)
- [Respuesta exitosa](#-respuesta-exitosa)
- [Errores de validación](#-errores-de-validación)
- [Niveles de ocupación](#-niveles-de-ocupación)
- [Lógica de simulación](#-lógica-de-simulación)
- [Ejemplos de uso](#-ejemplos-de-uso)
- [Tests](#-tests)
- [Migración al clúster ML](#-migración-al-clúster-ml)

---

## 🔗 Endpoint

```
POST /api/v1/prediction/occupancy
Content-Type: application/json
```

---

## 📥 Body de la solicitud

| Campo               | Tipo     | Requerido | Descripción                                           |
| ------------------- | -------- | :-------: | ----------------------------------------------------- |
| `currentPassengers` | `number` |    ✅     | Cantidad actual de pasajeros en el bus (≥ 0)          |
| `capacity`          | `number` |    ✅     | Capacidad máxima del bus (> 0)                        |
| `routeId`           | `string` |    ❌     | ID de la ruta (reservado para el modelo ML)           |
| `hour`              | `number` |    ❌     | Hora del día en formato 0–23 (default: hora actual)   |
| `dayOfWeek`         | `number` |    ❌     | Día de la semana: 0=Dom, 1=Lun … 6=Sáb (default: hoy) |

### Ejemplo mínimo

```json
{
  "currentPassengers": 25,
  "capacity": 45
}
```

### Ejemplo completo

```json
{
  "currentPassengers": 25,
  "capacity": 45,
  "routeId": "ruta-temuco-001",
  "hour": 8,
  "dayOfWeek": 1
}
```

---

## 📤 Respuesta exitosa

**HTTP 200 OK**

```json
{
  "success": true,
  "data": {
    "predictedOccupancyRatio": 0.736,
    "predictedPassengers": 33,
    "occupancyLevel": "HIGH",
    "occupancyText": "🔴 Muy ocupado",
    "occupancyColor": "#ef4444",
    "confidence": 0.75,
    "isSimulated": true,
    "predictedAt": "2026-08-29T12:00:00.000Z"
  }
}
```

### Descripción de los campos de respuesta

| Campo                     | Tipo      | Descripción                                                 |
| ------------------------- | --------- | ----------------------------------------------------------- |
| `predictedOccupancyRatio` | `number`  | Proporción proyectada de ocupación (0.0 a 1.0, 3 decimales) |
| `predictedPassengers`     | `number`  | Número entero de pasajeros proyectados                      |
| `occupancyLevel`          | `string`  | Nivel: `LOW` / `MEDIUM` / `HIGH` / `FULL`                   |
| `occupancyText`           | `string`  | Texto descriptivo con emoji para mostrar en la UI           |
| `occupancyColor`          | `string`  | Color hex para el frontend (`#22c55e`, `#f59e0b`, etc.)     |
| `confidence`              | `number`  | Confianza de la predicción (0.0 a 1.0). Simulado: `0.75`    |
| `isSimulated`             | `boolean` | `true` mientras no hay modelo ML real conectado             |
| `predictedAt`             | `string`  | Timestamp ISO 8601 del momento de la predicción             |

---

## ❌ Errores de validación

**HTTP 400 Bad Request**

```json
{
  "success": false,
  "error": "El campo \"currentPassengers\" es requerido."
}
```

| Situación                              | Mensaje de error                                                 |
| -------------------------------------- | ---------------------------------------------------------------- |
| Falta `currentPassengers`              | `El campo "currentPassengers" es requerido.`                     |
| Falta `capacity`                       | `El campo "capacity" es requerido.`                              |
| `currentPassengers` no es número o < 0 | `"currentPassengers" debe ser un número mayor o igual a 0.`      |
| `capacity` no es número o ≤ 0          | `"capacity" debe ser un número mayor a 0.`                       |
| `currentPassengers` > `capacity`       | `"currentPassengers" no puede ser mayor que "capacity".`         |
| `hour` fuera del rango 0–23            | `"hour" debe ser un número entre 0 y 23.`                        |
| `dayOfWeek` fuera del rango 0–6        | `"dayOfWeek" debe ser un número entre 0 (domingo) y 6 (sábado).` |

---

## 🚦 Niveles de ocupación

| Nivel    | Ratio     | Emoji | Texto       | Color     |
| -------- | --------- | ----- | ----------- | --------- |
| `LOW`    | < 40%     | 🟢    | Disponible  | `#22c55e` |
| `MEDIUM` | 40% – 69% | 🟡    | Moderado    | `#f59e0b` |
| `HIGH`   | 70% – 89% | 🔴    | Muy ocupado | `#ef4444` |
| `FULL`   | ≥ 90%     | ⛔    | Lleno       | `#7f1d1d` |

---

## 🧠 Lógica de simulación

La predicción se calcula así:

```
ratio_actual     = currentPassengers / capacity
multiplicador    = multiplicador_hora × multiplicador_día
variación        = ruido aleatorio ±10%
ratio_predicho   = min(1.0, ratio_actual × multiplicador × variación)
```

### Multiplicadores por hora punta

| Franja horaria           | Multiplicador |
| ------------------------ | :-----------: |
| 07:00 – 08:59 (mañana)   |    × 1.30     |
| 12:00 – 13:59 (mediodía) |    × 1.15     |
| 17:00 – 18:59 (tarde)    |    × 1.35     |
| Resto del día            |    × 1.00     |

### Multiplicadores por día de la semana

| Día       | Multiplicador |
| --------- | :-----------: |
| Lunes     |    × 1.00     |
| Martes    |    × 1.00     |
| Miércoles |    × 0.95     |
| Jueves    |    × 1.00     |
| Viernes   |    × 0.90     |
| Sábado    |    × 0.60     |
| Domingo   |    × 0.65     |

---

## 💻 Ejemplos de uso

### cURL

```bash
# Caso básico (usa hora y día del sistema)
curl -X POST http://localhost:3001/api/v1/prediction/occupancy \
  -H "Content-Type: application/json" \
  -d '{"currentPassengers": 25, "capacity": 45}'

# Hora punta matinal — lunes 8am
curl -X POST http://localhost:3001/api/v1/prediction/occupancy \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassengers": 20,
    "capacity": 45,
    "hour": 8,
    "dayOfWeek": 1
  }'

# Domingo tranquilo — tarde
curl -X POST http://localhost:3001/api/v1/prediction/occupancy \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassengers": 10,
    "capacity": 45,
    "hour": 15,
    "dayOfWeek": 0
  }'
```

### JavaScript / Fetch

```javascript
const response = await fetch(
  "http://localhost:3001/api/v1/prediction/occupancy",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      currentPassengers: 25,
      capacity: 45,
      hour: 8,
      dayOfWeek: 1,
    }),
  },
);

const { success, data } = await response.json();

if (success) {
  console.log(`Nivel: ${data.occupancyText}`); // 🔴 Muy ocupado
  console.log(`Ratio: ${data.predictedOccupancyRatio}`); // 0.736
  console.log(`Color: ${data.occupancyColor}`); // #ef4444
  console.log(`Simulado: ${data.isSimulated}`); // true
}
```

### Python / requests

```python
import requests

response = requests.post(
    "http://localhost:3001/api/v1/prediction/occupancy",
    json={
        "currentPassengers": 25,
        "capacity": 45,
        "hour": 8,
        "dayOfWeek": 1,
    }
)

data = response.json()["data"]
print(f"Nivel: {data['occupancyText']}")            # 🔴 Muy ocupado
print(f"Pasajeros predichos: {data['predictedPassengers']}")
print(f"Confianza: {data['confidence']}")
```

### Postman

1. Método: **POST**
2. URL: `http://localhost:3001/api/v1/prediction/occupancy`
3. Headers: `Content-Type: application/json`
4. Body → raw → JSON:

```json
{
  "currentPassengers": 25,
  "capacity": 45,
  "hour": 8,
  "dayOfWeek": 1
}
```

---

## 🧪 Tests

El servicio tiene cobertura **100%** con Jest. Para ejecutar:

```bash
# Desde la carpeta backend/
cd backend

# Ejecutar todos los tests
npm test

# Solo los tests de predicción
npm test -- OccupancyPredictionService

# Ver cobertura de código
npm run test:coverage
```

### Resultado esperado

```
PASS src/domain/services/__tests__/OccupancyPredictionService.test.ts
  OccupancyPredictionService
    getOccupancyLevel()       ✓ 4 tests
    getOccupancyText()        ✓ 4 tests
    getOccupancyColor()       ✓ 4 tests
    getPeakHourMultiplier()   ✓ 7 tests
    predict() — estructura    ✓ 7 tests
    predict() bus vacío       ✓ 1 test
    predict() bus lleno       ✓ 2 tests
    predict() hora punta      ✓ 1 test
    predict() fin de semana   ✓ 1 test
    predict() defaults        ✓ 1 test

Coverage: Stmts 100% | Branch 100% | Funcs 100% | Lines 100%
```

---

## 🔮 Migración al clúster ML

Cuando estén disponibles las credenciales del clúster, **solo se modifica un método**:

**Archivo:** `src/domain/services/OccupancyPredictionService.ts`

```typescript
// ANTES (simulado) ─────────────────────────────────────────────────
static predict(input: PredictionInput): PredictionResult {
  // ... lógica heurística con multiplicadores ...
  return { ..., isSimulated: true };
}

// DESPUÉS (modelo ML real) ──────────────────────────────────────────
static async predict(input: PredictionInput): Promise<PredictionResult> {
  const response = await fetch(process.env.ML_CLUSTER_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const prediction = await response.json();
  return { ...prediction, isSimulated: false };
}
```

> ✅ El endpoint `POST /api/v1/prediction/occupancy` **no cambia**.  
> ✅ Los tests de los métodos auxiliares (`getOccupancyLevel`, `getOccupancyText`, etc.) **no cambian**.  
> ✅ El frontend **no necesita actualizarse**.

---

## 📁 Archivos relacionados

| Archivo                                                                                                          | Descripción                       |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| [`OccupancyPredictionService.ts`](./OccupancyPredictionService.ts)                                               | Lógica del servicio de predicción |
| [`__tests__/OccupancyPredictionService.test.ts`](./__tests__/OccupancyPredictionService.test.ts)                 | Suite de pruebas Jest             |
| [`../../infrastructure/http/routes/prediction.routes.ts`](../../infrastructure/http/routes/prediction.routes.ts) | Endpoint REST con validaciones    |
