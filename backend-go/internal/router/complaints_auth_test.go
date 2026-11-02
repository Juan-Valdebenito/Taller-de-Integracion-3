package router

import (
	"net/http"
	"testing"
)

// La lista, las cifras y el detalle de reclamos ya no son públicos: antes
// cualquiera, sin sesión, podía leer todos los reclamos con sus datos.
func TestComplaintReadsRequireSession(t *testing.T) {
	r := setupAttachments(t, true)
	for _, path := range []string{"/api/v1/complaints", "/api/v1/complaints/stats", "/api/v1/complaints/c1"} {
		if w := serveUsers(r, http.MethodGet, path, "", ""); w.Code != http.StatusUnauthorized {
			t.Errorf("GET %s sin token: got %d", path, w.Code)
		}
	}
	if w := serveUsers(r, http.MethodPatch, "/api/v1/complaints/c1/status", "", `{"status":"RESOLVED"}`); w.Code != http.StatusUnauthorized {
		t.Errorf("PATCH status sin token: got %d", w.Code)
	}
}

// Un pasajero no ve la lista de todos los reclamos ni las cifras (los suyos
// están en /complaints/my-complaints), ni puede cambiar estados.
func TestPassengerCannotListComplaints(t *testing.T) {
	r := setupAttachments(t, true)
	bearer := accessToken(t, "usr-pass-01", "PASSENGER")
	for _, path := range []string{"/api/v1/complaints", "/api/v1/complaints/stats"} {
		if w := serveUsers(r, http.MethodGet, path, bearer, ""); w.Code != http.StatusForbidden {
			t.Errorf("GET %s como pasajero: got %d", path, w.Code)
		}
	}
	if w := serveUsers(r, http.MethodPatch, "/api/v1/complaints/c1/status", bearer, `{"status":"RESOLVED"}`); w.Code != http.StatusForbidden {
		t.Errorf("PATCH status como pasajero: got %d", w.Code)
	}
}
