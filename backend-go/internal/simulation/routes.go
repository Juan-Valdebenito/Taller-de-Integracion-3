// Package simulation proporciona un motor de simulación circular GPS para
// las rutas de microbuses de Temuco. Los buses virtuales recorren waypoints
// GPS por las calles en ciclo infinito, publicando updates al Hub WebSocket.
package simulation

// Waypoint representa una coordenada GPS de la ruta.
type Waypoint struct {
	Lat float64
	Lng float64
}

// RouteNode representa un nodo/paradero del grafo de transporte.
// Los IDs coinciden con los seeds de micros-db-init-scripts.yaml.
type RouteNode struct {
	ID       string
	Name     string
	Position Waypoint
}

// RouteSegment representa una arista del grafo entre dos nodos.
type RouteSegment struct {
	FromStopID     string
	ToStopID       string
	TravelSeconds  int
	DistanceMeters int
}

// RouteDefinition define una ruta de simulación con sus waypoints y parámetros.
type RouteDefinition struct {
	ID        string
	Name      string
	Waypoints []Waypoint
	// SegmentTravelSeconds contiene el tiempo base desde cada waypoint hasta
	// el siguiente. Si se omite, se estima usando una velocidad urbana media.
	SegmentTravelSeconds []int
	Nodes                []RouteNode
	Segments             []RouteSegment
	// waypointSeconds es el tiempo exacto desde cada punto hasta el siguiente, y
	// stopWaypoints los puntos que son paraderos. Los llena followLegs.
	waypointSeconds []float64
	stopWaypoints   map[int]bool
	Capacity        int // Capacidad máxima del bus
	BusCount        int // Cantidad de buses simulados en esta ruta
}

// Routes contiene las líneas 7A, 7B y 1C de Temuco. Sus puntos salen de los tramos
// por las calles (route_7a_path.go, route_7b_path.go y route_1c_path.go).
var Routes = []RouteDefinition{
	{ID: "route-7A", Name: "7A Campus San Francisco – Centro – Campus San Juan Pablo II", Capacity: 45, BusCount: 1},
	{ID: "route-7B", Name: "7B Portal Temuco – Centro – Campus San Juan Pablo II", Capacity: 45, BusCount: 1},
	{ID: "route-1C", Name: "1C Portal Temuco – Centro – Barros Arana", Capacity: 40, BusCount: 1},
}
