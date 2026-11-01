package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/middleware"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/telemetry"
	ws "github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/websocket"
)

var telemetryNow = time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)

type fakeAuthz struct{ problem string }

func (f fakeAuthz) CanPublish(context.Context, string, string, string, string) string {
	return f.problem
}

type fakeBuses map[string]*domain.Bus

func (f fakeBuses) FindByID(_ context.Context, id string) (*domain.Bus, error) { return f[id], nil }

type fakeLive struct{ published []ws.BusLocationData }

func (f *fakeLive) PublishInternal(data ws.BusLocationData) { f.published = append(f.published, data) }

type fakeForwarder struct{ readings []telemetry.GPSReading }

func (f *fakeForwarder) Forward(r telemetry.GPSReading) { f.readings = append(f.readings, r) }

func newTelemetryTest(problem string, withForwarder bool) (*TelemetryHandler, *fakeLive, *fakeForwarder) {
	live, fwd := &fakeLive{}, &fakeForwarder{}
	var forwarder telemetryForwarder
	if withForwarder {
		forwarder = fwd
	}
	h := NewTelemetryHandler(fakeAuthz{problem},
		fakeBuses{"bus-1": {ID: "bus-1", Patente: "DEMO-01", Capacity: 40, CurrentPassengers: 12, CompanyID: "co-a"}},
		fakeRoutes{byID: map[string]*domain.Route{"route-1": {ID: "route-1", Code: "7B", CompanyID: "co-a"}}},
		live, forwarder)
	h.now = func() time.Time { return telemetryNow }
	return h, live, fwd
}

func postGPS(h *TelemetryHandler, body string) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/telemetry/gps", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set(middleware.ContextUserID, "emp-a")
	c.Set(middleware.ContextUserRole, "COMPANY")
	h.ReportGPS(c)
	return w
}

func TestReportGPSPublishesLiveAndForwards(t *testing.T) {
	h, live, fwd := newTelemetryTest("", true)
	w := postGPS(h, `{"busId":"bus-1","routeId":"route-1","latitude":-38.73,"longitude":-72.59,"heading":-90,"speed":25,"timestamp":"2026-11-01T11:59:30Z"}`)
	if w.Code != http.StatusAccepted || !strings.Contains(w.Body.String(), `"live":true`) || !strings.Contains(w.Body.String(), `"telemetry":true`) {
		t.Fatalf("got %d %s", w.Code, w.Body.String())
	}
	if len(live.published) != 1 {
		t.Fatalf("mapa en vivo: %v", live.published)
	}
	got := live.published[0]
	if got.BusID != "bus-1" || got.RouteID != "route-1" || got.Heading != 270 || got.Capacity != 40 || got.CurrentPassengers != 12 {
		t.Errorf("publicado = %+v", got)
	}
	if len(fwd.readings) != 1 {
		t.Fatalf("micro_telemetry: %v", fwd.readings)
	}
	r := fwd.readings[0]
	// A micro_telemetry van el id de la micro y el código de la ruta.
	if r.BusID != "bus-1" || r.RouteID != "7B" || r.SpeedKMH != 25 || r.Heading != 270 ||
		r.EventID != "gps-bus-1-1793534370000" || !r.Timestamp.Equal(time.Date(2026, 11, 1, 11, 59, 30, 0, time.UTC)) {
		t.Errorf("reenviado = %+v", r)
	}
}

func TestReportGPSOldReadingGoesOnlyToHistory(t *testing.T) {
	h, live, fwd := newTelemetryTest("", true)
	// Lectura de hace 10 minutos (la app estuvo sin señal): no mueve la micro.
	w := postGPS(h, `{"busId":"bus-1","routeId":"route-1","latitude":-38.73,"longitude":-72.59,"timestamp":"2026-11-01T11:50:00Z"}`)
	if w.Code != http.StatusAccepted || !strings.Contains(w.Body.String(), `"live":false`) {
		t.Fatalf("got %d %s", w.Code, w.Body.String())
	}
	if len(live.published) != 0 || len(fwd.readings) != 1 {
		t.Errorf("mapa=%d reenviadas=%d", len(live.published), len(fwd.readings))
	}
}

func TestReportGPSWithoutTelemetryConfigured(t *testing.T) {
	h, live, _ := newTelemetryTest("", false)
	w := postGPS(h, `{"busId":"bus-1","routeId":"route-1","latitude":-38.73,"longitude":-72.59}`)
	if w.Code != http.StatusAccepted || !strings.Contains(w.Body.String(), `"telemetry":false`) || len(live.published) != 1 {
		t.Fatalf("got %d %s (mapa=%d)", w.Code, w.Body.String(), len(live.published))
	}
}

func TestReportGPSRejectsOtherCompanyBus(t *testing.T) {
	h, live, fwd := newTelemetryTest("La micro no existe o no pertenece a tu empresa", true)
	w := postGPS(h, `{"busId":"bus-1","routeId":"route-1","latitude":-38.73,"longitude":-72.59}`)
	if w.Code != http.StatusForbidden || len(live.published) != 0 || len(fwd.readings) != 0 {
		t.Fatalf("got %d %s", w.Code, w.Body.String())
	}
}

func TestReportGPSValidation(t *testing.T) {
	h, _, _ := newTelemetryTest("", true)
	for name, body := range map[string]string{
		"sin micro":          `{"routeId":"route-1","latitude":-38.7,"longitude":-72.6}`,
		"sin ruta":           `{"busId":"bus-1","latitude":-38.7,"longitude":-72.6}`,
		"sin coordenadas":    `{"busId":"bus-1","routeId":"route-1"}`,
		"latitud imposible":  `{"busId":"bus-1","routeId":"route-1","latitude":-91,"longitude":-72.6}`,
		"velocidad negativa": `{"busId":"bus-1","routeId":"route-1","latitude":-38.7,"longitude":-72.6,"speed":-1}`,
		"del futuro":         `{"busId":"bus-1","routeId":"route-1","latitude":-38.7,"longitude":-72.6,"timestamp":"2026-11-01T12:30:00Z"}`,
		"demasiado vieja":    `{"busId":"bus-1","routeId":"route-1","latitude":-38.7,"longitude":-72.6,"timestamp":"2026-11-01T10:00:00Z"}`,
		"JSON roto":          `{"busId":`,
	} {
		if w := postGPS(h, body); w.Code != http.StatusBadRequest {
			t.Errorf("%s: got %d %s", name, w.Code, w.Body.String())
		}
	}
}
