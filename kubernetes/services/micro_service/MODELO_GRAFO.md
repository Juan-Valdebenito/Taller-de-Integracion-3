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

## Conexiones en micro

La red tiene **7 paraderos y 13 aristas en micro**. Esas aristas cubren 9 pares
distintos de paraderos, porque varias líneas comparten tramos.

| Desde | Hacia | Recorridos | Tiempo | Distancia |
|---|---|---|---|---|
| `PAR-CSF-01` | `PAR-DPORT-01` | `L7A-IDA`, `L7B-IDA`, `L1C-IDA` | 300 s | 1200 m |
| `PAR-PORTAL-01` | `PAR-CSF-01` | `L7B-IDA`, `L1C-IDA` | 240 s | 950 m |
| `PAR-MRODRI-01` | `PAR-PORTAL-01` | `L7B-VTA`, `L1C-VTA` | 420 s | 2300 m |
| `PAR-DPORT-01` | `PAR-CJP-02` | `L7A-IDA` | 1500 s | 6800 m |
| `PAR-DPORT-01` | `PAR-CJP-01` | `L7B-IDA` | 1320 s | 6300 m |
| `PAR-DPORT-01` | `PAR-BARROS-01` | `L1C-IDA` | 1800 s | 5000 m |
| `PAR-CJP-02` | `PAR-MRODRI-01` | `L7A-VTA` | 1980 s | 6000 m |
| `PAR-CJP-01` | `PAR-MRODRI-01` | `L7B-VTA` | 1320 s | 6000 m |
| `PAR-BARROS-01` | `PAR-MRODRI-01` | `L1C-VTA` | 1800 s | 4900 m |

### Reglas

- Un tramo compartido se guarda una vez por recorrido, no una vez por par de
  paraderos. Así el planificador sabe en qué línea va el pasajero y puede contar
  los cambios de línea.
- Los recorridos que comparten un tramo tienen el mismo tiempo y distancia.
- Cada arista tiene un solo sentido. Ninguno de los 9 pares tiene su inverso en
  micro.

### Conectividad

Solo con micros, desde cualquiera de los 7 paraderos se puede llegar a los otros 6,
aunque a veces cambiando de línea. Por eso el grafo es **fuertemente conexo**.

- `PAR-DPORT-01` es el punto de **bifurcación**: de él salen 3 tramos.
- `PAR-MRODRI-01` es el punto de **convergencia**: a él llegan 3 tramos.

## Tiempos y distancias

Los valores de `route_stops` provienen de `micros-db`. Según el historial del
repositorio, se agregaron como datos reales en el commit `886bc0c`. Se usan tal
como están.

| Dato | Campo | Significado |
|---|---|---|
| Tiempo base | `base_travel_time_seconds` | Viaje en micro entre dos paraderos |
| Distancia | `distance_meters` | Metros recorridos por la calle |

### Revisión de los datos

La velocidad es `distancia / tiempo`. El factor de calle compara la distancia
registrada con la línea recta entre los dos paraderos.

| Tramo | Tiempo | Distancia | Velocidad | Línea recta | Factor de calle |
|---|---|---|---|---|---|
| `PAR-BARROS-01` → `PAR-MRODRI-01` | 1800 s | 4900 m | 9,8 km/h | 4489 m | 1,09 |
| `PAR-DPORT-01` → `PAR-BARROS-01` | 1800 s | 5000 m | 10,0 km/h | 4643 m | 1,08 |
| `PAR-CJP-02` → `PAR-MRODRI-01` | 1980 s | 6000 m | 10,9 km/h | 5055 m | 1,19 |
| `PAR-PORTAL-01` → `PAR-CSF-01` | 240 s | 950 m | 14,2 km/h | 951 m | 1,00 |
| `PAR-CSF-01` → `PAR-DPORT-01` | 300 s | 1200 m | 14,4 km/h | 1045 m | 1,15 |
| `PAR-DPORT-01` → `PAR-CJP-02` | 1500 s | 6800 m | 16,3 km/h | 5209 m | 1,31 |
| `PAR-CJP-01` → `PAR-MRODRI-01` | 1320 s | 6000 m | 16,4 km/h | 4869 m | 1,23 |
| `PAR-DPORT-01` → `PAR-CJP-01` | 1320 s | 6300 m | 17,2 km/h | 5023 m | 1,25 |
| `PAR-MRODRI-01` → `PAR-PORTAL-01` | 420 s | 2300 m | 19,7 km/h | 2079 m | 1,11 |

La velocidad promedio de los 9 tramos es **13,3 km/h**. Todos los valores son
coherentes con un recorrido urbano. `PAR-PORTAL-01` → `PAR-CSF-01` registra 1 m
menos que la línea recta, una diferencia atribuible al redondeo.

### Reglas para tramos nuevos

| Regla | Criterio |
|---|---|
| Distancia | Se mide por la calle y no puede ser menor que la línea recta, con 5 m de tolerancia |
| Tiempo medido | Si hay un dato real, se usa ese valor |
| Tiempo estimado | Sin dato real, `distancia / 13,3 km/h`, convertido a segundos y redondeado |
| Velocidad aceptada | Entre 8 y 25 km/h |
| Factor de calle aceptado | Entre 1,00 y 1,40 |

