package push

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// fakeExpo imita el servicio de Expo: responde un ticket "ok" por mensaje, o
// DeviceNotRegistered para los tokens de la lista.
func fakeExpo(t *testing.T, unregistered ...string) (*httptest.Server, func() [][]Message, func() []string) {
	t.Helper()
	var mu sync.Mutex
	var batches [][]Message
	var auth []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var msgs []Message
		if err := json.NewDecoder(r.Body).Decode(&msgs); err != nil {
			http.Error(w, "bad", http.StatusBadRequest)
			return
		}
		mu.Lock()
		batches = append(batches, msgs)
		auth = append(auth, r.Header.Get("Authorization"))
		mu.Unlock()
		tickets := make([]map[string]any, len(msgs))
		for i, m := range msgs {
			tickets[i] = map[string]any{"status": "ok", "id": fmt.Sprintf("receipt-%d", i)}
			for _, u := range unregistered {
				if m.To == u {
					tickets[i] = map[string]any{"status": "error", "message": "no registrado", "details": map[string]string{"error": "DeviceNotRegistered"}}
				}
			}
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": tickets})
	}))
	t.Cleanup(srv.Close)
	return srv,
		func() [][]Message { mu.Lock(); defer mu.Unlock(); return batches },
		func() []string { mu.Lock(); defer mu.Unlock(); return auth }
}

func TestExpoClientSendsInBatchesOf100(t *testing.T) {
	srv, batches, auth := fakeExpo(t, "ExponentPushToken[t-150]")
	client := NewExpoClient(srv.URL, "secreto-eas")

	msgs := make([]Message, 250)
	for i := range msgs {
		msgs[i] = Message{To: fmt.Sprintf("ExponentPushToken[t-%d]", i), Title: "Hola"}
	}
	tickets, err := client.Send(context.Background(), msgs)
	if err != nil {
		t.Fatal(err)
	}
	if got := len(batches()); got != 3 {
		t.Fatalf("lotes = %d, want 3 (100+100+50)", got)
	}
	if len(tickets) != 250 || !tickets[150].DeviceNotRegistered() || tickets[149].DeviceNotRegistered() {
		t.Fatalf("tickets incorrectos: %d", len(tickets))
	}
	for _, a := range auth() {
		if a != "Bearer secreto-eas" {
			t.Errorf("Authorization = %q", a)
		}
	}
}

func TestExpoClientErrors(t *testing.T) {
	down := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer down.Close()
	if _, err := NewExpoClient(down.URL, "").Send(context.Background(), []Message{{To: "x"}}); err == nil {
		t.Error("un 503 de Expo debía ser error")
	}
	wrongCount := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	defer wrongCount.Close()
	if _, err := NewExpoClient(wrongCount.URL, "").Send(context.Background(), []Message{{To: "x"}}); err == nil {
		t.Error("menos tickets que mensajes debía ser error")
	}
}

func complaint(status domain.ComplaintStatus, response string) *domain.Complaint {
	passenger := "pas-1"
	c := &domain.Complaint{ID: "c1", Title: "Micro llena", Status: status, PassengerID: &passenger}
	if response != "" {
		c.AdminResponse = &response
	}
	return c
}

