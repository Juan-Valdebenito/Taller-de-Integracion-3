package push

import (
	"context"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/rs/zerolog/log"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// Sender envía mensajes (lo implementa ExpoClient).
type Sender interface {
	Send(ctx context.Context, messages []Message) ([]Ticket, error)
}

// TokenStore da los teléfonos de una cuenta y olvida los que ya no sirven
// (lo implementa repository.PushTokenRepository).
type TokenStore interface {
	TokensForUser(ctx context.Context, userID string) ([]string, error)
	Delete(ctx context.Context, tokens []string) error
}

// ComplaintChannelID es el canal de Android de estos avisos (lo crea la app).
const ComplaintChannelID = "complaint-updates"

// sendTimeout limita cuánto puede tardar un aviso (va aparte de la petición).
const sendTimeout = 15 * time.Second

// ComplaintNotifier avisa al pasajero cuando cambia el estado de su reclamo o
// le responden. Envía en segundo plano: la API no espera a Expo.
type ComplaintNotifier struct {
	tokens TokenStore
	sender Sender
	wg     sync.WaitGroup
}

func NewComplaintNotifier(tokens TokenStore, sender Sender) *ComplaintNotifier {
	return &ComplaintNotifier{tokens: tokens, sender: sender}
}

// complaintMessage arma el título y el texto del aviso; ok=false si no hay
// nada que avisar (sin cambios, o vuelve a pendiente).
func complaintMessage(before, after *domain.Complaint) (title, body string, ok bool) {
	statusChanged := before.Status != after.Status
	responseChanged := value(before.AdminResponse) != value(after.AdminResponse) && value(after.AdminResponse) != ""
	if !statusChanged && !responseChanged {
		return "", "", false
	}
	switch {
	case statusChanged && after.Status == domain.ComplaintStatusInReview:
		title = "Tu reclamo está en revisión"
	case statusChanged && after.Status == domain.ComplaintStatusResolved:
		title = "Tu reclamo fue resuelto"
	case statusChanged && after.Status == domain.ComplaintStatusRejected:
		title = "Tu reclamo fue rechazado"
	case statusChanged:
		return "", "", false
	default:
		title = "Respondieron tu reclamo"
	}
	body = after.Title
	if response := value(after.AdminResponse); response != "" {
		body = truncate(response, 140)
	}
	if body == "" {
		body = "Abre TransitHub para ver el detalle."
	}
	return title, body, true
}

// ComplaintUpdated envía el aviso (si corresponde) a los teléfonos del pasajero
// dueño del reclamo. No bloquea: el envío corre aparte, con tiempo límite.
func (n *ComplaintNotifier) ComplaintUpdated(before, after *domain.Complaint) {
	if n == nil || before == nil || after == nil || after.PassengerID == nil || *after.PassengerID == "" {
		return
	}
	title, body, ok := complaintMessage(before, after)
	if !ok {
		return
	}
	passengerID, complaintID, status := *after.PassengerID, after.ID, string(after.Status)
	n.wg.Add(1)
	go func() {
		defer n.wg.Done()
		ctx, cancel := context.WithTimeout(context.Background(), sendTimeout)
		defer cancel()
		n.send(ctx, passengerID, Message{
			Title:     title,
			Body:      body,
			Sound:     "default",
			ChannelID: ComplaintChannelID,
			Data:      map[string]string{"type": "complaint-status", "complaintId": complaintID, "status": status},
		})
	}()
}

func (n *ComplaintNotifier) send(ctx context.Context, userID string, template Message) {
	tokens, err := n.tokens.TokensForUser(ctx, userID)
	if err != nil {
		log.Warn().Err(err).Str("event", "push_tokens_failed").Msg("Could not read push tokens")
		return
	}
	if len(tokens) == 0 {
		return
	}
	messages := make([]Message, len(tokens))
	for i, token := range tokens {
		messages[i] = template
		messages[i].To = token
	}
	tickets, err := n.sender.Send(ctx, messages)
	if err != nil {
		log.Warn().Err(err).Str("event", "push_send_failed").Int("devices", len(tokens)).Msg("Could not send push notification")
	}
	// Tokens que Expo ya no reconoce: se olvidan para no volver a usarlos.
	var stale []string
	for i, ticket := range tickets {
		if i < len(tokens) && ticket.DeviceNotRegistered() {
			stale = append(stale, tokens[i])
		}
	}
	if len(stale) > 0 {
		if err := n.tokens.Delete(ctx, stale); err != nil {
			log.Warn().Err(err).Str("event", "push_token_cleanup_failed").Msg("Could not delete stale push tokens")
		}
	}
}

// Wait espera los envíos en curso (para los tests y el apagado del servidor).
func (n *ComplaintNotifier) Wait() {
	if n != nil {
		n.wg.Wait()
	}
}

func value(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func truncate(s string, max int) string {
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	runes := []rune(s)
	return string(runes[:max-1]) + "…"
}
