package main

import (
	"errors"
	"strings"
	"testing"
)

func TestParseRoutePriorityUsesDefaultWhenEmpty(t *testing.T) {
	for _, text := range []string{"", "   "} {
		priority, err := parseRoutePriority(text)
		if err != nil {
			t.Fatalf("parseRoutePriority(%q) returned error: %v", text, err)
		}
		if priority != priorityBalanced {
			t.Fatalf("parseRoutePriority(%q) = %q, want %q", text, priority, priorityBalanced)
		}
	}
}

func TestParseRoutePriorityAcceptsEveryPriority(t *testing.T) {
	for _, expectedPriority := range routePriorities() {
		priority, err := parseRoutePriority(string(expectedPriority))
		if err != nil {
			t.Fatalf("parseRoutePriority(%q) returned error: %v", expectedPriority, err)
		}
		if priority != expectedPriority {
			t.Fatalf("parseRoutePriority(%q) = %q", expectedPriority, priority)
		}
	}
}

func TestParseRoutePriorityIgnoresCaseAndSpaces(t *testing.T) {
	priority, err := parseRoutePriority("  Fewest_Transfers ")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if priority != priorityFewestTransfers {
		t.Fatalf("priority = %q, want %q", priority, priorityFewestTransfers)
	}
}

func TestParseRoutePriorityRejectsUnknownPriority(t *testing.T) {
	for _, text := range []string{"cheapest", "fast", "least walking"} {
		if _, err := parseRoutePriority(text); !errors.Is(err, errInvalidRoutePriority) {
			t.Fatalf("parseRoutePriority(%q) error = %v, want errInvalidRoutePriority", text, err)
		}
	}
}

// El mensaje de error le dice al cliente qué valores puede usar, así que debe
// nombrar todas las prioridades.
func TestRoutePriorityErrorNamesEveryPriority(t *testing.T) {
	for _, priority := range routePriorities() {
		if !strings.Contains(errInvalidRoutePriority.Error(), string(priority)) {
			t.Fatalf("error message does not mention %q", priority)
		}
	}
}

