package main

import (
	"strings"
	"testing"
)

func walkStep(seconds, meters int) pathStep {
	return pathStep{Edge: Edge{RouteID: walkRouteID, BaseTimeSec: seconds, DistanceM: meters}}
}

func busStep(routeID string, seconds int) pathStep {
	return pathStep{Edge: Edge{RouteID: routeID, BaseTimeSec: seconds, DistanceM: 1000}}
}

// Cada línea espera 300 s en promedio: 5 min por cada subida.
func TestExplainRoute(t *testing.T) {
	testCases := []struct {
		name         string
		path         []pathStep
		expectedText string
	}{
		{"example of the task", []pathStep{walkStep(300, 400), busStep("L1C", 900)},
			"1C tarda 20 min, más unos 5 min de espera, y requiere caminar 4 cuadras."},
		{"without walking", []pathStep{busStep("L7B", 240)},
			"7B tarda 4 min, más unos 5 min de espera, y no requiere caminar."},
		{"several stops on one line", []pathStep{busStep("L7B", 240), busStep("L7B", 300)},
			"7B tarda 9 min, más unos 5 min de espera, y no requiere caminar."},
		{"one transfer", []pathStep{walkStep(84, 100), busStep("L1C", 240), busStep("L7A", 1800)},
			"1C y después 7A tardan 36 min, más unos 10 min de espera, con 1 transbordo, y requieren caminar 1 cuadra."},
		{"two transfers", []pathStep{busStep("L1C", 60), busStep("L7A", 60), busStep("L7B", 60)},
			"1C y después 7A y después 7B tardan 3 min, más unos 15 min de espera, con 2 transbordos, y no requieren caminar."},
		{"same line after walking", []pathStep{busStep("L7A", 60), walkStep(60, 160), busStep("L7A", 60)},
			"7A tarda 3 min, más unos 10 min de espera, y requiere caminar 2 cuadras."},
		{"several walks", []pathStep{walkStep(60, 140), busStep("L7A", 60), walkStep(60, 140)},
			"7A tarda 3 min, más unos 5 min de espera, y requiere caminar 3 cuadras."},
		{"only walking", []pathStep{walkStep(278, 334)}, "A pie tarda 5 min: 3 cuadras."},
		{"almost no walking", []pathStep{walkStep(1, 20), busStep("L7A", 60)},
			"7A tarda 2 min, más unos 5 min de espera, y requiere caminar menos de 1 cuadra."},
		{"without steps", nil, ""},
	}
	for _, testCase := range testCases {
		if text := explainRoute(testCase.path, defaultCostWeights()); text != testCase.expectedText {
			t.Fatalf("%s:\n got %q\nwant %q", testCase.name, text, testCase.expectedText)
		}
	}
}

// La ocupación y el clima se mencionan solo si influyen en esa ruta.
func TestExplainRouteMentionsCrowdingAndWeather(t *testing.T) {
	const crowdingText, weatherText = "La 7B va llena.", "El clima hace menos cómodo caminar."
	withWalk, withoutWalk := []pathStep{walkStep(60, 100), busStep("L7B", 60)}, []pathStep{busStep("L7B", 60)}
	fullLine := LineOccupancy{"L7B": 0.95}
	badWeather := &WeatherConditions{TemperatureC: -3}
	testCases := []struct {
		name                    string
		path                    []pathStep
		preferences             RoutePreferences
		occupancy               LineOccupancy
		weather                 *WeatherConditions
		hasCrowding, hasWeather bool
	}{
		{"full line", withWalk, defaultRoutePreferences(), fullLine, nil, true, false},
		{"half full line", withWalk, defaultRoutePreferences(), LineOccupancy{"L7B": 0.5}, nil, false, false},
		{"other line is full", withWalk, defaultRoutePreferences(), LineOccupancy{"L7A": 0.95}, nil, false, false},
		{"not avoiding crowding", withWalk, preferencesWith(priorityBalanced, false), fullLine, nil, false, false},
		{"bad weather with walk", withWalk, defaultRoutePreferences(), nil, badWeather, false, true},
		{"bad weather without walk", withoutWalk, defaultRoutePreferences(), nil, badWeather, false, false},
		{"mild weather", withWalk, defaultRoutePreferences(), nil, &WeatherConditions{TemperatureC: 18}, false, false},
		{"both", withWalk, defaultRoutePreferences(), fullLine, badWeather, true, true},
	}
	for _, testCase := range testCases {
		text := explainRoute(testCase.path, preferenceCostWeights(testCase.preferences, testCase.occupancy, testCase.weather))
		if strings.Contains(text, crowdingText) != testCase.hasCrowding || strings.Contains(text, weatherText) != testCase.hasWeather {
			t.Fatalf("%s: %q", testCase.name, text)
		}
	}
}

// Una línea llena se menciona una sola vez, aunque el pasajero suba dos veces.
func TestExplainRouteMentionsFullLineOnce(t *testing.T) {
	weights := preferenceCostWeights(defaultRoutePreferences(), LineOccupancy{"L7A": 0.95}, nil)
	text := explainRoute([]pathStep{busStep("L7A", 60), walkStep(60, 100), busStep("L7A", 60)}, weights)
	if strings.Count(text, "La 7A va llena.") != 1 {
		t.Fatalf("text = %q", text)
	}
}

func TestDescribeDurationAndBlocks(t *testing.T) {
	for seconds, expectedText := range map[int]string{
		0: "1 min", 1: "1 min", 60: "1 min", 61: "2 min", 3540: "59 min", 3541: "1 h", 3600: "1 h", 3660: "1 h 1 min", 7380: "2 h 3 min",
	} {
		if text := describeDuration(seconds); text != expectedText {
			t.Fatalf("%d s = %q, want %q", seconds, text, expectedText)
		}
	}
	for meters, expectedText := range map[int]string{
		0: "menos de 1 cuadra", 49: "menos de 1 cuadra", 50: "1 cuadra", 149: "1 cuadra", 150: "2 cuadras", 1000: "10 cuadras",
	} {
		if text := describeBlocks(meters); text != expectedText {
			t.Fatalf("%d m = %q, want %q", meters, text, expectedText)
		}
	}
}

// En la red oficial, toda recomendación tiene una explicación que nombra todas sus
// líneas, y su espera es la misma que cobra el costo.
func TestEveryRecommendationHasExplanation(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	weights := defaultCostWeights()
	for _, testCase := range officialNetworkCases(graph) {
		routes, err := recommendRoutes(graph, testCase.origin, testCase.destination, 1, weights, maxWalkDistanceMeters)
		if err != nil {
			t.Fatal(err)
		}
		text := explainRoute(routes[0], weights)
		if !strings.HasSuffix(text, ".") {
			t.Fatalf("%s: %q", testCase.name, text)
		}
		for _, step := range routes[0] {
			if step.Edge.RouteID != walkRouteID && !strings.Contains(text, passengerLineName(step.Edge.RouteID)) {
				t.Fatalf("%s: %q does not mention %s", testCase.name, text, step.Edge.RouteID)
			}
		}
		waitSeconds := summarizeRoute(routes[0], weights).waitSeconds
		if cost := pathCostBreakdown(routes[0], weights).Wait; cost != float64(waitSeconds)*weights.WaitWeight {
			t.Fatalf("%s: wait of %d s, but the cost charges %v", testCase.name, waitSeconds, cost)
		}
	}
}
