// Package simulation proporciona un motor de simulación circular GPS para
// las rutas de microbuses de Temuco. Los buses virtuales recorren waypoints
// GPS reales en ciclo infinito, publicando updates al Hub WebSocket.
package simulation

// Waypoint representa una coordenada GPS de la ruta.
type Waypoint struct {
	Lat float64
	Lng float64
}

// RouteDefinition define una ruta de simulación con sus waypoints y parámetros.
type RouteDefinition struct {
	ID        string
	Name      string
	Waypoints []Waypoint
	Capacity  int // Capacidad máxima del bus
	BusCount  int // Cantidad de buses simulados en esta ruta
}

// Routes contiene las definiciones de las rutas 7A, 7B y 1C de Temuco.
// Los waypoints son coordenadas GPS reales capturadas del trazado oficial.
var Routes = []RouteDefinition{
	{
		ID:       "route-7A",
		Name:     "7A Hualpén – Centro – Las Américas",
		Capacity: 45,
		BusCount: 1,
		// Trazado: Sector Hualpén (oeste) → Av. Alemania → Centro → Av. Las Américas (sureste)
		Waypoints: []Waypoint{
			{-38.7278, -72.6175}, // Terminal Hualpén / Villa Presidente
			{-38.7295, -72.6090}, // Av. Caupolicán con Los Pinos
			{-38.7310, -72.6010}, // Sector Amanecer Norte
			{-38.7322, -72.5955}, // Cruce Av. Alemania
			{-38.7335, -72.5900}, // Av. Alemania con Barros Arana
			{-38.7348, -72.5870}, // Barros Arana con Claro Solar
			{-38.7359, -72.5904}, // Plaza de Armas Temuco
			{-38.7368, -72.5870}, // Manuel Montt con Aldunate
			{-38.7382, -72.5810}, // Av. Balmaceda sur
			{-38.7400, -72.5760}, // Av. Rudecindo Ortega
			{-38.7420, -72.5710}, // Cruce Av. Las Américas norte
			{-38.7445, -72.5670}, // Av. Las Américas con Lautaro
			{-38.7468, -72.5635}, // Av. Las Américas con Los Carrera
			{-38.7490, -72.5608}, // Terminal Las Américas
			// Regreso
			{-38.7470, -72.5640}, // Av. Las Américas subiendo
			{-38.7448, -72.5675},
			{-38.7425, -72.5715},
			{-38.7405, -72.5762},
			{-38.7386, -72.5815},
			{-38.7370, -72.5868},
			{-38.7358, -72.5906}, // Plaza de Armas (vuelta)
			{-38.7344, -72.5875},
			{-38.7330, -72.5952},
			{-38.7318, -72.6008},
			{-38.7302, -72.6088},
			{-38.7285, -72.6155}, // De vuelta a Hualpén
		},
	},
	{
		ID:       "route-7B",
		Name:     "7B Pedro de Valdivia – Centro – Amanecer",
		Capacity: 45,
		BusCount: 1,
		// Trazado: Sector Pedro de Valdivia Norte → Av. Balmaceda → Centro → Sector Amanecer Sur
		Waypoints: []Waypoint{
			{-38.7085, -72.5820}, // Terminal Pedro de Valdivia Norte
			{-38.7120, -72.5828}, // Av. Balmaceda con Dinamarca
			{-38.7155, -72.5832}, // Balmaceda con Pedro de Valdivia
			{-38.7188, -72.5837}, // Sector Villa Verde
			{-38.7220, -72.5848}, // Balmaceda con Santa Marta
			{-38.7255, -72.5861}, // Balmaceda con Los Pinos
			{-38.7290, -72.5876}, // Balmaceda cruce Av. Caupolicán
			{-38.7320, -72.5888}, // Prat con Balmaceda
			{-38.7342, -72.5896}, // Mercado Municipal
			{-38.7358, -72.5904}, // Plaza de Armas
			{-38.7375, -72.5908}, // Manuel Rodríguez
			{-38.7400, -72.5912}, // Av. Pablo Neruda
			{-38.7428, -72.5918}, // Sector Amanecer norte
			{-38.7455, -72.5923}, // Villa Alegría
			{-38.7482, -72.5928}, // Amanecer con Colo-Colo
			{-38.7508, -72.5932}, // Terminal Amanecer
			// Regreso
			{-38.7485, -72.5930},
			{-38.7458, -72.5925},
			{-38.7432, -72.5920},
			{-38.7408, -72.5914},
			{-38.7382, -72.5910},
			{-38.7360, -72.5905}, // Plaza (vuelta)
			{-38.7344, -72.5898},
			{-38.7324, -72.5890},
			{-38.7294, -72.5878},
			{-38.7260, -72.5864},
			{-38.7226, -72.5850},
			{-38.7192, -72.5839},
			{-38.7158, -72.5833},
			{-38.7124, -72.5829},
			{-38.7092, -72.5822}, // De vuelta al terminal norte
		},
	},
	{
		ID:       "route-1C",
		Name:     "1C Padre Las Casas – Centro – Labranza",
		Capacity: 40,
		BusCount: 1,
		// Trazado: Padre Las Casas (sur, cruce Puente Cautín) → Centro → Labranza (oeste)
		Waypoints: []Waypoint{
			{-38.7775, -72.5692}, // Terminal Padre Las Casas
			{-38.7740, -72.5710}, // Av. O'Higgins PLC
			{-38.7705, -72.5728}, // Sector Villa Unión
			{-38.7668, -72.5742}, // Camino a Puente Cautín
			{-38.7632, -72.5758}, // Puente Cautín (sur)
			{-38.7598, -72.5772}, // Puente Cautín (norte) / Av. Alemania sur
			{-38.7562, -72.5802}, // Av. Alemania con Portales
			{-38.7528, -72.5835}, // Sector La Araucana
			{-38.7495, -72.5862}, // Av. Alemania con Rudecindo Ortega
			{-38.7462, -72.5882}, // Barrio Estación
			{-38.7428, -72.5896}, // Rodríguez con Lynch
			{-38.7395, -72.5902}, // Claro Solar
			{-38.7360, -72.5906}, // Plaza de Armas
			// Giro hacia Labranza
			{-38.7350, -72.5940}, // Prat con Ercilla
			{-38.7358, -72.5985}, // Ercilla con Caupolicán
			{-38.7365, -72.6042}, // Sector Pueblo Nuevo
			{-38.7372, -72.6100}, // Av. Caupolicán con Los Cerezos
			{-38.7382, -72.6162}, // Sector Labranza ingreso
			{-38.7395, -72.6225}, // Labranza centro
			{-38.7410, -72.6288}, // Terminal Labranza
			// Regreso
			{-38.7398, -72.6238},
			{-38.7385, -72.6172},
			{-38.7375, -72.6110},
			{-38.7368, -72.6050},
			{-38.7360, -72.5990},
			{-38.7352, -72.5948},
			{-38.7363, -72.5908}, // Plaza (vuelta)
			{-38.7398, -72.5900},
			{-38.7432, -72.5892},
			{-38.7465, -72.5878},
			{-38.7498, -72.5858},
			{-38.7532, -72.5830},
			{-38.7566, -72.5798},
			{-38.7600, -72.5770},
			{-38.7635, -72.5755},
			{-38.7670, -72.5740},
			{-38.7707, -72.5726},
			{-38.7742, -72.5708},
		},
	},
}
