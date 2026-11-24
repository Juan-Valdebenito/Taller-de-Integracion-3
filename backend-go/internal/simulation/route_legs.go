package simulation

// RouteLeg es el camino por las calles entre dos paraderos seguidos de una línea.
// Está separado por tramos, igual que RouteSegment, para repartir el tiempo oficial
// de cada tramo entre sus puntos.
type RouteLeg struct {
	FromStopID string
	ToStopID   string
	Path       []Waypoint
}