func TestResolveMaxWalkMetersUsesDefaultWhenNotSent(t *testing.T) {
	meters, err := resolveMaxWalkMeters(0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if meters != defaultPreferredWalkMeters {
		t.Fatalf("meters = %d, want %d", meters, defaultPreferredWalkMeters)
	}
}

func TestResolveMaxWalkMetersAcceptsLimits(t *testing.T) {
	for _, requestedMeters := range []int{minPreferredWalkMeters, 500, maxPreferredWalkMeters} {
		meters, err := resolveMaxWalkMeters(requestedMeters)
		if err != nil {
			t.Fatalf("resolveMaxWalkMeters(%d) returned error: %v", requestedMeters, err)
		}
		if meters != requestedMeters {
			t.Fatalf("resolveMaxWalkMeters(%d) = %d", requestedMeters, meters)
		}
	}
}

func TestResolveMaxWalkMetersRejectsOutOfRange(t *testing.T) {
	outOfRange := []int{-1, minPreferredWalkMeters - 1, maxPreferredWalkMeters + 1}
	for _, requestedMeters := range outOfRange {
		if _, err := resolveMaxWalkMeters(requestedMeters); !errors.Is(err, errInvalidMaxWalk) {
			t.Fatalf("resolveMaxWalkMeters(%d) error = %v, want errInvalidMaxWalk", requestedMeters, err)
		}
	}
}

// La preferencia no puede permitir caminatas que la red no considera caminables,
// y el mensaje de error debe indicar los límites.
func TestMaxWalkPreferenceNeverExceedsNetworkLimit(t *testing.T) {
	if maxPreferredWalkMeters > maxWalkDistanceMeters {
		t.Fatalf("maxPreferredWalkMeters = %d exceeds network limit %d", maxPreferredWalkMeters, maxWalkDistanceMeters)
	}
	if !strings.Contains(errInvalidMaxWalk.Error(), "100 and 1000") {
		t.Fatalf("error message = %q, want the limits", errInvalidMaxWalk.Error())
	}
}

func TestParseMaxWalkMetersUsesDefaultWhenEmpty(t *testing.T) {
	for _, text := range []string{"", "  "} {
		meters, err := parseMaxWalkMeters(text)
		if err != nil {
			t.Fatalf("parseMaxWalkMeters(%q) returned error: %v", text, err)
		}
		if meters != defaultPreferredWalkMeters {
			t.Fatalf("parseMaxWalkMeters(%q) = %d, want %d", text, meters, defaultPreferredWalkMeters)
		}
	}
}

func TestParseMaxWalkMetersReadsNumbers(t *testing.T) {
	meters, err := parseMaxWalkMeters(" 400 ")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if meters != 400 {
		t.Fatalf("meters = %d, want 400", meters)
	}
}

// Un "0" escrito no significa "sin preferencia": es una caminata imposible.
func TestParseMaxWalkMetersRejectsInvalidText(t *testing.T) {
	for _, text := range []string{"0", "abc", "500m", "400.5", "-200", "1001", "99999999999999999999"} {
		if _, err := parseMaxWalkMeters(text); !errors.Is(err, errInvalidMaxWalk) {
			t.Fatalf("parseMaxWalkMeters(%q) error = %v, want errInvalidMaxWalk", text, err)
		}
	}
}

func TestParseAvoidCrowdingReadsValues(t *testing.T) {
	expectedValues := map[string]bool{
		"":        defaultAvoidCrowding,
		"true":    true,
		" TRUE ":  true,
		"1":       true,
		"false":   false,
		" False ": false,
		"0":       false,
	}
	for text, expectedValue := range expectedValues {
		avoidCrowding, err := parseAvoidCrowding(text)
		if err != nil {
			t.Fatalf("parseAvoidCrowding(%q) returned error: %v", text, err)
		}
		if avoidCrowding != expectedValue {
			t.Fatalf("parseAvoidCrowding(%q) = %v, want %v", text, avoidCrowding, expectedValue)
		}
	}
}

func TestParseAvoidCrowdingRejectsOtherText(t *testing.T) {
	for _, text := range []string{"yes", "no", "2", "verdadero"} {
		if _, err := parseAvoidCrowding(text); !errors.Is(err, errInvalidAvoidCrowding) {
			t.Fatalf("parseAvoidCrowding(%q) error = %v, want errInvalidAvoidCrowding", text, err)
		}
	}
}

func TestParseRoutePreferencesUsesDefaultsWhenEmpty(t *testing.T) {
	preferences, err := parseRoutePreferences("", "", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if preferences != defaultRoutePreferences() {
		t.Fatalf("preferences = %+v, want %+v", preferences, defaultRoutePreferences())
	}
}

func TestParseRoutePreferencesReadsEveryPreference(t *testing.T) {
	preferences, err := parseRoutePreferences("least_walking", "300", "false")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expectedPreferences := RoutePreferences{Priority: priorityLeastWalking, MaxWalkMeters: 300, AvoidCrowding: false}
	if preferences != expectedPreferences {
		t.Fatalf("preferences = %+v, want %+v", preferences, expectedPreferences)
	}
}

func TestParseRoutePreferencesReportsInvalidPreference(t *testing.T) {
	testCases := []struct {
		name              string
		priorityText      string
		maxWalkText       string
		avoidCrowdingText string
		expectedError     error
	}{
		{"priority", "cheapest", "", "", errInvalidRoutePriority},
		{"max walk", "", "50", "", errInvalidMaxWalk},
		{"avoid crowding", "", "", "maybe", errInvalidAvoidCrowding},
		{"first invalid wins", "cheapest", "50", "maybe", errInvalidRoutePriority},
	}
	for _, testCase := range testCases {
		_, err := parseRoutePreferences(testCase.priorityText, testCase.maxWalkText, testCase.avoidCrowdingText)
		if !errors.Is(err, testCase.expectedError) {
			t.Fatalf("%s: error = %v, want %v", testCase.name, err, testCase.expectedError)
		}
	}
}
