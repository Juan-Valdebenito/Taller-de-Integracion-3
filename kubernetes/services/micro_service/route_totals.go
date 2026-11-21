package main

// Totales de una ruta para las respuestas de la API. Las rutas a la universidad y
// las recomendadas los calculan con estas mismas funciones, así que informan
// siempre lo mismo.

// pathTotalSeconds suma el tiempo de todos los tramos, caminatas incluidas. No
// incluye la espera en el paradero: es el mínimo de viaje, y la espera estimada se
// informa aparte, en el costo.
func pathTotalSeconds(path []pathStep) int {
	totalSeconds := 0
	for _, step := range path {
		totalSeconds += step.Edge.BaseTimeSec
	}
	return totalSeconds
}

// pathTotalMeters suma la distancia de todos los tramos, caminatas incluidas.
// Las caminatas desde una coordenada o hasta ella se miden en línea recta, así que
// el total es un mínimo, igual que el tiempo.
func pathTotalMeters(path []pathStep) int {
	totalMeters := 0
	for _, step := range path {
		totalMeters += step.Edge.DistanceM
	}
	return totalMeters
}
