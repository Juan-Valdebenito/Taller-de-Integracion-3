package grpcclient

import (
	"context"
	"net"
	"testing"
	"time"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// maxTestWait es cuánto espera una prueba antes de darse por fallida. Es amplio a
// propósito: solo se agota si el cliente se queda esperando.
const maxTestWait = 5 * time.Second

// slowMicroServer recibe la petición y no responde hasta que el cliente deja de
// esperar. Avisa cuando llega y cuando nota que el cliente se fue.
type slowMicroServer struct {
	microv1.UnimplementedMicroServiceServer
	requestArrived chan struct{}
	clientLeft     chan struct{}
}

func (server *slowMicroServer) RecommendRoutes(requestContext context.Context, _ *microv1.RecommendRoutesRequest) (*microv1.RecommendRoutesResponse, error) {
	close(server.requestArrived)
	<-requestContext.Done()
	close(server.clientLeft)
	return nil, status.FromContextError(requestContext.Err()).Err()
}

func startSlowMicroService(t *testing.T, clientTimeout time.Duration) (*MicroClient, *slowMicroServer) {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	slowServer := &slowMicroServer{requestArrived: make(chan struct{}), clientLeft: make(chan struct{})}
	grpcServer := grpc.NewServer()
	microv1.RegisterMicroServiceServer(grpcServer, slowServer)
	go func() { _ = grpcServer.Serve(listener) }()

	microClient, err := NewMicroClient(listener.Addr().String(), testMicroKey, clientTimeout)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = microClient.Close()
		grpcServer.Stop()
	})
	return microClient, slowServer
}

func waitForSignal(t *testing.T, signal <-chan struct{}, description string) {
	t.Helper()
	select {
	case <-signal:
	case <-time.After(maxTestWait):
		t.Fatalf("timed out waiting for: %s", description)
	}
}

// Si micro_service no responde, el cliente se rinde al cumplirse su tiempo máximo
// y no antes, y micro_service se entera de que ya nadie espera.
func TestRecommendRoutesStopsWaitingAfterTimeout(t *testing.T) {
	const clientTimeout = 300 * time.Millisecond
	microClient, slowServer := startSlowMicroService(t, clientTimeout)
	startTime := time.Now()
	response, err := microClient.RecommendRoutes(context.Background(), &microv1.RecommendRoutesRequest{})
	elapsed := time.Since(startTime)
	if response != nil || status.Code(err) != codes.DeadlineExceeded {
		t.Fatalf("response = %v, err = %v; want only DeadlineExceeded", response, err)
	}
	if elapsed < clientTimeout || elapsed > maxTestWait {
		t.Fatalf("the client waited %v, want about %v", elapsed, clientTimeout)
	}
	waitForSignal(t, slowServer.requestArrived, "the request to reach micro_service")
	waitForSignal(t, slowServer.clientLeft, "micro_service to notice that the client left")
}
