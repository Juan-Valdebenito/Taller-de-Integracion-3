package handler

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
)

// RecaudoHandler expone los endpoints para validación Bipay / Escolar y persistencia de recaudo.
type RecaudoHandler struct {
	recaudoRepo *repository.RecaudoRepository
	aforoSvc    *service.AforoService
}

func NewRecaudoHandler(recaudoRepo *repository.RecaudoRepository, aforoSvc *service.AforoService) *RecaudoHandler {
	return &RecaudoHandler{
		recaudoRepo: recaudoRepo,
		aforoSvc:    aforoSvc,
	}
}

// recaudoRequest payload de validación de tarjeta Bipay / Pase Escolar
type recaudoRequest struct {
	BusID     string   `json:"busId" binding:"required"`
	FareType  string   `json:"fareType" binding:"required"` // BIPAY_NORMAL | BIPAY_ESCOLAR | BIPAY_ADULTO_MAYOR
	CardUID   string   `json:"cardUid"`                     // UID físico de la tarjeta Bip/TNE
	RouteID   *string  `json:"routeId"`
	TripID    *string  `json:"tripId"`
	Latitude  *float64 `json:"latitude"`
	Longitude *float64 `json:"longitude"`
}

// CreateTransaction godoc
// POST /api/v1/recaudo/transactions
// Registra una transacción de validación Bipay / Escolar, verifica el aforo vehicular estricto
// y persiste la recaudación financiera en PostgreSQL.
func (h *RecaudoHandler) CreateTransaction(c *gin.Context) {
	var body recaudoRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Parámetros inválidos: " + err.Error()})
		return
	}

	// Normalizar tipo de tarifa y determinar monto reglamentario en pesos chilenos (CLP)
	fareTypeUpper := strings.ToUpper(strings.TrimSpace(body.FareType))
	var amount int
	var fareType domain.FareType
	var isSchool bool

	switch fareTypeUpper {
	case "BIPAY_NORMAL", "NORMAL":
		fareType = domain.FareTypeBipayNormal
		amount = 700
	case "BIPAY_ESCOLAR", "ESCOLAR", "TNE":
		fareType = domain.FareTypeBipayEscolar
		amount = 240
		isSchool = true
	case "BIPAY_ADULTO_MAYOR", "ADULTO_MAYOR":
		fareType = domain.FareTypeBipayAdultoMayor
		amount = 350
	default:
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Tipo de tarifa inválida. Valores permitidos: 'BIPAY_NORMAL', 'BIPAY_ESCOLAR', 'BIPAY_ADULTO_MAYOR'",
		})
		return
	}

	// CardUID por defecto si no viene del validador de torniquete
	cardUID := body.CardUID
	if cardUID == "" {
		cardUID = fmt.Sprintf("BIP-%d", time.Now().UnixNano()%100000000)
	}

	schoolCount := 0
	if isSchool {
		schoolCount = 1
	}

	// Control estricto de aforo vehicular
	aforoResult, err := h.aforoSvc.ProcessBusFlow(c.Request.Context(), body.BusID, 1, 0, schoolCount)
	if err != nil {
		// Si falló por sobrecupo o error de capacidad
		status := "REJECTED_AFORO_FULL"
		tx := &domain.RecaudoTransaction{
			BusID:     body.BusID,
			CardUID:   cardUID,
			FareType:  fareType,
			Amount:    amount,
			Status:    status,
			RouteID:   body.RouteID,
			TripID:    body.TripID,
			Latitude:  body.Latitude,
			Longitude: body.Longitude,
		}
		_, _ = h.recaudoRepo.Create(c.Request.Context(), tx)

		c.JSON(http.StatusConflict, gin.H{
			"status":  "fail",
			"error":   "Validación rechazada: Microbús con capacidad máxima completada",
			"details": err.Error(),
		})
		return
	}

	// Persistir la transacción exitosa
	tx := &domain.RecaudoTransaction{
		BusID:     body.BusID,
		CardUID:   cardUID,
		FareType:  fareType,
		Amount:    amount,
		Status:    "APPROVED",
		RouteID:   body.RouteID,
		TripID:    body.TripID,
		Latitude:  body.Latitude,
		Longitude: body.Longitude,
	}

	persistedTx, err := h.recaudoRepo.Create(c.Request.Context(), tx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al persistir transacción: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success":     true,
		"message":     "Validación de tarifa procesada exitosamente",
		"transaction": persistedTx,
		"aforo":       aforoResult,
	})
}

// ListTransactions godoc
// GET /api/v1/recaudo/transactions
func (h *RecaudoHandler) ListTransactions(c *gin.Context) {
	var filter repository.RecaudoFilter

	if busID := c.Query("busId"); busID != "" {
		filter.BusID = &busID
	}
	if fareType := c.Query("fareType"); fareType != "" {
		filter.FareType = &fareType
	}
	if l := c.Query("limit"); l != "" {
		if val, err := strconv.Atoi(l); err == nil {
			filter.Limit = val
		}
	}
	if o := c.Query("offset"); o != "" {
		if val, err := strconv.Atoi(o); err == nil {
			filter.Offset = val
		}
	}

	list, err := h.recaudoRepo.FindAll(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al consultar transacciones: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"count": len(list),
		"data":  list,
	})
}

// GetSummary godoc
// GET /api/v1/recaudo/summary
func (h *RecaudoHandler) GetSummary(c *gin.Context) {
	var busID *string
	if b := c.Query("busId"); b != "" {
		busID = &b
	}

	summary, err := h.recaudoRepo.GetSummary(c.Request.Context(), busID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener resumen de recaudo: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"summary": summary,
	})
}
