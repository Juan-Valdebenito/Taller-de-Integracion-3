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
| Paradero de la red inicial | `PAR-<ZONA>-<NN>` | `PAR-CSF-01` |
| Paradero del catálogo | `PAR-OSM-<NODO>` | `PAR-OSM-1095184413` |
| Línea | `L<CODIGO>` | `L7A` |
| Recorrido de ida | `L<CODIGO>-IDA` | `L7A-IDA` |
| Recorrido de vuelta | `L<CODIGO>-VTA` | `L7A-VTA` |

`WALK` queda reservado y no se puede usar como línea.

`<NODO>` es el número del nodo de OpenStreetMap, así que el ID no cambia aunque se
regenere el catálogo o cambie el orden del archivo.

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

### Generar el catálogo

`generator/generator.go` aplica estas reglas. Usa el nombre de OpenStreetMap si es
útil; si no, pide la calle y el sector a Nominatim, a una consulta por segundo.

```bash
cd kubernetes/services/micro_service/generator
go run . -output 03_seed_catalog.sql
```

El resultado se copia en la clave `03_seed_catalog.sql` de
`micros-db-init-scripts.yaml`. PostgreSQL ejecuta esa clave después de
`02_seed_stops.sql`.

## Líneas y recorridos

La fuente oficial es `micros-db-init-scripts.yaml`, con los datos de `micros-db`.
Si otro servicio describe una línea de forma distinta, prevalece esa fuente. La
simulación de backend-go tiene su propio trazado y no define la red.

| Línea | Nombre corto | Nombre largo | Color |
|---|---|---|---|
| `L7A` | Línea 7A | El Carmen - Av. Alemania - Cajón | `#FF5733` |
| `L7B` | Línea 7B | El Carmen - Av. Alemania - Cajón | `#33FF57` |
| `L1C` | Línea 1C | Labranza - Cajón | `#3357FF` |

Cada línea tiene dos recorridos. Los paraderos aparecen en orden de viaje:

| Recorrido | Paraderos | Tramos | Tiempo | Distancia |
|---|---|---|---|---|
| `L7A-IDA` | `PAR-CSF-01` → `PAR-DPORT-01` → `PAR-CJP-02` | 2 | 1800 s | 8000 m |
| `L7A-VTA` | `PAR-CJP-02` → `PAR-MRODRI-01` | 1 | 1980 s | 6000 m |
| `L7B-IDA` | `PAR-PORTAL-01` → `PAR-CSF-01` → `PAR-DPORT-01` → `PAR-CJP-01` | 3 | 1860 s | 8450 m |
| `L7B-VTA` | `PAR-CJP-01` → `PAR-MRODRI-01` → `PAR-PORTAL-01` | 2 | 1740 s | 8300 m |
| `L1C-IDA` | `PAR-PORTAL-01` → `PAR-CSF-01` → `PAR-DPORT-01` → `PAR-BARROS-01` | 3 | 2340 s | 7150 m |
| `L1C-VTA` | `PAR-BARROS-01` → `PAR-MRODRI-01` → `PAR-PORTAL-01` | 2 | 2220 s | 7200 m |

Los seis recorridos tienen `stop_sequence` continuo y sus tramos se encadenan.

### Circuitos

- `L7B` y `L1C` forman un circuito: la vuelta termina donde parte la ida.
- `L7A` queda abierta: la vuelta termina en `PAR-MRODRI-01`, y la ida parte en
  `PAR-CSF-01`. No se agrega un tramo porque los datos oficiales no lo incluyen.

### Trazado

`route_shape` es opcional y queda vacío. El planificador trabaja con aristas entre
paraderos, así que no lo necesita para calcular viajes.

## Problemas detectados

| Problema | Se resuelve en |
|---|---|
| 7A y 7B tienen el mismo nombre largo en los datos oficiales | Confirmar con el equipo |
| `L7A` no cierra su circuito en los datos oficiales | Confirmar con el equipo |
| Falta confirmar el origen de los tiempos y las distancias | Subtarea 5 |
| Hay caminatas de hasta 7,1 km entre todos los paraderos | Subtarea 6 |
| `PAR-CJP-02` ↔ `PAR-DPORT-01` tiene 7380 s para 5400 m, un tiempo atípico | Subtarea 6 |
| `main.go` no lee la distancia de los transbordos, así que suma 0 m | Subtarea 6 |