Los rangos parten de los datos actuales, con un margen. Un valor fuera de rango se
revisa antes de cargarlo.

### Qué no incluye el tiempo

`fastestPath` suma solo los tiempos de las aristas. Por eso el resultado no incluye:

- La espera de la micro.
- El tiempo detenido en cada paradero.
- Una penalización por cambiar de línea.

El tiempo que entrega el planificador es un **mínimo de viaje**, no una hora exacta
de llegada.

## Transbordos a pie

Los datos oficiales tienen 42 filas: 21 pares de paraderos, una fila por sentido.
Conectan todos los paraderos entre sí, y cada par tiene el mismo tiempo y distancia
en ambos sentidos.

La velocidad típica es de **1,2 m/s**, unos 4,4 km/h, normal para una persona.

### Regla de distancia

Un transbordo razonable mide **1000 m o menos**. Cumplen esta regla 5 pares:

| Paraderos | Tiempo | Distancia |
|---|---|---|
| `PAR-DPORT-01` ↔ `PAR-MRODRI-01` | 120 s | 180 m |
| `PAR-CJP-01` ↔ `PAR-CJP-02` | 240 s | 200 m |
| `PAR-BARROS-01` ↔ `PAR-CJP-01` | 480 s | 600 m |
| `PAR-BARROS-01` ↔ `PAR-CJP-02` | 780 s | 900 m |
| `PAR-CSF-01` ↔ `PAR-PORTAL-01` | 780 s | 950 m |

Las otras 32 filas no se borran, porque son datos oficiales, y tampoco afectan los
viajes. Al ejecutar el planificador con los 42 viajes posibles, con y sin ese
límite, el tiempo total de los viajes fue el mismo y ninguna ruta caminó más de 950 m.

### Reglas para transbordos nuevos

| Regla | Criterio |
|---|---|
| Distancia máxima | 1000 m |
| Sentido | Una fila por cada sentido, con los mismos valores |
| Tiempo estimado | Sin dato real, `distancia / 1,2 m/s`, redondeado |
| Velocidad aceptada | Entre 0,8 y 1,5 m/s |
| Factor de calle aceptado | Entre 1,00 y 1,40 |

Estas reglas importan al cargar el catálogo: si se generaran todos los pares entre
397 paraderos, habría más de 157 000 filas.

### Valor atípico

`PAR-CJP-02` ↔ `PAR-DPORT-01` tiene 7380 s para 5400 m, o 0,73 m/s. Los pares de
distancia parecida rondan los 4400 s, así que podría ser un error de digitación.
No se corrige sin confirmarlo. Tampoco afecta los viajes, porque esa caminata nunca
se elige.

## Validación

`graph_data_test.go` revisa los datos oficiales con las reglas de este documento y
con el planificador real. No necesita una base de datos.

```bash
cd kubernetes/services/micro_service
go test ./...
```

| Prueba | Qué comprueba |
|---|---|
| Área de servicio | Todos los paraderos están dentro del área |
| Recorridos continuos | `stop_sequence` no tiene saltos y los tramos se encadenan |
| Tramos en micro | Tiempo y distancia positivos, velocidad y factor de calle aceptados |
| Transbordos | Valores iguales en ambos sentidos, velocidad y factor de calle aceptados |
| Conectividad | Solo con micros, cada paradero llega a los demás |
| Planificador | Encuentra ruta para los 42 viajes entre paraderos |
| Cálculo a mano | El planificador coincide con el ejemplo siguiente |

`PAR-CJP-02` ↔ `PAR-DPORT-01` está registrado en la prueba como excepción conocida
de velocidad. Si el equipo corrige el dato, se quita esa excepción. Cualquier otro
valor fuera de rango hace fallar la prueba.

## Ejemplo calculado a mano

Viaje de `PAR-CSF-01` a `PAR-MRODRI-01`, con la preferencia `fastest`:

| Opción | Cálculo | Tiempo | Distancia |
|---|---|---|---|
| Micro hasta `PAR-DPORT-01` y caminar | 300 s + 120 s | **420 s** | 1380 m |
| Caminar todo el trayecto | 1140 s | 1140 s | 1300 m |
| Solo micro, por `L7B` | 300 s + 1320 s + 1320 s | 2940 s | 13 500 m |

Dijkstra elige la primera opción: **7 minutos**, con una micro y 180 m a pie. La
prueba confirma que el planificador entrega ese tiempo y esa distancia.

## Problemas detectados

| Problema | Se resuelve en |
|---|---|
| Faltan 390 paraderos por cargar en el catálogo: el generador está listo, pero no se ha ejecutado | Subtarea 2b, pausada |
| 7A y 7B tienen el mismo nombre largo en los datos oficiales | Confirmar con el equipo |
| `L7A` no cierra su circuito en los datos oficiales | Confirmar con el equipo |
| El planificador no considera espera ni penalización por cambiar de línea | Mejora futura |
| `PAR-CJP-02` ↔ `PAR-DPORT-01` tiene un tiempo atípico de 7380 s | Confirmar con el equipo |
