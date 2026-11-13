package handler

// Rutas hacia la universidad: backend-go valida la sesión y el formato de la
// consulta, y micro_service calcula las rutas por gRPC.

import (
	"net/http"
	"strconv"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"github.com/gin-gonic/gin"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type campusJSON struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	StopIDs []string `json:"stop_ids"`
}

// Los campos no usan omitempty: un 0 en transfers o un total vacío son datos
// válidos que la app debe recibir.
type universityRouteJSON struct {
	CampusID            string         `json:"campus_id"`
	CampusName          string         `json:"campus_name"`
	DestinationStopID   string         `json:"destination_stop_id"`
	TotalTimeSeconds    int32          `json:"total_time_seconds"`
	TotalDistanceMeters int32          `json:"total_distance_meters"`
	Transfers           int32          `json:"transfers"`
	Movements           []movementJSON `json:"movements"`
	// Cost es el costo con que micro_service ordenó la ruta.
	Cost costBreakdownJSON `json:"cost"`
}

// costBreakdownJSON es el costo de una ruta en segundos equivalentes. Sin
// omitempty: un componente en 0, como "transfer": 0, es un dato válido.
type costBreakdownJSON struct {
	Ride     float64 `json:"ride"`
	Walk     float64 `json:"walk"`
	Wait     float64 `json:"wait"`
	Transfer float64 `json:"transfer"`
	// Crowding es el recargo por viajar en micros llenas.
	Crowding float64 `json:"crowding"`
	Total    float64 `json:"total"`
}

// newCostBreakdownJSON copia el costo que calculó micro_service. Si no viene,
// por ejemplo con una versión antigua del servicio, los Get devuelven 0.
func newCostBreakdownJSON(cost *microv1.CostBreakdown) costBreakdownJSON {
	return costBreakdownJSON{
		Ride:     cost.GetRide(),
		Walk:     cost.GetWalk(),
		Wait:     cost.GetWait(),
		Transfer: cost.GetTransfer(),
		Crowding: cost.GetCrowding(),
		Total:    cost.GetTotal(),
	}
}

// costWeightsJSON son los pesos con que micro_service calculó los costos.
type costWeightsJSON struct {
	RideWeight             float64 `json:"ride_weight"`
	WalkWeight             float64 `json:"walk_weight"`
	WaitWeight             float64 `json:"wait_weight"`
	TransferPenaltySeconds float64 `json:"transfer_penalty_seconds"`
	AssumedHeadwaySeconds  int32   `json:"assumed_headway_seconds"`
}

// newCostWeightsJSON devuelve nil si micro_service no informó los pesos. En el
// JSON queda null, que es más honesto que pesos en 0: un peso 0 tendría otro
// significado.
func newCostWeightsJSON(weights *microv1.CostWeights) *costWeightsJSON {
	if weights == nil {
		return nil
	}
	return &costWeightsJSON{
		RideWeight:             weights.GetRideWeight(),
		WalkWeight:             weights.GetWalkWeight(),
		WaitWeight:             weights.GetWaitWeight(),
		TransferPenaltySeconds: weights.GetTransferPenaltySeconds(),
		AssumedHeadwaySeconds:  weights.GetAssumedHeadwaySeconds(),
	}
}

type movementJSON struct {
	FromStopID     string `json:"from_stop_id"`
	ToStopID       string `json:"to_stop_id"`
	Mode           string `json:"mode"`
	RouteID        string `json:"route_id,omitempty"`
	TripID         string `json:"trip_id,omitempty"`
	TimeSeconds    int32  `json:"time_seconds"`
	DistanceMeters int32  `json:"distance_meters"`
}

func (proxyHandler *GRPCProxyHandler) ListCampuses(ginContext *gin.Context) {
	response, err := proxyHandler.micro.ListCampuses(ginContext.Request.Context())
	if err != nil {
		writeUniversityRPCError(ginContext, err)
		return
	}
	campuses := make([]campusJSON, 0, len(response.GetCampuses()))
	for _, campus := range response.GetCampuses() {
		campuses = append(campuses, campusJSON{ID: campus.GetId(), Name: campus.GetName(), StopIDs: campus.GetStopIds()})
	}
	ginContext.JSON(http.StatusOK, gin.H{"campuses": campuses})
}

