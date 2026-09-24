package service

import (
	"errors"
	"testing"
)

func TestCalculateStrictAforo_TableDriven(t *testing.T) {
	svc := NewAforoService(nil)

	tests := []struct {
		name                 string
		input                AforoCalculationInput
		expectedPassengers   int
		expectedPercentage   float64
		expectedAvailable    int
		expectedExcess       int
		expectedIsFull       bool
		expectedIsOver       bool
		expectedStatus       AforoStatus
		expectError          bool
		expectedSpecificErr  error
	}{
		{
			name: "Caso 1: Vehículo vacío sin movimiento (Límite inferior 0%)",
			input: AforoCalculationInput{
				Capacity:          40,
				CurrentPassengers: 0,
				Boardings:         0,
				Alightings:        0,
			},
			expectedPassengers:  0,
			expectedPercentage:  0.0,
			expectedAvailable:   40,
			expectedExcess:      0,
			expectedIsFull:      false,
			expectedIsOver:      false,
			expectedStatus:      AforoStatusLow,
			expectError:         false,
		},
		{
			name: "Caso 2: Umbral inferior LOW (< 40%) - 37.5%",
			input: AforoCalculationInput{
				Capacity:          40,
				CurrentPassengers: 10,
				Boardings:         5,
				Alightings:        0,
			},
			expectedPassengers:  15,
			expectedPercentage:  37.5,
			expectedAvailable:   25,
			expectedExcess:      0,
			expectedIsFull:      false,
			expectedIsOver:      false,
			expectedStatus:      AforoStatusLow,
			expectError:         false,
		},
		{
			name: "Caso 3: Límite exacto de transición LOW a MEDIUM (40.0%)",
			input: AforoCalculationInput{
				Capacity:          40,
				CurrentPassengers: 16,
				Boardings:         0,
				Alightings:        0,
			},
			expectedPassengers:  16,
			expectedPercentage:  40.0,
			expectedAvailable:   24,
			expectedExcess:      0,
			expectedIsFull:      false,
			expectedIsOver:      false,
			expectedStatus:      AforoStatusMedium,
			expectError:         false,
		},
		{
			name: "Caso 4: Límite exacto de transición MEDIUM a HIGH (70.0%)",
			input: AforoCalculationInput{
				Capacity:          40,
				CurrentPassengers: 25,
				Boardings:         5,
				Alightings:        2,
			},
			expectedPassengers:  28,
			expectedPercentage:  70.0,
			expectedAvailable:   12,
			expectedExcess:      0,
			expectedIsFull:      false,
			expectedIsOver:      false,
			expectedStatus:      AforoStatusHigh,
			expectError:         false,
		},
		{
			name: "Caso 5: Límite exacto de transición HIGH a FULL (90.0%)",
			input: AforoCalculationInput{
				Capacity:          40,
				CurrentPassengers: 36,
				Boardings:         0,
				Alightings:        0,
			},
			expectedPassengers:  36,
			expectedPercentage:  90.0,
			expectedAvailable:   4,
			expectedExcess:      0,
			expectedIsFull:      false,
			expectedIsOver:      false,
			expectedStatus:      AforoStatusFull,
			expectError:         false,
		},
		{
			name: "Caso 6: Justo 1 pasajero antes del 100% de capacidad (39/40 = 97.5%)",
			input: AforoCalculationInput{
				Capacity:          40,
				CurrentPassengers: 39,
				Boardings:         0,
				Alightings:        0,
			},
			expectedPassengers:  39,
			expectedPercentage:  97.5,
			expectedAvailable:   1,
			expectedExcess:      0,
			expectedIsFull:      false,
			expectedIsOver:      false,
			expectedStatus:      AforoStatusFull,
			expectError:         false,
		},
		{
			name: "Caso 7: Capacidad máxima exacta (100.0% - Límite de capacidad nominal)",
			input: AforoCalculationInput{
				Capacity:          40,
				CurrentPassengers: 35,
				Boardings:         5,
				Alightings:        0,
			},
			expectedPassengers:  40,
			expectedPercentage:  100.0,
			expectedAvailable:   0,
			expectedExcess:      0,
			expectedIsFull:      true,
			expectedIsOver:      false,
			expectedStatus:      AforoStatusFull,
			expectError:         false,
		},
		{
			name: "Caso 8: Sobrecapacidad por 1 pasajero (41/40 = 102.5% - Sobrecupo)",
			input: AforoCalculationInput{
				Capacity:          40,
				CurrentPassengers: 40,
				Boardings:         1,
				Alightings:        0,
			},
			expectedPassengers:  41,
			expectedPercentage:  102.5,
			expectedAvailable:   0,
			expectedExcess:      1,
			expectedIsFull:      true,
			expectedIsOver:      true,
			expectedStatus:      AforoStatusOverCapacity,
			expectError:         false,
		},
		{
			name: "Caso 9: Sobrecupo crítico extremo (60 pasajeros en bus de 40 = 150%)",
			input: AforoCalculationInput{
				Capacity:          40,
				CurrentPassengers: 40,
				Boardings:         20,
				Alightings:        0,
			},
			expectedPassengers:  60,
			expectedPercentage:  150.0,
			expectedAvailable:   0,
			expectedExcess:      20,
			expectedIsFull:      true,
			expectedIsOver:      true,
			expectedStatus:      AforoStatusOverCapacity,
			expectError:         false,
		},
		{
			name: "Caso 10: Vaciado total del bus (35 pasajeros descienden a la vez -> 0)",
			input: AforoCalculationInput{
				Capacity:          35,
				CurrentPassengers: 35,
				Boardings:         0,
				Alightings:        35,
			},
			expectedPassengers:  0,
			expectedPercentage:  0.0,
			expectedAvailable:   35,
			expectedExcess:      0,
			expectedIsFull:      false,
			expectedIsOver:      false,
			expectedStatus:      AforoStatusLow,
			expectError:         false,
		},
		{
			name: "Caso 11: Intercambio fluido con subidas y bajadas simultáneas",
			input: AforoCalculationInput{
				Capacity:          35,
				CurrentPassengers: 20,
				Boardings:         10,
				Alightings:        15,
			},
			expectedPassengers:  15,
			expectedPercentage:  42.86,
			expectedAvailable:   20,
			expectedExcess:      0,
			expectedIsFull:      false,
			expectedIsOver:      false,
			expectedStatus:      AforoStatusMedium,
			expectError:         false,
		},
		{
			name: "Caso 12: ERROR - Bajadas superan pasajeros actuales (Subflow / Anomaly)",
			input: AforoCalculationInput{
				Capacity:          40,
				CurrentPassengers: 5,
				Boardings:         0,
				Alightings:        6,
			},
			expectError:         true,
			expectedSpecificErr: ErrAlightingsExceedPassengers,
		},
		{
			name: "Caso 13: ERROR - Bajadas superan actuales más subidas",
			input: AforoCalculationInput{
				Capacity:          40,
				CurrentPassengers: 5,
				Boardings:         2,
				Alightings:        8,
			},
			expectError:         true,
			expectedSpecificErr: ErrAlightingsExceedPassengers,
		},
		{
			name: "Caso 14: ERROR - Capacidad cero",
			input: AforoCalculationInput{
				Capacity:          0,
				CurrentPassengers: 0,
				Boardings:         0,
				Alightings:        0,
			},
			expectError:         true,
			expectedSpecificErr: ErrInvalidCapacity,
		},
		{
			name: "Caso 15: ERROR - Capacidad negativa",
			input: AforoCalculationInput{
				Capacity:          -30,
				CurrentPassengers: 0,
				Boardings:         0,
				Alightings:        0,
			},
			expectError:         true,
			expectedSpecificErr: ErrInvalidCapacity,
		},
		{
			name: "Caso 16: ERROR - Pasajeros actuales negativos",
			input: AforoCalculationInput{
				Capacity:          40,
				CurrentPassengers: -1,
				Boardings:         0,
				Alightings:        0,
			},
			expectError:         true,
			expectedSpecificErr: ErrNegativePassengers,
		},
		{
			name: "Caso 17: ERROR - Subidas negativas",
			input: AforoCalculationInput{
				Capacity:          40,
				CurrentPassengers: 10,
				Boardings:         -2,
				Alightings:        0,
			},
			expectError:         true,
			expectedSpecificErr: ErrNegativePassengers,
		},
		{
			name: "Caso 18: ERROR - Bajadas negativas",
			input: AforoCalculationInput{
				Capacity:          40,
				CurrentPassengers: 10,
				Boardings:         0,
				Alightings:        -5,
			},
			expectError:         true,
			expectedSpecificErr: ErrNegativePassengers,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res, err := svc.CalculateStrictAforo(tt.input)

			if tt.expectError {
				if err == nil {
					t.Fatalf("se esperaba un error pero el cálculo fue exitoso")
				}
				if tt.expectedSpecificErr != nil && !errors.Is(err, tt.expectedSpecificErr) {
					t.Fatalf("se esperaba error %v, se obtuvo %v", tt.expectedSpecificErr, err)
				}
				return
			}

			if err != nil {
				t.Fatalf("error inesperado en cálculo de aforo: %v", err)
			}

			if res.CurrentPassengers != tt.expectedPassengers {
				t.Errorf("CurrentPassengers = %d; se esperaba %d", res.CurrentPassengers, tt.expectedPassengers)
			}
			if res.OccupancyPercentage != tt.expectedPercentage {
				t.Errorf("OccupancyPercentage = %f; se esperaba %f", res.OccupancyPercentage, tt.expectedPercentage)
			}
			if res.AvailableCapacity != tt.expectedAvailable {
				t.Errorf("AvailableCapacity = %d; se esperaba %d", res.AvailableCapacity, tt.expectedAvailable)
			}
			if res.ExcessPassengers != tt.expectedExcess {
				t.Errorf("ExcessPassengers = %d; se esperaba %d", res.ExcessPassengers, tt.expectedExcess)
			}
			if res.IsFull != tt.expectedIsFull {
				t.Errorf("IsFull = %v; se esperaba %v", res.IsFull, tt.expectedIsFull)
			}
			if res.IsOverCapacity != tt.expectedIsOver {
				t.Errorf("IsOverCapacity = %v; se esperaba %v", res.IsOverCapacity, tt.expectedIsOver)
			}
			if res.Status != tt.expectedStatus {
				t.Errorf("Status = %s; se esperaba %s", res.Status, tt.expectedStatus)
			}
		})
	}
}

