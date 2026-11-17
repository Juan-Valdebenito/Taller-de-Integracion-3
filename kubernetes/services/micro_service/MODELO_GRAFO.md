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

Las rutas a la universidad sí consideran la espera y los cambios de línea, porque se
ordenan por costo (ver Ocupación, Clima y API). El tiempo detenido en cada paradero
sigue sin incluirse.

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

## Algoritmos de búsqueda

Los algoritmos están en `planner.go`, que no depende de HTTP ni de gRPC.

| Función | Algoritmo | Qué optimiza |
|---|---|---|
| `fastestPath` | Dijkstra | Menor tiempo |
| `aStarPath` | A* | Menor tiempo, explorando menos paraderos |
| `minimumTransferPath` | Dijkstra con la línea actual en el estado | Menos cambios de línea y, si empatan, menor tiempo |
| `cheapestPath` | Dijkstra con la situación del pasajero en el estado | Menor costo |
| `aStarCheapestPath` | A* con la misma situación en el estado | Menor costo, explorando menos estados |

Con costo, el estado de la búsqueda es el paradero más la situación del pasajero:
la última línea y si sigue arriba de ella. Llegar a un paradero arriba de una micro
no cuesta lo mismo que llegar caminando, porque seguir en la misma micro no requiere
esperar.

La API no ofrece `aStarPath` como preferencia propia. Lo usan las rutas
alternativas y las rutas a la universidad en cada búsqueda.

### Relación entre Dijkstra y A*

Ambos usan `searchFastestPath`, que explora primero el paradero con menor valor en:

```text
tiempo recorrido + tiempo estimado hasta el destino
```

Dijkstra usa una estimación igual a 0. **Dijkstra es A* sin estimación**: explora
en todas las direcciones. A* se orienta hacia el destino.

### Heurística de A*

`remainingTimeEstimate` calcula los segundos que tardaría ir en línea recta a la
mayor velocidad de la red:

```text
estimación = distancia en línea recta / velocidad máxima en línea recta
```

La velocidad máxima sale de todas las aristas, incluidas las caminatas. Ninguna
arista avanza más rápido hacia el destino, así que la estimación **nunca supera el
tiempo real**. Esa propiedad garantiza que A* entregue una ruta óptima.

El resultado se redondea hacia abajo. Si una arista avanza sin consumir tiempo, no
existe una velocidad máxima útil y la estimación vale 0, igual que en Dijkstra.

### Comparación

Se contó cuántos paraderos explora cada algoritmo. Los dos llegaron con el mismo
tiempo en todos los viajes medidos.

| Red | Viajes | Dijkstra | A* | Reducción |
|---|---|---|---|---|
| Red oficial, 7 paraderos | 42 | 189 | 171 | 9,5 % |
| Cuadrícula de prueba, 1600 paraderos | 200 | 161 261 | 77 068 | 52,2 % |

La cuadrícula es una red generada para las pruebas, no datos reales de Temuco.
Muestra que A* aporta poco en la red actual, y que su ventaja aparece al crecer.

## Rutas alternativas

`alternatives.go` entrega hasta K rutas distintas, de la más rápida a la más lenta.
Las rutas a la universidad usan la versión por costo, `cost_alternatives.go`: aplica
Yen sobre el costo, y cada desviación parte desde la situación del pasajero en ese
paradero.
La API las entrega a través de las rutas a la universidad.

### Algoritmo de Yen

`yenPaths` usa A* en cada búsqueda:

1. Calcula la ruta más rápida.
2. Recorre sus paraderos. En cada uno, conserva el inicio de la ruta, bloquea el
   tramo que ya se usó y bloquea los paraderos ya recorridos.
3. Busca otro camino al destino desde ese paradero.
4. Guarda cada desviación como candidata.
5. La candidata más rápida pasa a ser la siguiente ruta.

Se repite hasta completar K rutas o quedarse sin candidatas. Bloquear los paraderos
recorridos impide que una ruta pase dos veces por el mismo lugar. Los bloqueos se
aplican sobre una copia, porque el grafo se comparte entre peticiones.

### Rutas distintas para el pasajero

Por sí solo, Yen trata como rutas distintas las que solo cambian de línea en un
tramo compartido. Por eso `alternativePaths` agrega dos pasos:

| Paso | Función | Qué hace |
|---|---|---|
| Antes de Yen | `distinctConnectionGraph` | Deja una arista por conexión y quita las caminatas de más de 1000 m |
| Después de Yen | `assignFewestTransfers` | Elige las líneas con menos cambios, sin alterar paraderos ni tiempo |

Una **conexión** es el mismo destino con el mismo modo de transporte. Caminar y
tomar la micro entre dos paraderos son conexiones distintas.

`assignFewestTransfers` avanza tramo a tramo y guarda la mejor opción para cada
línea en la que el pasajero podría ir. Así evita revisar todas las combinaciones.

### Ejemplo

Viaje de `PAR-PORTAL-01` a `PAR-CJP-01`, con un límite de 3 rutas:

| Tiempo | Cambios de línea | Ruta |
|---|---|---|
| 1860 s | 0 | Línea 7B hasta el destino |
| 2280 s | 1 | Línea 1C hasta `PAR-DPORT-01`, línea 7A hasta `PAR-CJP-02` y caminar |
| 2400 s | 0 | Caminar hasta `PAR-CSF-01` y seguir en la línea 7B |

### Resultado en la red oficial

De los 42 viajes, con un límite de 3 rutas:

| Rutas entregadas | Viajes |
|---|---|
| 3 | 37 |
| 2 | 3 |
| 1 | 2 |

Todos los viajes tienen al menos una ruta. Algunos tienen menos alternativas porque
la red es pequeña y no se ofrecen caminatas largas.