func (proxyHandler *GRPCProxyHandler) PlanUniversityRoutes(ginContext *gin.Context) {
	request, err := universityRouteRequest(ginContext)
	if err != nil {
		ginContext.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	request.LineOccupancy = proxyHandler.currentLineOccupancy()
	response, err := proxyHandler.micro.PlanUniversityRoutes(ginContext.Request.Context(), request)
	if err != nil {
		writeUniversityRPCError(ginContext, err)
		return
	}
	routes := make([]universityRouteJSON, 0, len(response.GetRoutes()))
	for _, route := range response.GetRoutes() {
		routes = append(routes, newUniversityRouteJSON(route))
	}
	ginContext.JSON(http.StatusOK, gin.H{
		"routes":       routes,
		"total":        len(routes),
		"cost_weights": newCostWeightsJSON(response.GetCostWeights()),
	})
}

// LineOccupancySource lo implementa liveoccupancy.Tracker: entrega la ocupación de
// cada línea, agrupada con la función de traducción indicada.
type LineOccupancySource interface {
	LineOccupancyBy(lineKey func(routeID string) (string, bool)) map[string]float64
}

// WithLineOccupancy conecta la ocupación en vivo. Se llama al armar el servidor,
// antes de atender peticiones.
func (proxyHandler *GRPCProxyHandler) WithLineOccupancy(source LineOccupancySource) *GRPCProxyHandler {
	proxyHandler.lineOccupancy = source
	return proxyHandler
}

// currentLineOccupancy entrega la ocupación con los IDs de micro_service. Sin
// fuente o sin micros en vivo devuelve nil, y la petición no la incluye.
func (proxyHandler *GRPCProxyHandler) currentLineOccupancy() map[string]float64 {
	if proxyHandler.lineOccupancy == nil {
		return nil
	}
	occupancy := proxyHandler.lineOccupancy.LineOccupancyBy(microLineID)
	if len(occupancy) == 0 {
		return nil
	}
	return occupancy
}

// universityRouteRequest revisa el formato. Las reglas, como el límite máximo o
// que haya un solo origen, las valida micro_service.
func universityRouteRequest(ginContext *gin.Context) (*microv1.PlanUniversityRoutesRequest, error) {
	request := &microv1.PlanUniversityRoutesRequest{
		OriginStopId: ginContext.Query("from_stop"),
		CampusId:     ginContext.Query("campus"),
	}
	if rawLimit := ginContext.Query("limit"); rawLimit != "" {
		limit, err := strconv.ParseInt(rawLimit, 10, 32)
		if err != nil {
			return nil, &queryError{"limit debe ser un número entero"}
		}
		request.Limit = int32(limit)
	}
	rawLatitude, rawLongitude := ginContext.Query("lat"), ginContext.Query("long")
	if rawLatitude == "" && rawLongitude == "" {
		return request, nil
	}
	if rawLatitude == "" || rawLongitude == "" {
		return nil, &queryError{"lat y long deben enviarse juntos"}
	}
	latitude, latitudeErr := strconv.ParseFloat(rawLatitude, 64)
	longitude, longitudeErr := strconv.ParseFloat(rawLongitude, 64)
	if latitudeErr != nil || longitudeErr != nil {
		return nil, &queryError{"lat y long deben ser números"}
	}
	request.Latitude, request.Longitude = &latitude, &longitude
	return request, nil
}

// writeUniversityRPCError trata un rechazo de la clave de micro_service como una
// falla del servidor. Un 401 haría creer a la app que venció la sesión del
// usuario, y la cerraría.
func writeUniversityRPCError(ginContext *gin.Context, err error) {
	if status.Code(err) == codes.Unauthenticated {
		ginContext.JSON(http.StatusBadGateway, gin.H{"error": "No se pudo consultar el servicio de rutas"})
		return
	}
	writeRPCError(ginContext, err)
}

func newUniversityRouteJSON(route *microv1.UniversityRoute) universityRouteJSON {
	routeJSON := universityRouteJSON{
		CampusID:            route.GetCampusId(),
		CampusName:          route.GetCampusName(),
		DestinationStopID:   route.GetDestinationStopId(),
		TotalTimeSeconds:    route.GetTotalTimeSeconds(),
		TotalDistanceMeters: route.GetTotalDistanceMeters(),
		Transfers:           route.GetTransfers(),
		Movements:           make([]movementJSON, 0, len(route.GetMovements())),
		Cost:                newCostBreakdownJSON(route.GetCost()),
	}
	for _, movement := range route.GetMovements() {
		routeJSON.Movements = append(routeJSON.Movements, movementJSON{
			FromStopID:     movement.GetFromStopId(),
			ToStopID:       movement.GetToStopId(),
			Mode:           movement.GetMode(),
			RouteID:        movement.GetRouteId(),
			TripID:         movement.GetTripId(),
			TimeSeconds:    movement.GetTimeSeconds(),
			DistanceMeters: movement.GetDistanceMeters(),
		})
	}
	return routeJSON
}
