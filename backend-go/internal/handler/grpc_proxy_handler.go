package handler

import (
	"context"
	"net/http"
	"strconv"
	"time"

	climav1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/clima/v1"
	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"github.com/gin-gonic/gin"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type ClimateRPC interface {
	ListTelemetry(ctx context.Context, from, to time.Time, stationID string, limit int) (*climav1.ListTelemetryResponse, error)
}

type MicroRPC interface {
	ListStops(ctx context.Context, request *microv1.ListStopsRequest) (*microv1.ListStopsResponse, error)
	GetStop(ctx context.Context, request *microv1.GetStopRequest) (*microv1.Stop, error)
	ListRoutes(ctx context.Context) (*microv1.ListRoutesResponse, error)
	PlanRoute(ctx context.Context, request *microv1.PlanRouteRequest) (*microv1.RoutePlan, error)
}

type GRPCProxyHandler struct {
	climate ClimateRPC
	micro   MicroRPC
}

func NewGRPCProxyHandler(climate ClimateRPC, micro MicroRPC) *GRPCProxyHandler {
	return &GRPCProxyHandler{climate: climate, micro: micro}
}

func (h *GRPCProxyHandler) ListTelemetry(c *gin.Context) {
	from, err := time.Parse(time.RFC3339, c.Query("from"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "from debe ser una fecha RFC3339 válida"})
		return
	}
	to, err := time.Parse(time.RFC3339, c.Query("to"))
	if err != nil || !from.Before(to) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "to debe ser una fecha RFC3339 válida y posterior a from"})
		return
	}
	limit := 500
	if raw := c.Query("limit"); raw != "" {
		limit, err = strconv.Atoi(raw)
		if err != nil || limit < 1 || limit > 1000 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "limit debe estar entre 1 y 1000"})
			return
		}
	}
	response, err := h.climate.ListTelemetry(c.Request.Context(), from, to, c.Query("station_id"), limit)
	if err != nil {
		writeRPCError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": climateRecords(response), "limit": limit, "next_cursor": nil})
}

func (h *GRPCProxyHandler) ListStops(c *gin.Context) {
	request, err := stopRequest(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	response, err := h.micro.ListStops(c.Request.Context(), request)
	if err != nil {
		writeRPCError(c, err)
		return
	}
	c.JSON(http.StatusOK, response)
}

func (h *GRPCProxyHandler) GetStop(c *gin.Context) {
	response, err := h.micro.GetStop(c.Request.Context(), &microv1.GetStopRequest{StopId: c.Param("id")})
	if err != nil {
		writeRPCError(c, err)
		return
	}
	c.JSON(http.StatusOK, response)
}

func (h *GRPCProxyHandler) ListRoutes(c *gin.Context) {
	response, err := h.micro.ListRoutes(c.Request.Context())
	if err != nil {
		writeRPCError(c, err)
		return
	}
	c.JSON(http.StatusOK, response)
}

func (h *GRPCProxyHandler) PlanRoute(c *gin.Context) {
	response, err := h.micro.PlanRoute(c.Request.Context(), &microv1.PlanRouteRequest{OriginStopId: c.Query("from_stop"), DestinationStopId: c.Query("to_stop"), Mode: c.Query("preference")})
	if err != nil {
		writeRPCError(c, err)
		return
	}
	c.JSON(http.StatusOK, response)
}

func stopRequest(c *gin.Context) (*microv1.ListStopsRequest, error) {
	request := &microv1.ListStopsRequest{Limit: 50}
	if raw := c.Query("limit"); raw != "" {
		limit, err := strconv.Atoi(raw)
		if err != nil {
			return nil, err
		}
		request.Limit = int32(limit)
	}
	values := []string{c.Query("lat"), c.Query("long"), c.Query("radius_m")}
	provided := 0
	for _, value := range values {
		if value != "" {
			provided++
		}
	}
	if provided == 0 {
		return request, nil
	}
	if provided != 3 {
		return nil, &queryError{"lat, long and radius_m must all be provided"}
	}
	latitude, err := strconv.ParseFloat(values[0], 64)
	if err != nil {
		return nil, &queryError{"invalid lat"}
	}
	longitude, err := strconv.ParseFloat(values[1], 64)
	if err != nil {
		return nil, &queryError{"invalid long"}
	}
	radius, err := strconv.ParseFloat(values[2], 64)
	if err != nil {
		return nil, &queryError{"invalid radius_m"}
	}
	request.Latitude, request.Longitude, request.RadiusMeters = &latitude, &longitude, &radius
	return request, nil
}

type queryError struct{ message string }

func (e *queryError) Error() string { return e.message }

func climateRecords(response *climav1.ListTelemetryResponse) []gin.H {
	result := make([]gin.H, 0, len(response.GetRecords()))
	for _, record := range response.GetRecords() {
		result = append(result, gin.H{"time": record.GetTime(), "station_id": record.GetStationId(), "sector": record.GetSector(), "temperature_c": record.GetTemperatureC(), "humidity_pct": record.GetHumidityPct(), "wind_speed_kmh": record.GetWindSpeedKmh(), "pm25_ug_m3": record.GetPm25UgM3(), "pm10_ug_m3": record.GetPm10UgM3(), "status": record.GetStatus(), "latitude": record.GetLatitude(), "longitude": record.GetLongitude()})
	}
	return result
}

func writeRPCError(c *gin.Context, err error) {
	switch status.Code(err) {
	case codes.InvalidArgument:
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case codes.NotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case codes.Unauthenticated:
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
	case codes.DeadlineExceeded, codes.Unavailable:
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}
