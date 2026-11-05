# Modelo de grafo de transporte

Este documento define la estructura del grafo que usa `micro_service` para
planificar viajes en Temuco. Sirve de base para cargar paraderos, recorridos,
tiempos y transbordos.

## Qué representa el grafo

Es un **grafo dirigido y ponderado**:

- **Nodos:** paraderos.
- **Aristas:** formas de ir de un paradero a otro, en micro o a pie.
- **Peso principal:** tiempo en segundos.

Las aristas tienen dirección porque ir de A a B no implica poder volver por el
mismo tramo. Si existe la vuelta, se registra como otra arista.

```text
PAR-CSF-01 ──── micro L7A-IDA · 300 s · 1200 m ────▶ PAR-DPORT-01
PAR-CSF-01 ──── a pie · 900 s · 1100 m ────────────▶ PAR-DPORT-01
```

Entre dos paraderos puede haber varias aristas. Cada una es una opción distinta
para el planificador.

## Entidades

| Concepto | Tabla | Papel en el grafo | Campos clave |
|---|---|---|---|
| Paradero | `stops` | Nodo | `stop_id`, `stop_name`, `location` |
| Línea | `routes` | Agrupa recorridos | `route_id`, `route_short_name`, `route_long_name`, `color_hex` |
| Recorrido | `trips` | Una dirección de una línea | `trip_id`, `route_id`, `direction`, `route_shape` |
| Conexión en micro | `route_stops` | Arista de viaje | `trip_id`, `from_stop_id`, `to_stop_id`, `stop_sequence`, `base_travel_time_seconds`, `distance_meters` |
| Transbordo a pie | `transfers` | Arista a pie | `from_stop_id`, `to_stop_id`, `walk_time_seconds`, `distance_meters` |

## Reglas de cada elemento

### Paraderos

- `location` usa PostGIS con el sistema WGS 84 (SRID 4326).
- `ST_MakePoint` recibe primero la longitud y después la latitud.
- En Temuco, la latitud y la longitud son negativas.

### Conexiones en micro

- Una arista une dos paraderos consecutivos de un mismo recorrido.
- `stop_sequence` parte en 1 y sube de uno en uno dentro de cada recorrido.
- El `to_stop_id` de una arista es el `from_stop_id` de la siguiente.
- La clave primaria impide repetir el mismo par de paraderos en un recorrido.

### Transbordos a pie

- Son aristas dirigidas: una caminata de ida y vuelta usa dos filas.
- En memoria usan la ruta reservada `WALK`.
- No cuentan como transbordo de micro por sí solos: el cambio se cuenta al subir
  a otra línea.

## Unidades

| Dato | Unidad | Tipo |
|---|---|---|
| Tiempo | Segundos | Entero mayor que 0 |
| Distancia | Metros | Entero mayor que 0 |
| Coordenadas | Grados decimales, 6 decimales | WGS 84 |

## Formato de identificadores

| Elemento | Formato | Ejemplo |
|---|---|---|
| Paradero | `PAR-<ZONA>-<NN>` | `PAR-CSF-01` |
| Línea | `L<CODIGO>` | `L7A` |
| Recorrido de ida | `L<CODIGO>-IDA` | `L7A-IDA` |
| Recorrido de vuelta | `L<CODIGO>-VTA` | `L7A-VTA` |

`WALK` queda reservado y no se puede usar como línea.

El formato `PAR-001` de `generator/generator.go` no es oficial: depende del orden
del archivo y puede cambiar si este se regenera.

### Equivalencia de líneas entre servicios

Cada servicio nombra las líneas a su manera. El **código de línea** (`7A`) es el
dato común para relacionarlas.

| Código | `micro_service` | Simulación de backend-go | Seed de backend-go |
|---|---|---|---|
| `7A` | `L7A` | `route-7A` | `route-7a` |
| `7B` | `L7B` | `route-7B` | `route-7b` |
| `1C` | `L1C` | `route-1C` | `route-1c` |

No se renombran los IDs existentes, porque otros servicios y datos dependen de
ellos.

## Fuente oficial del esquema