### Limitación

Solo se comparan líneas con el mismo tiempo en un tramo. Una línea algo más lenta
que evitara un cambio no se elegiría. Con los datos actuales no ocurre, porque los
tramos compartidos tienen tiempos iguales.

## Rutas a la universidad

`university.go` y `location.go` usan las rutas alternativas para llegar a un campus.
La sección API explica cómo pedirlas.

### Campus

Un campus es un **grupo de paraderos**, porque puede tener más de uno. El destino es
cualquiera de ellos.

| Campus | ID | Paraderos |
|---|---|---|
| Campus San Francisco | `san-francisco` | `PAR-CSF-01` |
| Campus San Juan Pablo II | `san-juan-pablo-ii` | `PAR-CJP-01`, `PAR-CJP-02` |

Para agregar un campus, se suma a la lista `universityCampuses`.

### Reglas

| Regla | Comportamiento |
|---|---|
| Campus indicado | Solo entrega rutas a ese campus |
| Sin campus | Considera todos e incluye primero la mejor ruta de cada uno |
| Origen dentro del campus | No hay ruta: el pasajero ya llegó |
| Ruta que pasa por el campus y sigue | Se descarta, porque el pasajero ya había llegado |
| Campus inexistente | Error `errUnknownCampus` |

Incluir primero la mejor ruta de cada campus evita que el más cercano llene todas
las opciones. Por eso una ruta más cara hacia otro campus puede desplazar a una
alternativa más barata.

### Salida desde la ubicación

`routesFromLocation` parte desde la posición del pasajero:

1. Busca hasta 3 paraderos con conexiones de salida, a 1000 m o menos.
2. Calcula las rutas al campus desde cada uno.
3. Agrega la caminata inicial como primer tramo.
4. Ordena por costo, con la caminata incluida.

No siempre conviene el paradero más cercano: caminar un poco más puede ahorrar
tiempo de viaje. Si un paradero cercano ya es parte del campus, la ruta solo camina
hasta él. Si no hay paraderos cercanos, responde `errNoNearbyStops`.

La caminata inicial se mide en línea recta a 1,2 m/s, porque el modelo no tiene las
calles. Es un **mínimo**, igual que el tiempo de viaje. Con solo 7 paraderos en la
red, muchas ubicaciones de Temuco quedarán a más de 1000 m de un paradero.

### Ejemplo

Desde unos 100 m al norte de `PAR-PORTAL-01`, sin indicar campus y con un límite de
3 rutas:

| Tiempo total | Costo | Campus | Ruta |
|---|---|---|---|
| 324 s | 1008 | San Francisco | Caminar 84 s y tomar la línea 7B, 240 s |
| 821 s | 1642 | San Francisco | Caminar todo el trayecto |
| 1944 s | 2628 | San Juan Pablo II | Caminar 84 s y tomar la línea 7B, 1860 s |

Sin ocupación ni clima, el costo suma la caminata con peso 2, la espera de 600 y el
viaje. En la primera ruta: 84 × 2 + 600 + 240 = 1008.

## Función de costo

La ruta más rápida no siempre es la mejor para el pasajero. Un minuto esperando en
el paradero o caminando se percibe más pesado que un minuto sentado en la micro, y
cambiar de micro es una molestia aunque no agregue tiempo. Por eso las rutas a la
universidad se ordenan por **costo**, no por tiempo.

El costo se mide en **segundos equivalentes**: cuánto le pesa al pasajero cada parte
del viaje. Está en `cost.go`.

### Fórmula

```text
costo = viaje en micro × peso del viaje
      + caminata × peso de caminar
      + espera × peso de esperar
      + penalización × cambios de línea
      + recargo por ocupación
      + recargo por clima
```

Cada término es un componente de `cost` en la respuesta: `ride`, `walk`, `wait`,
`transfer`, `crowding` y `weather`. `total` es su suma.

### Pesos

| Peso | Valor | Significado |
|---|---|---|
| Viaje en micro | 1,0 | La referencia: un segundo en micro cuesta un segundo |
| Caminar | 2,0 | Un segundo caminando pesa el doble |
| Esperar | 2,0 | Un segundo en el paradero pesa el doble |
| Cambio de línea | 300 s | Cada transbordo equivale a 5 minutos más de viaje |

Son valores típicos de la planificación de transporte, y un **supuesto ajustable**.
Están en `defaultCostWeights`. Cada respuesta los informa en `cost_weights`.

### Por qué los pesos son al menos 1

Con pesos de al menos 1, y recargos que nunca restan, **el costo de una ruta nunca
es menor que su tiempo**. Eso permite que A* use la misma estimación basada en
tiempo sin perder la ruta óptima. `validate` rechaza pesos menores que 1 y una
penalización negativa.

Con todos los pesos en 1, sin espera ni transbordos, el costo es exactamente el
tiempo. La búsqueda por tiempo es un caso particular de la función de costo.

### Espera

Los datos no incluyen frecuencias ni horarios de las micros. Por eso la espera es un
**supuesto**: cada línea pasa cada 10 minutos (`defaultHeadwaySeconds`).

Si el pasajero llega al paradero en un momento cualquiera, espera en promedio la
mitad del intervalo entre micros:

```text
espera = 600 s / 2 = 300 s
costo de la espera = 300 s × 2,0 = 600
```

Si se conoce la frecuencia real de una línea, se agrega a `lineHeadwaySeconds`. Por
ejemplo, con la 7B cada 4 minutos, su espera baja a 2 minutos y las demás líneas
siguen con el supuesto. Cada respuesta informa el supuesto en
`cost_weights.assumed_headway_seconds`.

### Cuándo se espera y cuándo hay transbordo

