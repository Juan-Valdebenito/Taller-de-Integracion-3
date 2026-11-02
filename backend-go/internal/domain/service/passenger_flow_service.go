package service

// PassengerFlowService transforma eventos de subida/bajada en métricas de
// flujo de pasajeros. El handler valida el transporte; el servicio aplica las
// reglas y el repositorio persiste el resultado cuando corresponde.

import "sync"

// PassengerFlowInput describe la llegada de una micro a un paradero.
type PassengerFlowInput struct {
	BusID             string
	RouteID           string
	StopIndex         int
	CurrentPassengers int
	Capacity          int
}

// PassengerFlowResult contiene el movimiento del paradero y el registro
// acumulado de la micro durante la simulacion.
type PassengerFlowResult struct {
	Boardings         int `json:"boardings"`
	Alightings        int `json:"alightings"`
	StudentBoardings  int `json:"studentBoardings"`
	RejectedBoardings int `json:"rejectedBoardings"`
	CurrentPassengers int `json:"currentPassengers"`
	TotalBoardings    int `json:"totalBoardings"`
	TotalAlightings   int `json:"totalAlightings"`
	TotalStudents     int `json:"totalStudents"`
}

type passengerFlowRecord struct {
	boardings         int
	alightings        int
	studentBoardings  int
	rejectedBoardings int
}

// PassengerFlowService calcula y registra subidas y bajadas por micro.
// Mantiene el registro en memoria para que funcione tambien sin PostgreSQL.
type PassengerFlowService struct {
	mu      sync.Mutex
	records map[string]passengerFlowRecord
}

func NewPassengerFlowService() *PassengerFlowService {
	return &PassengerFlowService{records: make(map[string]passengerFlowRecord)}
}

// ProcessStop procesa una llegada a paradero. La demanda es determinista para
// que las pruebas y la simulacion sean reproducibles, pero varia por ruta y
// paradero. Las bajadas liberan capacidad antes de calcular las subidas.
func (s *PassengerFlowService) ProcessStop(input PassengerFlowInput) PassengerFlowResult {
	// El orden importa: primero se acota el estado inicial, luego bajan pasajeros
	// y recién entonces las subidas ocupan los espacios liberados.
	capacity := input.Capacity
	if capacity < 0 {
		capacity = 0
	}
	current := clamp(input.CurrentPassengers, 0, capacity)
	alightings := calculateAlightings(current, input.StopIndex)
	available := capacity - (current - alightings)
	demand := calculateDemand(input.RouteID, input.StopIndex)
	boardings := min(demand, available)
	rejected := demand - boardings
	students := min(boardings, studentDemand(input.RouteID, input.StopIndex))

	// El simulador puede actualizar varias micros concurrentemente. El mutex
	// protege el mapa de acumulados; el cálculo previo es local a esta llamada.
	s.mu.Lock()
	defer s.mu.Unlock()

	record := s.records[input.BusID]
	record.boardings += boardings
	record.alightings += alightings
	record.studentBoardings += students
	record.rejectedBoardings += rejected
	s.records[input.BusID] = record

	return PassengerFlowResult{
		Boardings:         boardings,
		Alightings:        alightings,
		StudentBoardings:  students,
		RejectedBoardings: rejected,
		CurrentPassengers: current - alightings + boardings,
		TotalBoardings:    record.boardings,
		TotalAlightings:   record.alightings,
		TotalStudents:     record.studentBoardings,
	}
}

// Snapshot devuelve el registro acumulado de una micro.
func (s *PassengerFlowService) Snapshot(busID string) PassengerFlowResult {
	s.mu.Lock()
	defer s.mu.Unlock()
	record := s.records[busID]
	return PassengerFlowResult{
		TotalBoardings:    record.boardings,
		TotalAlightings:   record.alightings,
		TotalStudents:     record.studentBoardings,
		RejectedBoardings: record.rejectedBoardings,
	}
}

func calculateAlightings(current, stopIndex int) int {
	if current == 0 {
		return 0
	}
	amount := current / 5
	if amount == 0 {
		amount = 1
	}
	if stopIndex%4 == 0 {
		amount++
	}
	return min(amount, current)
}

func calculateDemand(routeID string, stopIndex int) int {
	seed := len(routeID)*3 + stopIndex*5
	return 1 + seed%5
}

func studentDemand(routeID string, stopIndex int) int {
	return (calculateDemand(routeID, stopIndex) + len(routeID) + stopIndex) / 3
}

func min(left, right int) int {
	if left < right {
		return left
	}
	return right
}

func clamp(value, lower, upper int) int {
	if value < lower {
		return lower
	}
	if value > upper {
		return upper
	}
	return value
}
