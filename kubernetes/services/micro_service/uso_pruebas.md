# Datos de prueba iniciales para el servicio de información de micros

en esta carpeta *micro_service* están los archivos necesarios para:

## Levantar una base de datos en un contenedor Docker con unos pocos datos de prueba
usando:
```
docker compose up -d
```
La base de datos para información persistente se levantará automaticamente


## Cargar los datos persistentes y crear un grafo en Go
usando:
```
go mod download
```
para descargar las dependencias y luego:
```
go run main.go
```
Para formar un grafo con la información en la base de datos y mostrarlo en consola