El costo recuerda la situación del pasajero antes de cada tramo: la última línea en
que viajó y si todavía va arriba de esa micro (`rideState`).

| Situación antes del tramo en micro | Espera | Transbordo |
|---|---|---|
| Primera micro del viaje | Sí | No |
| Sigue en la misma micro | No | No |
| Cambia de línea | Sí | Sí |
| Camina y sube a otra línea | Sí | Sí |
| Camina y vuelve a la misma línea | Sí | No |

El último caso merece atención: al bajarse y caminar, el pasajero tiene que esperar
otra micro, pero no cambió de línea. Es la misma regla de `countTransfers`, que
tampoco lo cuenta como transbordo. Los tramos a pie nunca tienen espera.

### Búsqueda por costo

`cost_search.go` busca la ruta de menor costo. Con tiempo bastaba recordar el
paradero; con costo no, porque el costo de un tramo depende de cómo se llegó al
paradero. Por eso cada estado de la búsqueda es el **paradero más la situación del
pasajero**, y un mismo paradero puede aparecer en varios estados.

Viaje de `PAR-DPORT-01` a `PAR-CJP-01`, según la situación al partir:

| Situación del pasajero | Elige | Costo |
|---|---|---|
| Va arriba de la 7B | Seguir en la 7B | 1320, sin esperar |
| Espera en el paradero | Tomar la 7B | 600 de espera + 1320 = 1920 |
| Va arriba de la 7A | Seguir en la 7A hasta `PAR-CJP-02` y caminar | 1500 + 240 × 2 = 1980 |

En el tercer caso no conviene bajarse y tomar la 7B: costaría 600 de espera, 300 de
transbordo y 1320 de viaje, en total 2220.

### A* con costo

A* reutiliza la estimación de tiempo y la convierte en costo:

```text
estimación de costo = estimación de tiempo × el menor peso entre micro y caminata
```

Cada segundo de viaje cuesta al menos ese peso mínimo, y la espera, los transbordos
y los recargos nunca restan. Por eso la estimación no supera el costo real, y A*
encuentra la ruta óptima.

| Red | Dijkstra | A* | Reducción |
|---|---|---|---|
| Red oficial, 42 viajes | 340 estados | 218 | 36 % |
| Cuadrícula de prueba, 100 viajes en 900 paraderos | 43 394 | 18 089 | 58 % |

Con costo, A* ahorra más que con tiempo (36 % frente a 9,5 % en la red oficial),
porque cada paradero tiene varios estados y orientarse hacia el destino evita
explorar muchos de ellos.

### Alternativas por costo

`cost_alternatives.go` aplica Yen sobre el costo, con dos diferencias respecto de la
versión por tiempo:

- **Cada desviación parte desde la situación del pasajero** en ese paradero. Si
  venía arriba de la 7B, seguir en ella no cobra espera.
- **No se juntan las líneas que comparten un tramo**, porque la línea define si hay
  transbordo. Yen revisa las rutas de la más barata a la más cara, y de cada
  recorrido igual para el pasajero conserva la primera, que es la más barata.

Para cada alternativa pedida, Yen revisa hasta 10 rutas
(`maxRankedPathsPerAlternative`). Si muchas líneas compartieran los mismos tramos,
podría entregar menos alternativas de las pedidas. En la red actual no ocurre.

### Ejemplo completo

Un viaje con los seis componentes. Usa la ocupación y el clima, que se explican en
las secciones siguientes.

- **Origen:** unos 100 m al norte de `PAR-PORTAL-01`.
- **Destino:** Campus San Juan Pablo II.
- **Ocupación:** 7B al 95 %, llena; 1C al 50 %, media; 7A al 20 %, baja.
- **Clima:** 3 °C, viento de 10 km/h y PM2.5 de 60. El factor de caminar es 1,4.

El planificador entrega primero esta ruta: caminar 84 s hasta `PAR-PORTAL-01`,
tomar la 1C hasta `PAR-CSF-01` (240 s), cambiar a la 7A y seguir hasta
`PAR-CJP-02` (300 s + 1500 s).

| Componente | Cálculo | Costo |
|---|---|---|
| `ride` | 240 + 300 + 1500 | 2040 |
| `walk` | 84 × 2 | 168 |
| `wait` | Dos subidas: 300 × 2 + 300 × 2 | 1200 |
| `transfer` | Un cambio de línea | 300 |
| `crowding` | 1C media: 240 × (1,1 − 1); 7A baja: 0 | 24 |
| `weather` | 168 × (1,4 − 1) | 67,2 |
| **`total`** | | **3799,2** |

La 7B haría el viaje directo y en 3 minutos menos, pero va llena:

| Ruta | Tiempo | Cambios | Recargo por ocupación | Costo |
|---|---|---|---|---|
| **1C y luego 7A** | 2124 s | 1 | 24 | **3799,2** |
| 7B directa | 1944 s | 0 | 1860 × 0,6 = 1116 | 3811,2 |

La ruta elegida es **más lenta, pero más barata**: el recargo de viajar 31 minutos
en una micro llena pesa más que una espera extra y un transbordo. También conviene
cambiar en `PAR-CSF-01` y no en `PAR-DPORT-01`: seguir en la 1C hasta
`PAR-DPORT-01` agregaría 30 de recargo por ocupación.

### Supuestos del costo

Estos valores no salen de datos medidos: son decisiones de diseño o valores típicos.
Si el equipo consigue datos reales, se cambian en el lugar indicado.

