package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Edge representa una conexión dirigida entre dos paraderos
type Edge struct {
	ToStopID    string
	RouteID     string // ID de la micro (ej. "L7") o "WALK"
	BaseTimeSec int
	DistanceM   int
}

// Stop representa la información básica de un paradero (Nodo)
type Stop struct {
	ID   string
	Name string
}

// TransitGraph representa el grafo en memoria RAM
type TransitGraph struct {
	Stops map[string]Stop    // Metadatos de los nodos (Paraderos)
	Edges map[string][]Edge  // Lista de adyacencia (Key: FromStopID)
}

// NewTransitGraph inicializa las estructuras en memoria
func NewTransitGraph() *TransitGraph {
	return &TransitGraph{
		Stops: make(map[string]Stop),
		Edges: make(map[string][]Edge),
	}
}

// LoadFromDB lee PostgreSQL y construye el grafo en RAM
func (g *TransitGraph) LoadFromDB(ctx context.Context, pool *pgxpool.Pool) error {
	// 1. Cargar Metadatos de Paraderos (Nodos)
	stopRows, err := pool.Query(ctx, "SELECT stop_id, stop_name FROM stops")
	if err != nil {
		return fmt.Errorf("error al consultar paraderos: %w", err)
	}
	defer stopRows.Close()

	for stopRows.Next() {
		var s Stop
		if err := stopRows.Scan(&s.ID, &s.Name); err != nil {
			return err
		}
		g.Stops[s.ID] = s
	}

	// 2. Cargar Aristas de Recorridos de Micros (route_stops)
	routeQuery := `
		SELECT from_stop_id, to_stop_id, trip_id, base_travel_time_seconds, distance_meters 
		FROM route_stops
	`
	routeRows, err := pool.Query(ctx, routeQuery)
	if err != nil {
		return fmt.Errorf("error al consultar tramos de micros: %w", err)
	}
	defer routeRows.Close()

	for routeRows.Next() {
		var fromID string
		var edge Edge
		if err := routeRows.Scan(&fromID, &edge.ToStopID, &edge.RouteID, &edge.BaseTimeSec, &edge.DistanceM); err != nil {
			return err
		}
		g.Edges[fromID] = append(g.Edges[fromID], edge)
	}

	// 3. Cargar Aristas de Transbordos a Pie (transfers)
	transferQuery := `
		SELECT from_stop_id, to_stop_id, walk_time_seconds 
		FROM transfers
	`
	transferRows, err := pool.Query(ctx, transferQuery)
	if err != nil {
		return fmt.Errorf("error al consultar transbordos: %w", err)
	}
	defer transferRows.Close()

	for transferRows.Next() {
		var fromID string
		var edge Edge
		edge.RouteID = "WALK"
		if err := transferRows.Scan(&fromID, &edge.ToStopID, &edge.BaseTimeSec); err != nil {
			return err
		}
		g.Edges[fromID] = append(g.Edges[fromID], edge)
	}

	return nil
}

// PrintGraph muestra en consola la estructura del grafo cargado
func (g *TransitGraph) PrintGraph() {
	fmt.Println("\n=== GRAFO DE TRANSPORTE EN MEMORIA (RAM) ===")
	fmt.Printf("Total de Paraderos (Nodos): %d\n", len(g.Stops))
	fmt.Println("--------------------------------------------")

	for fromID, stop := range g.Stops {
		fmt.Printf("\n [Nodo] %s (%s)\n", stop.Name, fromID)
		edges, exists := g.Edges[fromID]
		if !exists || len(edges) == 0 {
			fmt.Println("   └── (Sin conexiones salientes)")
			continue
		}

		for _, edge := range edges {
			if edge.RouteID == "WALK" {
				fmt.Printf("   ├──  [CAMINATA] ➔ %s (%s) | Tiempo: %ds\n",
					g.Stops[edge.ToStopID].Name, edge.ToStopID, edge.BaseTimeSec)
			} else {
				fmt.Printf("   ├──  [%s] ➔ %s (%s) | Tiempo: %ds | Distancia: %dm\n",
					edge.RouteID, g.Stops[edge.ToStopID].Name, edge.ToStopID, edge.BaseTimeSec, edge.DistanceM)
			}
		}
	}
	fmt.Println("--------------------------------------------")
}

func main() {
	// Cadena de conexión a la base de datos en Docker
	connStr := "postgres://transit_user:transit_password@localhost:5432/temuco_transit_db?sslmode=disable"

	ctx := context.Background()

	// Crear pool de conexiones con pgx
	pool, err := pgxpool.New(ctx, connStr)
	if err != nil {
		log.Fatalf("No se pudo conectar a la base de datos: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()

	// Verificar la conexión
	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("Error al hacer ping a PostgreSQL: %v\n", err)
	}
	fmt.Println(" Conexión exitosa a PostgreSQL (Docker)")

	// Crear e hidratar el grafo en memoria
	graph := NewTransitGraph()
	if err := graph.LoadFromDB(ctx, pool); err != nil {
		log.Fatalf("Error al cargar el grafo: %v\n", err)
	}

	// Mostrar resultado en consola
	graph.PrintGraph()
}