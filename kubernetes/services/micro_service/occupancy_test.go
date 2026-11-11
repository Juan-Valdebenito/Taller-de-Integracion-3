package main

import (
	"math"
	"testing"
)

func TestCrowdingFactorByLevel(t *testing.T) {
	testCases := []struct {
		occupancyRatio float64
		expectedFactor float64
	}{
		{0, 1.0},
		{0.39, 1.0},
		{0.4, 1.1},
		{0.69, 1.1},
		{0.7, 1.3},
		{0.89, 1.3},
		{0.9, 1.6},
		{1.0, 1.6},
		{1.3, 1.6},
	}
	for _, testCase := range testCases {
		if factor := crowdingFactor(testCase.occupancyRatio); factor != testCase.expectedFactor {
			t.Errorf("ocupación %v: se esperaba %v y se obtuvo %v", testCase.occupancyRatio, testCase.expectedFactor, factor)
		}
	}
}

func TestCrowdingFactorIgnoresImpossibleValues(t *testing.T) {
	for _, occupancyRatio := range []float64{-0.5, math.NaN()} {
		if factor := crowdingFactor(occupancyRatio); factor != 1 {
			t.Errorf("ocupación %v: un valor imposible no debe penalizar, y se obtuvo %v", occupancyRatio, factor)
		}
	}
}

func TestCrowdingFactorNeverBelowOne(t *testing.T) {
	for occupancyRatio := 0.0; occupancyRatio <= 1.5; occupancyRatio += 0.01 {
		if factor := crowdingFactor(occupancyRatio); factor < 1 {
			t.Fatalf("ocupación %v: el factor %v es menor que 1", occupancyRatio, factor)
		}
	}
}

func TestLineOccupancyFactorFor(t *testing.T) {
	occupancy := LineOccupancy{"L7A": 0.95, "L7B": 0.2}
	if factor := occupancy.factorFor("L7A"); factor != 1.6 {
		t.Errorf("la 7A va llena: se esperaba 1.6 y se obtuvo %v", factor)
	}
	if factor := occupancy.factorFor("L7B"); factor != 1.0 {
		t.Errorf("la 7B va vacía: se esperaba 1 y se obtuvo %v", factor)
	}
	if factor := occupancy.factorFor("L1C"); factor != 1.0 {
		t.Errorf("sin datos de la 1C no debe penalizar, y se obtuvo %v", factor)
	}
	var noOccupancy LineOccupancy
	if factor := noOccupancy.factorFor("L7A"); factor != 1.0 {
		t.Errorf("sin ninguna ocupación no debe penalizar, y se obtuvo %v", factor)
	}
}
