package main

import (
	"encoding/json"
	"testing"
)

func TestRoundToTenth(t *testing.T) {
	testCases := []struct{ value, expected float64 }{
		{1140.0000000002, 1140},
		{1139.96, 1140},
		{562.54, 562.5},
		{562.55, 562.6},
		{0, 0},
	}
	for _, testCase := range testCases {
		if rounded := roundToTenth(testCase.value); rounded != testCase.expected {
			t.Errorf("%v: se esperaba %v y se obtuvo %v", testCase.value, testCase.expected, rounded)
		}
	}
}

func TestCostBreakdownResponseJSON(t *testing.T) {
	response := newCostBreakdownResponse(CostBreakdown{Ride: 300, Walk: 240, Wait: 600, Transfer: 0, Total: 1140.0000000001})
	encoded, err := json.Marshal(response)
	if err != nil {
		t.Fatal(err)
	}
	expected := `{"ride":300,"walk":240,"wait":600,"transfer":0,"crowding":0,"total":1140}`
	if string(encoded) != expected {
		t.Errorf("se esperaba %s y se obtuvo %s", expected, encoded)
	}
}