El esquema oficial es
`kubernetes/services/micro_db/micros-db-init-scripts.yaml`, porque es el que usa
la base desplegada.

`init-scripts/01_schema.sql` debe mantenerse igual a ese esquema.
`init-scripts/02_seed.sql` contiene datos de prueba antiguos y no es fuente de
datos.

## Representación en memoria

`TransitGraph`, en `main.go`, usa una lista de adyacencia:

```go
type TransitGraph struct {
	Stops map[string]Stop   // stop_id → paradero
	Edges map[string][]Edge // stop_id de origen → aristas que salen de él
}
```

Con esta estructura, Dijkstra obtiene directamente las aristas que salen de cada
paradero. Las preferencias disponibles son:

- `fastest`: menor tiempo total.
- `min_transfers`: menos cambios de línea y, en caso de empate, menor tiempo.

## Selección de paraderos

La fuente es `generator/paraderos.geojson`, exportado de OpenStreetMap. Tiene 400
puntos, todos con un `@id` único y estable.

### Catálogo y red

Se separan dos conjuntos:

- **Catálogo:** todos los paraderos válidos. Sirve para buscar paraderos cercanos.
- **Red:** los paraderos del catálogo que tienen al menos una arista. Solo estos
  participan en la planificación de viajes.

Un paradero sin aristas es válido en el catálogo. La regla de no dejar paraderos
aislados se aplica únicamente a los de la red.

### Reglas de inclusión

| Regla | Criterio | Resultado |
|---|---|---|
| Área de servicio | Latitud entre -38.80 y -38.66; longitud entre -72.79 y -72.47 | Entran 397 y quedan fuera 3 |
| Duplicados | No se fusionan automáticamente | Se conservan los 397 |
| Identidad | El `@id` de OpenStreetMap identifica el origen | Los ID no dependen del orden del archivo |

No se fusionan porque dos paraderos cercanos pueden estar en lados opuestos de la
calle y servir a direcciones distintas. El par más cercano está a 13,6 m, y hay
20 pares a 25 m o menos.

Quedan fuera del área:

| Nodo de OpenStreetMap | Latitud | Longitud |
|---|---|---|
| `node/8007376783` | -38.6588 | -72.4817 |
| `node/13376897460` | -38.5666 | -72.7388 |
| `node/13678567352` | -38.6541 | -72.4775 |

### Paraderos ya cargados

Los 7 paraderos actuales coinciden exactamente con nodos del archivo. Conservan su
ID para no romper las aristas existentes.

| `stop_id` | Nodo de OpenStreetMap |
|---|---|
| `PAR-CJP-01` | `node/5849666578` |
| `PAR-CJP-02` | `node/13236477179` |
| `PAR-BARROS-01` | `node/13525059616` |
| `PAR-MRODRI-01` | `node/1225240352` |
| `PAR-DPORT-01` | `node/1744986737` |
| `PAR-CSF-01` | `node/1095184204` |
| `PAR-PORTAL-01` | `node/943207384` |

## Problemas detectados

| Problema | Se resuelve en |
|---|---|
| Solo hay 7 paraderos cargados de los 397 válidos | Subtarea 2b |
| Conviven dos formatos de ID de paradero | Subtarea 2b |
| Solo 21 de los 400 paraderos podrían tener un nombre útil | Subtarea 2b |
| Las fuentes no coinciden en el recorrido de las líneas | Subtarea 3 |
| 7A y 7B tienen el mismo nombre largo | Subtarea 3 |
| Los recorridos de ida y vuelta no cierran el circuito | Subtarea 3 |
| `route_shape` está vacío y `main.go` no lo lee | Subtarea 3 |
| Falta confirmar el origen de los tiempos y las distancias | Subtarea 5 |
| Hay caminatas de hasta 7,1 km entre todos los paraderos | Subtarea 6 |
| `PAR-CJP-02` ↔ `PAR-DPORT-01` tiene 7380 s para 5400 m, un tiempo atípico | Subtarea 6 |
| `main.go` no lee la distancia de los transbordos, así que suma 0 m | Subtarea 6 |