func TestComplaintMessage(t *testing.T) {
	long := strings.Repeat("á", 200)
	tests := []struct {
		name          string
		before, after *domain.Complaint
		title, body   string
		ok            bool
	}{
		{"en revisión", complaint("PENDING", ""), complaint("IN_REVIEW", "Lo revisamos"), "Tu reclamo está en revisión", "Lo revisamos", true},
		{"resuelto", complaint("IN_REVIEW", "x"), complaint("RESOLVED", "Reforzamos la frecuencia"), "Tu reclamo fue resuelto", "Reforzamos la frecuencia", true},
		{"rechazado sin respuesta usa el título", complaint("PENDING", ""), complaint("REJECTED", ""), "Tu reclamo fue rechazado", "Micro llena", true},
		{"solo nueva respuesta", complaint("IN_REVIEW", "a"), complaint("IN_REVIEW", "b"), "Respondieron tu reclamo", "b", true},
		{"sin cambios", complaint("IN_REVIEW", "a"), complaint("IN_REVIEW", "a"), "", "", false},
		{"vuelve a pendiente", complaint("IN_REVIEW", "a"), complaint("PENDING", "a"), "", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			title, body, ok := complaintMessage(tt.before, tt.after)
			if ok != tt.ok || title != tt.title || body != tt.body {
				t.Errorf("got (%q, %q, %v)", title, body, ok)
			}
		})
	}
	_, body, _ := complaintMessage(complaint("PENDING", ""), complaint("RESOLVED", long))
	if n := len([]rune(body)); n != 140 || !strings.HasSuffix(body, "…") {
		t.Errorf("respuesta larga: %d caracteres", n)
	}
}

type fakeTokens struct {
	mu      sync.Mutex
	byUser  map[string][]string
	deleted []string
	err     error
}

func (f *fakeTokens) TokensForUser(_ context.Context, userID string) ([]string, error) {
	return f.byUser[userID], f.err
}

func (f *fakeTokens) Delete(_ context.Context, tokens []string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.deleted = append(f.deleted, tokens...)
	return nil
}

func TestNotifierSendsToThePassengerPhonesAndForgetsStaleOnes(t *testing.T) {
	srv, batches, _ := fakeExpo(t, "ExponentPushToken[viejo]")
	tokens := &fakeTokens{byUser: map[string][]string{"pas-1": {"ExponentPushToken[nuevo]", "ExponentPushToken[viejo]"}}}
	n := NewComplaintNotifier(tokens, NewExpoClient(srv.URL, ""))

	n.ComplaintUpdated(complaint("PENDING", ""), complaint("RESOLVED", "Listo"))
	n.Wait()

	got := batches()
	if len(got) != 1 || len(got[0]) != 2 {
		t.Fatalf("envíos = %v", got)
	}
	msg := got[0][0]
	if msg.Title != "Tu reclamo fue resuelto" || msg.ChannelID != ComplaintChannelID || msg.Data["type"] != "complaint-status" || msg.Data["complaintId"] != "c1" || msg.Data["status"] != "RESOLVED" {
		t.Errorf("mensaje = %+v", msg)
	}
	if len(tokens.deleted) != 1 || tokens.deleted[0] != "ExponentPushToken[viejo]" {
		t.Errorf("borrados = %v", tokens.deleted)
	}
}

func TestNotifierSkipsWhenThereIsNothingToSend(t *testing.T) {
	srv, batches, _ := fakeExpo(t)
	tokens := &fakeTokens{byUser: map[string][]string{"pas-1": {"ExponentPushToken[a]"}}}
	n := NewComplaintNotifier(tokens, NewExpoClient(srv.URL, ""))

	n.ComplaintUpdated(complaint("IN_REVIEW", "a"), complaint("IN_REVIEW", "a")) // sin cambios
	noOwner := complaint("RESOLVED", "x")
	noOwner.PassengerID = nil
	n.ComplaintUpdated(complaint("PENDING", ""), noOwner) // reclamo sin pasajero
	other := &fakeTokens{byUser: map[string][]string{}}
	NewComplaintNotifier(other, NewExpoClient(srv.URL, "")).ComplaintUpdated(complaint("PENDING", ""), complaint("RESOLVED", "x")) // sin teléfonos
	failing := &fakeTokens{err: errors.New("base caída")}
	f := NewComplaintNotifier(failing, NewExpoClient(srv.URL, ""))
	f.ComplaintUpdated(complaint("PENDING", ""), complaint("RESOLVED", "x"))
	n.Wait()
	f.Wait()
	var nilNotifier *ComplaintNotifier
	nilNotifier.ComplaintUpdated(complaint("PENDING", ""), complaint("RESOLVED", "x"))

	if got := batches(); len(got) != 0 {
		t.Errorf("no debía enviar nada: %v", got)
	}
}
