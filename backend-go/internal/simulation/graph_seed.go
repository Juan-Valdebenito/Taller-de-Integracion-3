package simulation

// graph_seed.go contiene el subconjunto de nodos y aristas usado por el seed
// de micros-db-init-scripts.yaml. El trazado GPS detallado de routes.go sigue
// siendo la geometria de la simulacion; estos datos aportan tiempos base.

var temucoGraphNodes = []RouteNode{
	{ID: "PAR-CJP-01", Name: "Campus San Juan Pablo II", Position: Waypoint{Lat: -38.703959, Lng: -72.550509}},
	{ID: "PAR-CJP-02", Name: "Avenida Rudecindo Ortega / Campus San Juan Pablo II", Position: Waypoint{Lat: -38.702598, Lng: -72.549241}},
	{ID: "PAR-BARROS-01", Name: "Avenida Barros Arana / Loteo Valle Verde", Position: Waypoint{Lat: -38.708689, Lng: -72.550547}},
	{ID: "PAR-MRODRI-01", Name: "Manuel Rodriguez / Galeria Nielol", Position: Waypoint{Lat: -38.736554, Lng: -72.587983}},
	{ID: "PAR-DPORT-01", Name: "Diego Portales / McDonalds", Position: Waypoint{Lat: -38.737505, Lng: -72.589278}},
	{ID: "PAR-CSF-01", Name: "Avenida Alemania / Campus San Francisco", Position: Waypoint{Lat: -38.736937, Lng: -72.601303}},
	{ID: "PAR-PORTAL-01", Name: "Avenida Alemania / Portal Temuco", Position: Waypoint{Lat: -38.734505, Lng: -72.611813}},
}

var temucoGraphSegments = map[string][]RouteSegment{
	"route-7A": {
		{FromStopID: "PAR-CSF-01", ToStopID: "PAR-DPORT-01", TravelSeconds: 300, DistanceMeters: 1200},
		{FromStopID: "PAR-DPORT-01", ToStopID: "PAR-CJP-02", TravelSeconds: 1500, DistanceMeters: 6800},
		{FromStopID: "PAR-CJP-02", ToStopID: "PAR-MRODRI-01", TravelSeconds: 1980, DistanceMeters: 6000},
	},
	"route-7B": {
		{FromStopID: "PAR-PORTAL-01", ToStopID: "PAR-CSF-01", TravelSeconds: 240, DistanceMeters: 950},
		{FromStopID: "PAR-CSF-01", ToStopID: "PAR-DPORT-01", TravelSeconds: 300, DistanceMeters: 1200},
		{FromStopID: "PAR-DPORT-01", ToStopID: "PAR-CJP-01", TravelSeconds: 1320, DistanceMeters: 6300},
		{FromStopID: "PAR-CJP-01", ToStopID: "PAR-MRODRI-01", TravelSeconds: 1320, DistanceMeters: 6000},
		{FromStopID: "PAR-MRODRI-01", ToStopID: "PAR-PORTAL-01", TravelSeconds: 420, DistanceMeters: 2300},
	},
	"route-1C": {
		{FromStopID: "PAR-PORTAL-01", ToStopID: "PAR-CSF-01", TravelSeconds: 240, DistanceMeters: 950},
		{FromStopID: "PAR-CSF-01", ToStopID: "PAR-DPORT-01", TravelSeconds: 300, DistanceMeters: 1200},
		{FromStopID: "PAR-DPORT-01", ToStopID: "PAR-BARROS-01", TravelSeconds: 1800, DistanceMeters: 5000},
		{FromStopID: "PAR-BARROS-01", ToStopID: "PAR-MRODRI-01", TravelSeconds: 1800, DistanceMeters: 4900},
		{FromStopID: "PAR-MRODRI-01", ToStopID: "PAR-PORTAL-01", TravelSeconds: 420, DistanceMeters: 2300},
	},
}

func init() {
	for index := range Routes {
		Routes[index].Nodes = append([]RouteNode(nil), temucoGraphNodes...)
		Routes[index].Segments = append([]RouteSegment(nil), temucoGraphSegments[Routes[index].ID]...)
	}
}
