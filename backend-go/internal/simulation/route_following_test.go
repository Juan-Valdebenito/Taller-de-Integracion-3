package simulation

import (
	"math"
	"testing"
	"time"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	ws "github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/websocket"
)

// distanceToPath es la distancia de una posición al recorrido, en metros. En una
// ciudad basta con tratar las coordenadas como planas.
func distanceToPath(position Waypoint, path []Waypoint) float64 {
	const metersPerDegree = 111195.0
	longitudeScale := math.Cos(position.Lat * math.Pi / 180)
	nearestMeters := math.Inf(1)
	for pointIndex := range path {
		start, end := path[pointIndex], path[(pointIndex+1)%len(path)]
		startX, startY := (start.Lng-position.Lng)*longitudeScale, start.Lat-position.Lat
		deltaX, deltaY := (end.Lng-start.Lng)*longitudeScale, end.Lat-start.Lat
		progress := -(startX*deltaX + startY*deltaY) / (deltaX*deltaX + deltaY*deltaY)
		progress = math.Max(0, math.Min(1, progress))
		meters := metersPerDegree * math.Hypot(startX+progress*deltaX, startY+progress*deltaY)
		nearestMeters = math.Min(nearestMeters, meters)
	}
	return nearestMeters
}

// simulateLap recorre una vuelta completa, con un tick por segundo, y devuelve lo
// publicado.
func simulateLap(route RouteDefinition) []ws.BusLocationData {
	simulator := NewBusSimulator("test-bus", &route, 0, nil, time.Second)
	simulator.passengerFlow = service.NewPassengerFlowService()
	var updates []ws.BusLocationData
	simulator.publish = func(data ws.BusLocationData) { updates = append(updates, data) }
	lapSeconds := 0.0
	for _, seconds := range route.waypointSeconds {
		lapSeconds += seconds
	}
	for second := 0.0; second <= lapSeconds; second++ {
		simulator.tick()
	}
	return updates
}

// El tiempo de cada línea es el oficial, y cada punto tiene su parte.
func TestRoutesKeepOfficialTimes(t *testing.T) {
	for _, route := range Routes {
		if len(route.Waypoints) == 0 || len(route.waypointSeconds) != len(route.Waypoints) {
			t.Fatalf("%s: %d points with %d times", route.ID, len(route.Waypoints), len(route.waypointSeconds))
		}
		legIndex, legSeconds := -1, 0.0
		checkLeg := func() {
			if legIndex >= 0 && legIndex < len(route.Segments) && math.Abs(legSeconds-float64(route.Segments[legIndex].TravelSeconds)) > 0.001 {
				t.Fatalf("%s leg %d takes %.1f s, want %d", route.ID, legIndex, legSeconds, route.Segments[legIndex].TravelSeconds)
			}
		}
		for pointIndex, seconds := range route.waypointSeconds {
			if seconds <= 0 {
				t.Fatalf("%s point %d takes %v s", route.ID, pointIndex, seconds)
			}
			if route.isStop(pointIndex) {
				checkLeg()
				legIndex, legSeconds = legIndex+1, 0
			}
			legSeconds += seconds
		}
		checkLeg()
		if legCount := len(temucoRouteLegs[route.ID]); legIndex+1 != legCount || len(route.stopWaypoints) != legCount {
			t.Fatalf("%s visits %d stops, want %d", route.ID, legIndex+1, legCount)
		}
	}
}

// Durante una vuelta la micro nunca se sale del recorrido, pasa por todos los
// paraderos de su línea y no salta ni va a una velocidad imposible.
func TestBusesStayOnTheStreetsAndReachEveryStop(t *testing.T) {
	for _, route := range Routes {
		updates := simulateLap(route)
		nearestToStop := make(map[string]float64)
		for updateIndex, update := range updates {
			position := Waypoint{Lat: update.Latitude, Lng: update.Longitude}
			if offset := distanceToPath(position, route.Waypoints); offset > 1 {
				t.Fatalf("%s is %.0f m off its path", route.ID, offset)
			}
			if update.Speed <= 0 || update.Speed > 60 {
				t.Fatalf("%s goes at %.1f km/h", route.ID, update.Speed)
			}
			if updateIndex > 0 {
				previous := Waypoint{Lat: updates[updateIndex-1].Latitude, Lng: updates[updateIndex-1].Longitude}
				if jump := waypointDistance(previous, position); jump > 20 {
					t.Fatalf("%s jumps %.0f m in one second", route.ID, jump)
				}
			}
			for _, leg := range temucoRouteLegs[route.ID] {
				meters := waypointDistance(position, graphStopPosition(t, leg.FromStopID))
				if nearest, seen := nearestToStop[leg.FromStopID]; !seen || meters < nearest {
					nearestToStop[leg.FromStopID] = meters
				}
			}
		}
		for stopID, meters := range nearestToStop {
			if meters > maxStopOffsetMeters {
				t.Fatalf("%s passes %.0f m away from %s", route.ID, meters, stopID)
			}
		}
		first, last := updates[0], updates[len(updates)-1]
		if gap := haversineMeters(first.Latitude, first.Longitude, last.Latitude, last.Longitude); gap > 50 {
			t.Fatalf("%s ends its lap %.0f m away from the start", route.ID, gap)
		}
	}
}

// Los pasajeros suben y bajan solo en los paraderos, no en cada curva.
func TestPassengersOnlyMoveAtStops(t *testing.T) {
	for _, route := range Routes {
		updates := simulateLap(route)
		changes, previousTotal := 0, 0
		for _, update := range updates {
			if total := update.TotalBoardings + update.TotalAlightings; total != previousTotal {
				changes, previousTotal = changes+1, total
			}
		}
		// La vuelta empieza en un paradero sin procesarlo, y al terminar puede o no
		// haber llegado de nuevo a él.
		if legCount := len(temucoRouteLegs[route.ID]); changes < legCount-1 || changes > legCount {
			t.Fatalf("%s moved passengers %d times in a lap with %d stops", route.ID, changes, legCount)
		}
	}
}