func TestCanAcceptBoarding_TableDriven(t *testing.T) {
	svc := NewAforoService(nil)

	tests := []struct {
		name              string
		currentPassengers int
		capacity          int
		requested         int
		expectedAllowed   bool
		expectedSeats     int
		expectError       bool
	}{
		{"Bus vacío acepta grupo completo dentro de capacidad", 0, 40, 10, true, 10, false},
		{"Bus con espacio parcial acepta grupo exacto", 30, 40, 10, true, 10, false},
		{"Bus con espacio parcial acepta solo parte del grupo", 35, 40, 10, false, 5, false},
		{"Bus lleno rechaza nuevos ingresos (0 asientos disponibles)", 40, 40, 3, false, 0, false},
		{"Bus sobrecargado rechaza ingresos (0 asientos disponibles)", 45, 40, 1, false, 0, false},
		{"Capacidad inválida retorna error", 10, 0, 5, false, 0, true},
		{"Pasajeros negativos retorna error", -2, 40, 5, false, 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			allowed, seats, err := svc.CanAcceptBoarding(tt.currentPassengers, tt.capacity, tt.requested)
			if tt.expectError {
				if err == nil {
					t.Fatalf("se esperaba error")
				}
				return
			}
			if err != nil {
				t.Fatalf("error inesperado: %v", err)
			}
			if allowed != tt.expectedAllowed {
				t.Errorf("allowed = %v, se esperaba %v", allowed, tt.expectedAllowed)
			}
			if seats != tt.expectedSeats {
				t.Errorf("seats = %d, se esperaba %d", seats, tt.expectedSeats)
			}
		})
	}
}