| Supuesto | Valor | Dónde se cambia |
|---|---|---|
| Peso del viaje en micro | 1,0 | `defaultCostWeights`, en `cost.go` |
| Peso de caminar | 2,0 | `defaultCostWeights`, en `cost.go` |
| Peso de esperar | 2,0 | `defaultCostWeights`, en `cost.go` |
| Penalización por cambio de línea | 300 s | `defaultCostWeights`, en `cost.go` |
| Intervalo entre micros | 600 s | `defaultHeadwaySeconds`, en `cost.go` |
| Frecuencia real de una línea | Sin datos | `lineHeadwaySeconds`, en `cost.go` |
| Velocidad al caminar | 1,2 m/s | `walkingSpeedMps`, en `location.go` |
| Caminata máxima | 1000 m | `maxWalkDistanceMeters`, en `alternatives.go` |
| Paraderos de partida probados | 3 | `maxOriginStops`, en `location.go` |
| Rutas revisadas por alternativa | 10 | `maxRankedPathsPerAlternative`, en `cost_alternatives.go` |

Al cambiar un peso hay que respetar `validate`: los pesos deben ser al menos 1 y la
penalización no puede ser negativa.

### Supuestos de la ocupación y el clima

Los de la ocupación y el clima están en `micro_service`, salvo los tiempos de
backend-go, que se indican con su ruta.

| Supuesto | Valor | Dónde se cambia |
|---|---|---|
| Límites de ocupación media, alta y llena | 40 %, 70 % y 90 % | `mediumOccupancyRatio`, `highOccupancyRatio` y `fullOccupancyRatio`, en `occupancy.go` |
| Factores por ocupación | 1,0; 1,1; 1,3 y 1,6 | Constantes `...CrowdingFactor`, en `occupancy.go` |
| Antigüedad máxima de una micro en vivo | 2 minutos | `defaultMaxReadingAge`, en `backend-go/internal/liveoccupancy/tracker.go` |
| Frío y frío intenso | Bajo 5 °C y bajo 0 °C | `coldTemperatureC` y `freezingTemperatureC`, en `weather.go` |
| Calor | Sobre 30 °C | `hotTemperatureC`, en `weather.go` |
| Viento y viento fuerte | Sobre 30 y sobre 50 km/h | `strongWindKmh` y `veryStrongWindKmh`, en `weather.go` |
| Aire sobre la norma y en alerta | PM2.5 sobre 50 y sobre 80 | `poorAirPM25` y `alertAirPM25`, en `weather.go` |
| Recargos del clima | +0,2 y +0,4 | `moderateWeatherSurcharge` y `severeWeatherSurcharge`, en `weather.go` |
| Factor máximo del clima | 2,0 | `maxWalkWeatherFactor`, en `weather.go` |
| Lecturas de clima consideradas | Últimos 30 minutos | `recentWindow`, en `backend-go/internal/currentweather/provider.go` |
| Renovación, tolerancia y espera del clima | 5 minutos, 30 minutos y 2 segundos | `refreshInterval`, `maxStaleAge` y `fetchTimeout`, en `backend-go/internal/currentweather/cache.go` |

Los límites de ocupación deben coincidir con los de `OccupancyService` en backend-go.
Si se cambian en un servicio, hay que cambiarlos también en el otro.

Los factores deben seguir siendo al menos 1, para que A* siga encontrando la ruta
óptima.

## Ocupación

Un minuto de pie en una micro llena se percibe más largo que uno sentado. Por eso
el costo del viaje en micro se multiplica por un factor según qué tan llena va la
línea. La ocupación es un número de 0 a 1, y puede superar 1 si la micro va sobre
su capacidad.

### Factores

| Ocupación | Nivel | Factor |
|---|---|---|
| Menos de 40 % | `LOW` | 1,0 |
| 40 % a 70 % | `MEDIUM` | 1,1 |
| 70 % a 90 % | `HIGH` | 1,3 |
| 90 % o más | `FULL` | 1,6 |

Los límites son los mismos de `OccupancyService` en backend-go. Los factores son
un **supuesto ajustable**, como los demás pesos. Todos son al menos 1, así el costo
nunca baja del tiempo real y A* sigue siendo válido.

El recargo se informa aparte, en `cost.crowding`:

```text
recargo = viaje en micro × peso del viaje × (factor − 1)
```

Por ejemplo, 240 s en una micro llena agregan 240 × 0,6 = 144. Caminar no tiene
ocupación y nunca recibe recargo.

### De dónde sale

1. Cada micro publica su posición, pasajeros y capacidad en el Hub de backend-go,
   tanto las de la simulación como las de los conductores.
2. El Hub entrega esa lectura a `liveoccupancy.Tracker`, que guarda la última de
   cada micro.
3. Al pedir rutas, backend-go calcula la ocupación de cada línea con las micros de
   los **últimos 2 minutos**. Una micro sin datos más recientes ya no cuenta.
4. La envía a `micro_service` en `line_occupancy`, y `micro_service` la usa para
   ordenar las rutas.

La ocupación de una línea suma los pasajeros y la capacidad de todas sus micros:

```text
ocupación = pasajeros de todas sus micros / capacidad de todas ellas
```

Así una micro grande pesa más que una chica. Con 30 de 40 y 6 de 20, la línea va
al 60 %, no al 52,5 % de un promedio simple.

### Traducción de IDs

backend-go nombra la misma línea de dos formas: `route-7A` en la simulación y
`route-7a` en la base de datos. `microLineID` las traduce a `L7A` **antes** de
sumar, para combinarlas como una sola línea. Los IDs sin el formato
`route-<código>` no se envían.

### Casos sin datos

| Situación | Resultado |
|---|---|
| Línea sin micros en vivo | No se penaliza |
| Ocupación imposible, como un valor negativo | `micro_service` responde 400 o `InvalidArgument` |
| backend-go sin micros recientes | No envía ocupación, y las rutas se calculan como sin ella |
| `micro_service` con la imagen anterior | Ignora la ocupación |

