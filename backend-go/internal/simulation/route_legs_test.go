package simulation

import "testing"

const (
	// maxStopOffsetMeters es cuánto puede separarse el camino de un paradero, que
	// está en la vereda y no en la calzada.
	maxStopOffsetMeters = 50.0
	// maxStraightMeters es la recta más larga aceptada, para notar un salto que cruce
	// la ciudad. La más larga real, en Rudecindo Ortega, mide unos 1900 m.
	maxStraightMeters = 2200.0
	// maxDetourFactor limita cuánto más largo que la línea recta puede ser un tramo.
	maxDetourFactor = 2.0
)

func graphStopPosition(t *testing.T, stopID string) Waypoint {
	t.Helper()
	for _, node := range temucoGraphNodes {
		if node.ID == stopID {
			return node.Position
		}
	}
	t.Fatalf("unknown stop %s", stopID)
	return Waypoint{}
}

func waypointDistance(start, end Waypoint) float64 {
	return haversineMeters(start.Lat, start.Lng, end.Lat, end.Lng)
}

// assertRouteLegs revisa que el camino de una línea siga sus paraderos oficiales,
// en orden y cerrando el circuito, sin saltos ni rodeos absurdos.
func assertRouteLegs(t *testing.T, routeID string, legs []RouteLeg) {
	t.Helper()
	segments := temucoGraphSegments[routeID]
	if len(legs) != len(segments) {
		t.Fatalf("%s has %d legs, want %d", routeID, len(legs), len(segments))
	}
	for legIndex, leg := range legs {
		segment := segments[legIndex]
		if leg.FromStopID != segment.FromStopID || leg.ToStopID != segment.ToStopID {
			t.Fatalf("%s leg %d goes %s -> %s, want %s -> %s", routeID, legIndex, leg.FromStopID, leg.ToStopID, segment.FromStopID, segment.ToStopID)
		}
		if len(leg.Path) < 2 {
			t.Fatalf("%s leg %d has %d points", routeID, legIndex, len(leg.Path))
		}
		firstPoint, lastPoint := leg.Path[0], leg.Path[len(leg.Path)-1]
		fromStop, toStop := graphStopPosition(t, leg.FromStopID), graphStopPosition(t, leg.ToStopID)
		if startOffset, endOffset := waypointDistance(firstPoint, fromStop), waypointDistance(lastPoint, toStop); startOffset > maxStopOffsetMeters || endOffset > maxStopOffsetMeters {
			t.Fatalf("%s leg %d is %.0f m and %.0f m away from its stops", routeID, legIndex, startOffset, endOffset)
		}
		if nextLeg := legs[(legIndex+1)%len(legs)]; nextLeg.Path[0] != lastPoint {
			t.Fatalf("%s leg %d does not join the next one", routeID, legIndex)
		}
		legMeters := 0.0
		for pointIndex := 1; pointIndex < len(leg.Path); pointIndex++ {
			straightMeters := waypointDistance(leg.Path[pointIndex-1], leg.Path[pointIndex])
			if straightMeters == 0 || straightMeters > maxStraightMeters {
				t.Fatalf("%s leg %d has a straight of %.0f m at point %d", routeID, legIndex, straightMeters, pointIndex)
			}
			legMeters += straightMeters
		}
		if directMeters := waypointDistance(fromStop, toStop); legMeters > directMeters*maxDetourFactor {
			t.Fatalf("%s leg %d is %.0f m long, but its stops are %.0f m apart", routeID, legIndex, legMeters, directMeters)
		}
		t.Logf("%s leg %d: %d points, %.0f m", routeID, legIndex, len(leg.Path), legMeters)
	}
}

func TestRoute7BLegsFollowOfficialStops(t *testing.T) {
	assertRouteLegs(t, "route-7B", route7BLegs)
}

func TestRoute1CLegsFollowOfficialStops(t *testing.T) {
	assertRouteLegs(t, "route-1C", route1CLegs)
}
