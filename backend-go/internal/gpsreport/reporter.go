// Package gpsreport envía a micro_service las posiciones de las micros reales, para
// que corrija los tiempos de las rutas recomendadas.
package gpsreport

import (
	"context"
	"strings"
	"sync"
	"time"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"github.com/rs/zerolog/log"
)

const (
	// SendInterval es cada cuánto se envían. Con un paradero de 80 m de radio, una
	// micro a 50 km/h alcanza a informar dentro de él.
	SendInterval = 5 * time.Second
	// maxPositionsPerReport es el límite de micro_service.
	maxPositionsPerReport = 500
	// simulatedBusPrefix es el de las micros del simulador. Usan los tiempos
	// oficiales, o acelerados, así que no informan nada sobre el tráfico.
	simulatedBusPrefix = "sim-"
)

// Sender lo implementa grpcclient.MicroClient.
type Sender interface {
	ReportPositions(requestContext context.Context, request *microv1.ReportPositionsRequest) (*microv1.ReportPositionsResponse, error)
}

// LineResolver traduce el ID de ruta de backend-go a la línea de micro_service.
// Responde false si no la conoce.
type LineResolver func(requestContext context.Context, routeID string) (lineID string, known bool)

type pendingPosition struct {
	routeID             string
	latitude, longitude float64
	receivedAt          time.Time
}

// Reporter guarda la última posición de cada micro hasta el siguiente envío. Es
// seguro usarlo desde varias goroutines.
type Reporter struct {
	sender      Sender
	resolveLine LineResolver
	now         func() time.Time
	mutex       sync.Mutex
	pending     map[string]pendingPosition
	isFailing   bool
}

func NewReporter(sender Sender, resolveLine LineResolver) *Reporter {
	return &Reporter{sender: sender, resolveLine: resolveLine, now: time.Now, pending: make(map[string]pendingPosition)}
}

// RecordPosition guarda una posición. Nunca bloquea: lo llama el Hub, que además
// reparte los mensajes del mapa.
func (reporter *Reporter) RecordPosition(busID, routeID string, latitude, longitude float64) {
	if busID == "" || routeID == "" || strings.HasPrefix(busID, simulatedBusPrefix) {
		return
	}
	reporter.mutex.Lock()
	defer reporter.mutex.Unlock()
	if _, known := reporter.pending[busID]; !known && len(reporter.pending) >= maxPositionsPerReport {
		return
	}
	reporter.pending[busID] = pendingPosition{routeID: routeID, latitude: latitude, longitude: longitude, receivedAt: reporter.now()}
}

// Run envía las posiciones hasta que se cancela el contexto.
func (reporter *Reporter) Run(runContext context.Context) {
	ticker := time.NewTicker(SendInterval)
	defer ticker.Stop()
	for {
		select {
		case <-runContext.Done():
			return
		case <-ticker.C:
			reporter.send(runContext)
		}
	}
}

// send envía lo pendiente. Si falla, se descarta: en el próximo envío habrá
// posiciones más nuevas.
func (reporter *Reporter) send(sendContext context.Context) {
	reporter.mutex.Lock()
	pending := reporter.pending
	reporter.pending = make(map[string]pendingPosition)
	reporter.mutex.Unlock()

	positions := make([]*microv1.BusPosition, 0, len(pending))
	for busID, position := range pending {
		lineID, known := reporter.resolveLine(sendContext, position.routeID)
		if !known {
			continue
		}
		positions = append(positions, &microv1.BusPosition{
			BusId: busID, RouteId: lineID, Latitude: position.latitude, Longitude: position.longitude, UnixMillis: position.receivedAt.UnixMilli(),
		})
	}
	if len(positions) == 0 {
		return
	}
	_, err := reporter.sender.ReportPositions(sendContext, &microv1.ReportPositionsRequest{Positions: positions})
	// Solo se registra el cambio: un aviso cada 5 segundos taparía los demás logs.
	if err != nil && !reporter.isFailing {
		log.Warn().Err(err).Str("event", "gps_report_failed").Msg("Could not report bus positions; routes keep the official times")
	} else if err == nil && reporter.isFailing {
		log.Info().Str("event", "gps_report_recovered").Msg("Bus positions are being reported again")
	}
	reporter.isFailing = err != nil
}