La ocupación se usa **en el momento de la consulta**. No predice cómo irá la micro
cuando el pasajero llegue al paradero.

## Clima

Caminar con frío, calor, viento fuerte o mala calidad del aire se percibe más
pesado. Por eso el costo de caminar se multiplica por un factor según el clima.
Viajar en micro no cambia: el clima solo afecta a los tramos a pie, incluida la
caminata inicial desde la ubicación del pasajero.

### Reglas

Cada condición suma un recargo al factor:

| Condición | Umbral | Recargo |
|---|---|---|
| Frío | Menos de 5 °C | +0,2 |
| Frío intenso | Menos de 0 °C | +0,4 |
| Calor | Más de 30 °C | +0,2 |
| Viento | Más de 30 km/h | +0,2 |
| Viento fuerte | Más de 50 km/h | +0,4 |
| Aire sobre la norma | PM2.5 sobre 50 µg/m³ | +0,2 |
| Aire en alerta | PM2.5 sobre 80 µg/m³ | +0,4 |

```text
factor = 1 + suma de recargos, con un máximo de 2,0
```

Los umbrales de PM2.5 toman como referencia la norma chilena: 50 µg/m³ como norma
diaria y 80 como alerta. Los demás umbrales y todos los recargos son un **supuesto
ajustable**, como los pesos y los factores de ocupación.

El máximo de 2,0 evita que la suma de varias condiciones vuelva absurda una
caminata. Como el factor nunca baja de 1, el costo nunca baja del tiempo real y A*
sigue siendo válido.

### Recargo

El recargo se informa aparte, en `cost.weather`:

```text
recargo = tiempo caminando × peso de caminar × (factor − 1)
```

| Clima | Factor | Recargo de una caminata de 84 s |
|---|---|---|
| 15 °C, poco viento y aire limpio | 1,0 | 0 |
| 3 °C | 1,2 | 84 × 2 × 0,2 = **33,6** |
| 3 °C y PM2.5 de 60, típico de un invierno en Temuco | 1,4 | 84 × 2 × 0,4 = **67,2** |

Con mal clima puede convenir esperar una micro antes que caminar. Por ejemplo,
caminar 420 s cuesta 840, menos que una micro de 300 s con su espera (900). Con
factor 1,4, la misma caminata cuesta 1176, y la ruta prefiere la micro.

### De dónde sale

`clima_service` entrega temperatura, humedad, viento y material particulado (PM2.5
y PM10) de 4 estaciones. El costo usa la temperatura, el viento y el PM2.5.

1. Al pedir rutas, backend-go consulta a `clima_service` por gRPC, con
   `ListTelemetry`, las lecturas de los **últimos 30 minutos**.
2. `currentweather.Provider` toma la **última lectura de cada estación**.
3. Promedia temperatura, viento y PM2.5 entre las estaciones.
4. backend-go envía el resultado a `micro_service` en el mensaje `weather`.

Se usa la última lectura de cada estación para que todas pesen igual. Si se
promediaran todas las lecturas, una estación que informa más seguido dominaría el
resultado.

| Estación | Lecturas | Se usa |
|---|---|---|
| A | Hace 10, 5 y 1 minuto | La de hace 1 minuto: 4 °C, 10 km/h y PM2.5 de 40 |
| B | Hace 2 minutos | 6 °C, 20 km/h y PM2.5 de 60 |
| **Ciudad** | | **5 °C, 15 km/h y PM2.5 de 50** |

Si ninguna estación tiene lecturas en los últimos 30 minutos, no hay clima, y las
rutas se calculan sin él.

### Guardado y fallas

backend-go no consulta `clima_service` en cada petición de rutas.
`currentweather.Cache` guarda el último clima con estas reglas:

| Regla | Valor | Por qué |
|---|---|---|
| Renovar el clima | Cada 5 minutos | El clima no cambia tanto en ese tiempo |
| Esperar a `clima_service` | Máximo 2 segundos | Una ruta no debe demorarse por el clima |
| Usar el último clima si el servicio falla | Hasta 30 minutos | Pasado ese tiempo, es mejor calcular sin clima que con uno viejo |
| Reintentar tras una falla | A los 5 minutos | Insistir con un servicio caído haría esperar 2 segundos a cada petición |

Si varias peticiones llegan al mismo tiempo, esperan **una sola consulta** en vez de
hacer una cada una.

La regla principal es que **las fallas de `clima_service` nunca impiden calcular
rutas**. En el peor caso, las rutas se calculan sin clima.

### Casos sin datos

| Situación | Resultado |
|---|---|
| backend-go sin fuente de clima conectada | No envía clima |
| `clima_service` sin lecturas de los últimos 30 minutos | No envía clima |
| `clima_service` caído por más de 30 minutos | No envía clima |
| Clima con valores imposibles, como `NaN` o un viento negativo | `micro_service` responde 400 o `InvalidArgument` |
| `micro_service` con la imagen anterior | Ignora el clima |

Cuando no hay clima, el mensaje `weather` **no se envía**. Si se enviara con ceros,
`micro_service` leería 0 °C y cobraría frío intenso a todas las caminatas. Por eso
el contrato usa un mensaje, que puede faltar, en vez de tres números sueltos.

### Limitaciones

| Limitación | Detalle |
|---|---|
| **No considera la lluvia** | `clima_service` no la guarda. Inferirla de la humedad sería inventar el dato |
| **Los datos son estimaciones** | Vienen de Open-Meteo: modelos meteorológicos, no sensores. Se renuevan cada 15 minutos |
| **Un solo clima para toda la ciudad** | Una caminata en Padre Las Casas usa el mismo valor que una en el centro |
| **Es el clima del momento** | No usa el pronóstico de la hora en que el pasajero caminará |

