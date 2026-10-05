package transport

import (
	"context"
	"fmt"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"

	predictionpb "github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/transport/proto"
)

// GRPCPredictionClient implementa PredictionClient usando gRPC.
// Utiliza el stub generado PredictionServiceClient definido en prediction_grpc.pb.go.
//
// Ventajas sobre HTTP en comunicación interna:
//   - Menor overhead de serialización (protobuf binario vs JSON)
//   - Tipado fuerte mediante el contrato proto
//   - Multiplexación HTTP/2 nativa
type GRPCPredictionClient struct {
	conn   *grpc.ClientConn
	client predictionpb.PredictionServiceClient
	addr   string
}

// NewGRPCPredictionClient crea un cliente gRPC hacia el microservicio de predicción.
//
// addr debe tener el formato "host:puerto" (ej: "localhost:50051").
// La conexión se establece con credenciales inseguras; en producción se deben
// agregar TLS mediante grpc.WithTransportCredentials(credentials.NewTLS(...)).
func NewGRPCPredictionClient(addr string) (*GRPCPredictionClient, error) {
	if addr == "" {
		return nil, fmt.Errorf("grpc: dirección del servidor no puede estar vacía")
	}

	// Opciones de conexión:
	// - insecure: para desarrollo/red interna. Reemplazar con TLS en producción.
	// - WithBlock + timeout: falla rápido si el servidor no está disponible.
	dialCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, err := grpc.DialContext( //nolint:staticcheck // DialContext se mantiene por compatibilidad con grpc v1.x
		dialCtx,
		addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
	if err != nil {
		return nil, fmt.Errorf("grpc: no se pudo conectar a %s: %w", addr, err)
	}

	return &GRPCPredictionClient{
		conn:   conn,
		client: predictionpb.NewPredictionServiceClient(conn),
		addr:   addr,
	}, nil
}

// Predict envía una solicitud de predicción al servidor gRPC y mapea
// la respuesta al DTO de dominio PredictResponse.
//
// Manejo de errores:
//   - codes.Unavailable → el servidor ML no está disponible
//   - codes.DeadlineExceeded → timeout superado
//   - codes.InvalidArgument → datos de entrada inválidos
//
// El llamador debe usar context.WithTimeout para garantizar SLAs.
func (c *GRPCPredictionClient) Predict(ctx context.Context, req PredictRequest) (*PredictResponse, error) {
	start := time.Now()

	// Construir el mensaje protobuf a partir del DTO
	pbReq := &predictionpb.PredictionRequest{
		RouteId:           req.RouteID,
		CurrentPassengers: int32(req.CurrentPassengers),
		Capacity:          int32(req.Capacity),
	}

	// Aplicar hora y día si se proveen explícitamente
	if req.Hour != nil {
		pbReq.Hour = int32(*req.Hour)
	} else {
		pbReq.Hour = int32(time.Now().Hour())
	}

	if req.DayOfWeek != nil {
		pbReq.DayOfWeek = int32(*req.DayOfWeek)
	} else {
		pbReq.DayOfWeek = int32(time.Now().Weekday())
	}

	// Llamada gRPC
	pbResp, err := c.client.Predict(ctx, pbReq)
	if err != nil {
		return nil, mapGRPCError(err, c.addr)
	}

	// Mapeo de respuesta protobuf → DTO de dominio
	return &PredictResponse{
		PredictedRatio:      pbResp.GetPredictedRatio(),
		PredictedPassengers: int(pbResp.GetPredictedPassengers()),
		OccupancyLevel:      pbResp.GetOccupancyLevel(),
		Confidence:          pbResp.GetConfidence(),
		PredictorName:       pbResp.GetPredictorName(),
		PredictedAt:         pbResp.GetPredictedAt(),
		Latency:             time.Since(start),
	}, nil
}

// Close cierra la conexión gRPC y libera los recursos asociados.
// Siempre debe llamarse cuando ya no se necesite el cliente.
func (c *GRPCPredictionClient) Close() error {
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

// mapGRPCError traduce errores del framework gRPC a errores descriptivos
// del dominio, preservando el error original con %w para inspección.
func mapGRPCError(err error, addr string) error {
	st, ok := status.FromError(err)
	if !ok {
		return fmt.Errorf("grpc: error desconocido desde %s: %w", addr, err)
	}

	switch st.Code() {
	case codes.Unavailable:
		return fmt.Errorf("grpc: servidor ML no disponible en %s: %w", addr, err)
	case codes.DeadlineExceeded:
		return fmt.Errorf("grpc: timeout al llamar servidor ML en %s: %w", addr, err)
	case codes.InvalidArgument:
		return fmt.Errorf("grpc: argumento inválido para servidor ML: %s: %w", st.Message(), err)
	case codes.Unimplemented:
		return fmt.Errorf("grpc: método Predict no implementado en servidor ML en %s: %w", addr, err)
	default:
		return fmt.Errorf("grpc: error %s desde servidor ML en %s: %w", st.Code(), addr, err)
	}
}
