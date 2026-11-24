package main

import (
	"strings"
	"testing"
)

func TestIsInServiceArea(t *testing.T) {
	if !isInServiceArea(-38.7369, -72.6013) {
		t.Error("un paradero de Temuco debe estar dentro del área")
	}
	if isInServiceArea(-38.5666, -72.7388) {
		t.Error("un paradero al norte del área debe quedar fuera")
	}
}

func TestIsUsefulStopName(t *testing.T) {
	if isUsefulStopName(" Paradero ") {
		t.Error("un nombre genérico no es útil")
	}
	if !isUsefulStopName("Hospital Regional") {
		t.Error("un nombre propio es útil")
	}
}

func TestStableStopID(t *testing.T) {
	if stopID := stableStopID("node/1095184413"); stopID != "PAR-OSM-1095184413" {
		t.Errorf("ID inesperado: %s", stopID)
	}
}

func TestBuildStopName(t *testing.T) {
	cases := []struct {
		address  NominatimAddress
		expected string
	}{
		{NominatimAddress{Road: "Avenida Alemania", Suburb: "Centro", City: "Temuco"}, "Avenida Alemania, Centro"},
		{NominatimAddress{Road: "Avenida Alemania"}, "Avenida Alemania"},
		{NominatimAddress{City: "Temuco"}, "Temuco"},
		{NominatimAddress{}, ""},
	}
	for _, testCase := range cases {
		if stopName := buildStopName(testCase.address); stopName != testCase.expected {
			t.Errorf("se esperaba %q y se obtuvo %q", testCase.expected, stopName)
		}
	}
}

func TestFormatStopRowEscapesAndPutsLongitudeFirst(t *testing.T) {
	stopRow := formatStopRow("PAR-OSM-1", "D'Orbigny", -38.7, -72.6)
	if !strings.Contains(stopRow, "'D''Orbigny'") {
		t.Errorf("la comilla no se escapó: %s", stopRow)
	}
	if !strings.Contains(stopRow, "ST_MakePoint(-72.600000, -38.700000)") {
		t.Errorf("la longitud debe ir primero: %s", stopRow)
	}
}

func TestFormatStopRowLimitsNameLength(t *testing.T) {
	stopRow := formatStopRow("PAR-OSM-1", strings.Repeat("ñ", maxStopNameLength+10), -38.7, -72.6)
	if strings.Count(stopRow, "ñ") != maxStopNameLength {
		t.Errorf("el nombre debe tener como máximo %d caracteres", maxStopNameLength)
	}
}