Desde el commit `133a750`, `clima_simulator` consulta Open-Meteo; antes inventaba
los datos al azar. Open-Meteo también ofrece la lluvia, así que podría incorporarse
si `clima_service` empieza a guardarla. Ese cambio corresponde al servicio de clima.

Con 4 estaciones cercanas entre sí, la diferencia de usar un solo clima por ciudad
debería ser pequeña.

## API

Las rutas a la universidad se pueden pedir de tres formas. La app y el web deben
usar **backend-go**: exige sesión y nunca expone la clave interna de
`micro_service`.

| Capa | Campus | Rutas |
|---|---|---|
| backend-go, con JWT | `GET /api/v1/integrations/micro/campuses` | `GET /api/v1/integrations/micro/routes/university` |
| `micro_service`, REST | `GET /campuses` | `GET /routes/university` |
| `micro_service`, gRPC con `x-admin-key` | `ListCampuses` | `PlanUniversityRoutes` |

backend-go traduce la petición REST a gRPC. Las reglas las valida solo
`planUniversityRoutes`, así que todas las capas entregan las mismas rutas, en el
mismo orden: **de menor a mayor costo**.

Las tres capas entregan el costo de cada ruta y los pesos usados, con los mismos
nombres de campo. En gRPC son los mensajes `CostBreakdown` y `CostWeights`.

### Parámetros

| Parámetro | Obligatorio | Descripción |
|---|---|---|
| `from_stop` | Uno de los dos orígenes | Paradero de partida |
| `lat` y `long` | Uno de los dos orígenes | Posición del pasajero, en grados decimales |
| `campus` | No | `san-francisco` o `san-juan-pablo-ii`; sin él, considera ambos |
| `limit` | No | Entre 1 y 5; por defecto, 3 |
| `occupancy` | No, y solo en `micro_service` | Ocupación por línea, como `L7A:0.95,L7B:0.3` |
| `temperature_c`, `wind_speed_kmh` y `pm25` | No, y solo en `micro_service` | Clima de la consulta; van los tres juntos o ninguno |

En gRPC, `latitude` y `longitude` son `optional`, para distinguir una coordenada
en 0 de una que no se envió. Un `limit` en 0 usa el valor por defecto. La
ocupación va en el campo `line_occupancy`, y el clima en el mensaje `weather`, que
puede faltar: así se distingue "sin clima" de un clima a 0 °C.

La app no envía la ocupación: backend-go la agrega sola, con las micros en vivo
(ver la sección Ocupación). El parámetro `occupancy` sirve para probar
`micro_service` directamente. Se rechaza con 400 si tiene una línea repetida, un
valor que no es número o un formato mal escrito.

Tampoco envía el clima: backend-go lo consulta a `clima_service` (ver la sección
Clima). Los parámetros del clima también sirven para probar `micro_service`:

```text
GET /routes/university?from_stop=PAR-PORTAL-01&temperature_c=3&wind_speed_kmh=10&pm25=60
```

Los tres deben venir juntos: con uno solo no se sabría si los otros faltan o valen
0. Se rechazan con 400 si falta alguno, si no son números o si están fuera de estos
rangos:

| Dato | Rango aceptado |
|---|---|
| Temperatura | −50 a 60 °C |
| Viento | 0 a 300 km/h |
| PM2.5 | 0 a 1000 µg/m³ |

### Ejemplo

Petición de la app a backend-go:

```text
GET /api/v1/integrations/micro/routes/university?from_stop=PAR-PORTAL-01&limit=1
Authorization: Bearer <access token>
```

La API REST de `micro_service`, en `GET /routes/university`, responde lo mismo.

```json
{
  "routes": [
    {
      "campus_id": "san-francisco",
      "campus_name": "Campus San Francisco",
      "destination_stop_id": "PAR-CSF-01",
      "total_time_seconds": 240,
      "total_distance_meters": 950,
      "transfers": 0,
      "movements": [
        {
          "from_stop_id": "PAR-PORTAL-01",
          "to_stop_id": "PAR-CSF-01",
          "mode": "bus",
          "route_id": "L7B",
          "trip_id": "L7B-IDA",
          "time_seconds": 240,
          "distance_meters": 950
        }
      ],
      "cost": { "ride": 240, "walk": 0, "wait": 600, "transfer": 0, "crowding": 0, "weather": 0, "total": 840 }
    }
  ],
  "total": 1,
  "cost_weights": {
    "ride_weight": 1,
    "walk_weight": 2,
    "wait_weight": 2,
    "transfer_penalty_seconds": 300,
    "assumed_headway_seconds": 600
  }
}
```

Las líneas 7B y 1C hacen este tramo en el mismo tiempo y con el mismo costo. El
empate se resuelve siempre igual, así que la respuesta no cambia entre consultas.

### Campos del costo

| Campo | Significado |
|---|---|
| `cost.ride` | Tiempo en micro por su peso |
| `cost.walk` | Tiempo caminando por su peso, incluida la caminata inicial |
| `cost.wait` | Espera estimada en cada subida a una micro, por su peso |
| `cost.transfer` | Penalización por cada cambio de línea |
| `cost.crowding` | Recargo por viajar en micros llenas |
| `cost.weather` | Recargo por caminar con mal clima |
| `cost.total` | Suma de los demás; es el valor con que se ordenan las rutas |
| `cost_weights` | Pesos usados en el cálculo |
| `cost_weights.assumed_headway_seconds` | Intervalo supuesto entre micros: la espera es una estimación |

Los costos están en segundos equivalentes y se redondean a un decimal. Este
ejemplo **tarda 240 s, pero cuesta 840**, por los 5 minutos de espera supuestos.

