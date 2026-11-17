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
