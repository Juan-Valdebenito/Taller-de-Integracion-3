package handler

import (
	"encoding/json"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
)

func assertJSONText(t *testing.T, value any, expectedText string) {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	if string(encoded) != expectedText {
		t.Fatalf("JSON = %s\nwant   %s", encoded, expectedText)
	}
}

// El JSON exacto que recibe la app. Los tramos a pie no traen línea ni viaje, y
// los ceros se envían.
func TestRecommendedRouteJSON(t *testing.T) {
	assertJSONText(t, newRecommendedRouteJSON(recommendationSampleResponse().GetRoutes()[0]),
		`{"total_time_seconds":370,"total_distance_meters":1105,"transfers":0,"movements":[`+
			`{"from_stop_id":"USER_LOCATION","to_stop_id":"PAR-PORTAL-01","mode":"walk","time_seconds":84,"distance_meters":100},`+
			`{"from_stop_id":"PAR-PORTAL-01","to_stop_id":"PAR-CSF-01","mode":"bus","route_id":"L1C","trip_id":"L1C-IDA","time_seconds":240,"distance_meters":950},`+
			`{"from_stop_id":"PAR-CSF-01","to_stop_id":"DESTINATION_LOCATION","mode":"walk","time_seconds":46,"distance_meters":55}],`+
			`"cost":{"ride":240,"walk":260,"wait":600,"transfer":0,"crowding":144,"weather":52,"total":1296}}`)
}

// Una ruta sin tramos ni costo no falla, y movements es [] y no null: la app
// recorre la lista sin revisar si existe.
func TestRecommendedRouteJSONWithoutData(t *testing.T) {
	const emptyRoute = `{"total_time_seconds":0,"total_distance_meters":0,"transfers":0,"movements":[],` +
		`"cost":{"ride":0,"walk":0,"wait":0,"transfer":0,"crowding":0,"weather":0,"total":0}}`
	assertJSONText(t, newRecommendedRouteJSON(&microv1.RecommendedRoute{}), emptyRoute)
	assertJSONText(t, newRecommendedRouteJSON(nil), emptyRoute)
}

// Los decimales del costo no se pierden.
func TestRecommendedRouteJSONKeepsDecimals(t *testing.T) {
	route := newRecommendedRouteJSON(&microv1.RecommendedRoute{Cost: &microv1.CostBreakdown{Walk: 556, Weather: 444.8, Total: 1000.8}})
	if route.Cost.Weather != 444.8 || route.Cost.Total != 1000.8 {
		t.Fatalf("cost = %+v, want 444.8 and 1000.8", route.Cost)
	}
}

// Para una misma ruta, las recomendadas y las de la universidad entregan los
// mismos totales, tramos y costo.
func TestRecommendedRouteJSONMatchesUniversityRoute(t *testing.T) {
	recommended := recommendationSampleResponse().GetRoutes()[0]
	university := newUniversityRouteJSON(&microv1.UniversityRoute{
		TotalTimeSeconds: recommended.GetTotalTimeSeconds(), TotalDistanceMeters: recommended.GetTotalDistanceMeters(),
		Transfers: recommended.GetTransfers(), Movements: recommended.GetMovements(), Cost: recommended.GetCost(),
	})
	expectedText, err := json.Marshal(recommendedRouteJSON{
		TotalTimeSeconds: university.TotalTimeSeconds, TotalDistanceMeters: university.TotalDistanceMeters,
		Transfers: university.Transfers, Movements: university.Movements, Cost: university.Cost,
	})
	if err != nil {
		t.Fatal(err)
	}
	assertJSONText(t, newRecommendedRouteJSON(recommended), string(expectedText))
}