Cuando la ruta parte desde una posición, el primer tramo es una caminata desde
`USER_LOCATION`. Los tramos a pie tienen `"mode": "walk"` y no traen `route_id` ni
`trip_id`. Si el pasajero ya está en el campus pedido, la respuesta trae
`"routes": []` y `"total": 0`, y también los pesos.

### Versiones distintas de los servicios

Si backend-go está actualizado, pero el cluster mantiene la imagen anterior de
`micro_service`, las rutas llegan sin costo:

| Campo | Valor que entrega backend-go | Motivo |
|---|---|---|
| `cost` | Todos los componentes en 0 | La ruta sigue siendo válida |
| `cost_weights` | `null` | Un peso en 0 tendría otro significado |

La app debe revisar si `cost_weights` es `null` antes de mostrar el costo. El orden
de las rutas no depende de esto: siempre lo decide `micro_service`.

Si la imagen de `micro_service` ya calcula el costo, pero es anterior a la
ocupación o al clima, ignora esos datos. Las rutas llegan con `cost.crowding` y
`cost.weather` en 0, y se ordenan sin considerarlos.

### Errores

| Caso | gRPC | HTTP |
|---|---|---|
| Falta el origen, vienen dos, o no son válidos el límite, las coordenadas, la ocupación o el clima | `InvalidArgument` | 400 |
| Sin sesión en backend-go | — | 401 |
| Paradero o campus inexistente, o sin paraderos a 1000 m | `NotFound` | 404 |
| `micro_service` rechaza la clave de backend-go | `Unauthenticated` | 502 en backend-go |
| Grafo sin cargar o servicio sin respuesta | `Unavailable` | 503 |

El rechazo de la clave interna responde 502, y no 401, porque la app interpreta
un 401 como sesión vencida y la cerraría.

## Despliegue

Las rutas a la universidad necesitan imágenes nuevas de dos servicios:

| Servicio | Namespace | Stack | Imagen actual |
|---|---|---|---|
| `micro_service` | `student-tpenroz` | `micros` | `ignaciogsm/micro_service:v1.1` |
| backend-go | `student-jvaldebenito` | `foundation` | `<DOCKERHUB_USER>/backend-go:v1` |

`micro_service` lo mantiene Ignacio, así que su imagen nueva se coordina con él.
`deploy.sh build` no construye esa imagen.

### Orden

1. **`clima_service` y `clima_simulator`**, en el stack `realtime`. No es
   obligatorio para las rutas, pero sin ellos no hay clima.
2. **`micro_service`.** Su imagen nueva incluye las rutas a la universidad, el costo,
   la ocupación y el clima.
3. **backend-go.** Su imagen nueva envía la ocupación y el clima, y muestra el costo.

El orden importa porque backend-go depende de lo que sabe hacer `micro_service`:

| Si backend-go se actualiza y `micro_service` tiene… | Resultado |
|---|---|
| La imagen sin rutas a la universidad | Las rutas nuevas responden 500 |
| Una imagen con costo, pero sin ocupación ni clima | Funciona, pero `crowding` y `weather` llegan en 0 |
| La imagen nueva | Funciona completo |

Actualizar `micro_service` antes nunca rompe nada: backend-go antiguo simplemente
no envía la ocupación ni el clima.

### Comandos

Las dos imágenes se construyen desde la raíz del repositorio, porque copian la
carpeta `proto/`:

```bash
docker build -f kubernetes/services/micro_service/Dockerfile -t <usuario>/micro_service:<tag> .
docker push <usuario>/micro_service:<tag>

docker build -f backend-go/Dockerfile -t <usuario>/backend-go:<tag> .
docker push <usuario>/backend-go:<tag>
```

Luego se actualiza la imagen en `micros-deployment.yaml` y se aplica cada stack con
su cuenta:

```bash
bash kubernetes/deploy.sh micros apply
bash kubernetes/deploy.sh foundation apply
```

`foundation` toma la etiqueta de backend-go de `BACKEND_GO_IMAGE_TAG` en
`cluster.env`.

### Configuración

No hay variables nuevas. backend-go ya usa:

| Variable | Valor | Para qué |
|---|---|---|
| `MICRO_GRPC_TARGET` | `micros-service-svc.<APP_NAMESPACE>.svc.cluster.local:9091` | Pedir las rutas |
| `MICRO_API_KEY` | Clave `ADMIN_KEY` del Secret `micros-secrets` | Autenticarse ante `micro_service` |
| `CLIMATE_GRPC_TARGET` | `clima-service-svc.<REALTIME_NAMESPACE>.svc.cluster.local:9090` | Consultar el clima |
| `CLIMATE_API_KEY` | Clave del Secret `clima-client-secrets` | Autenticarse ante `clima_service` |

La clave de `micro_service` debe ser la misma que él espera. Si no coincide, las
rutas nuevas responden 502.

### Requisitos de la ocupación y el clima

| Dato | Necesita | Si falta |
|---|---|---|
| Ocupación | Micros publicando su posición en el Hub de backend-go, de la simulación o de conductores | Las rutas se calculan sin ocupación |
| Clima | `clima_service` funcionando en `<REALTIME_NAMESPACE>`, con `clima_simulator` enviándole lecturas | Las rutas se calculan sin clima |

La ocupación no requiere otro servicio: se calcula dentro de backend-go. El clima
depende de que `clima_simulator` pueda consultar Open-Meteo, así que ese pod
necesita salida a internet. Si `clima_service` tiene la clave equivocada o no
responde, backend-go registra `weather_fetch_failed` en sus logs y sigue
entregando rutas.

### Comprobación

Con una sesión iniciada, esta consulta debe responder 200 y dos campus:

```bash
curl -H "Authorization: Bearer <access token>" \
  https://<API_HOST>/api/v1/integrations/micro/campuses
```

Después se piden rutas desde una ubicación, para que haya una caminata inicial:

```bash
curl -H "Authorization: Bearer <access token>" \
  "https://<API_HOST>/api/v1/integrations/micro/routes/university?lat=-38.735&long=-72.612"
```

En la respuesta se revisa:

| Qué revisar | Esperado | Si no se cumple |
|---|---|---|
| `cost_weights` | Trae los pesos, no `null` | `micro_service` tiene una imagen sin costo |
| `cost.total` | Es la suma de los demás componentes | Algún servicio tiene una imagen anterior |
| `cost.crowding` | Mayor que 0 en alguna ruta, si hay micros llenas | No hay micros publicando, o `micro_service` es anterior a la ocupación |
| `cost.weather` | Mayor que 0 en alguna ruta, si hace frío, calor, viento o hay mal aire | No hay clima, o `micro_service` es anterior al clima |

Que `crowding` o `weather` valgan 0 no siempre es un error: puede que las micros
vayan vacías o que el día esté templado. Para distinguirlo, se revisan los logs de
backend-go:

```bash
kubectl logs deploy/backend-go -n <FOUNDATION_NAMESPACE> | grep weather_fetch_failed
```

Si aparece `weather_fetch_failed`, backend-go no pudo obtener el clima. En ese caso
se revisa que `clima_service` esté funcionando y que `CLIMATE_API_KEY` sea la
correcta.

## Validación

`graph_data_test.go` revisa los datos oficiales con las reglas de este documento y
con el planificador real. `planner_test.go` compara Dijkstra y A*, y
`alternatives_test.go` revisa las rutas alternativas. `university_test.go` y
`location_test.go` revisan las rutas a la universidad. Los archivos que empiezan con
`cost`, junto con `occupancy_test.go` y `weather_test.go`, revisan la función de
costo. Ninguno necesita una base de datos.

```bash
cd kubernetes/services/micro_service
go test ./...
```

En backend-go, `liveoccupancy` y `currentweather` tienen sus propias pruebas, y el
handler y el router prueban el recorrido completo hasta el JSON:

```bash
cd backend-go
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
| A* y Dijkstra | Dan el mismo tiempo en la red oficial y en 40 grafos aleatorios |
| Heurística | La estimación nunca supera el tiempo real |
| Paraderos explorados | A* no explora más que Dijkstra en la red oficial, y explora menos en la cuadrícula |
| Yen | Coincide con una búsqueda de fuerza bruta en 30 grafos aleatorios |
| Alternativas | Son válidas, no se repiten, no caminan más de 1000 m y evitan cambios innecesarios |
| Campus | Sus paraderos existen en la red, y los ID no se repiten |
| Rutas a la universidad | Son válidas desde todos los paraderos y aparecen ambos campus |
| Salida desde la ubicación | Incluye la caminata, omite paraderos sin conexiones e informa si no hay cercanos |
| Búsqueda por costo | Dijkstra coincide con la fuerza bruta, y A* da el mismo costo explorando menos estados |
| Yen por costo | Coincide con la fuerza bruta, y cada desviación parte desde la situación del pasajero |
| Desglose del costo | Los componentes suman el total, en REST, gRPC y backend-go |
| Ocupación | Con una línea llena, la ruta prefiere otra; los factores van de 1,0 a 1,6 |
| Clima | Con mal clima, la ruta prefiere la micro antes que caminar; el factor va de 1,0 a 2,0 |
| Ocupación en vivo | Las micros publicadas en el Hub llegan a `micro_service`, con sus IDs traducidos |
| Clima actual | Se promedia la última lectura de cada estación, y las fallas no impiden calcular rutas |
| Sin datos | Sin ocupación o sin clima, no se envía nada; el clima nunca viaja como 0 °C |

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
| Faltan 390 paraderos por cargar en el catálogo: el generador está listo, pero no se ha ejecutado | Ejecutar `generator/generator.go` y cargar el resultado |
| 7A y 7B tienen el mismo nombre largo en los datos oficiales | Confirmar con el equipo |
| `L7A` no cierra su circuito en los datos oficiales | Confirmar con el equipo |
| La espera es una estimación: no hay frecuencias reales de las líneas | Conseguir frecuencias y cargarlas en `lineHeadwaySeconds` |
| La ocupación es la del momento de la consulta, no la de la llegada al paradero | Mejora futura |
| `PAR-CJP-02` ↔ `PAR-DPORT-01` tiene un tiempo atípico de 7380 s | Confirmar con el equipo |
| Las rutas a la universidad, el costo, la ocupación y el clima no están desplegados: faltan las imágenes nuevas de `micro_service` y backend-go | Coordinar con Ignacio |
| Los endpoints de paraderos y clima responden 401 si un microservicio rechaza la clave de backend-go, y la app cerraría la sesión del usuario | Tarea aparte: cambiar `writeRPCError` |
| En `main`, los paraderos se movieron a `/mapinfo/micro/stops`, pero la app móvil todavía pide `/integrations/micro/stops`, que ya no existe | Actualizar `mobile/src/api/stopsApi.ts` |
| El clima no considera la lluvia: `clima_service` no la guarda | Que `clima_service` guarde la lluvia de Open-Meteo |
| El clima depende de que `clima_simulator` pueda salir a internet para consultar Open-Meteo | Confirmar en el cluster |
| Muchas ubicaciones de Temuco quedan a más de 1000 m de un paradero de la red, porque esta tiene 7 paraderos | Cargar el catálogo y agregar recorridos |
