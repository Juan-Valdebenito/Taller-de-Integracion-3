package grpcclient

import (
	"context"
	"net"
	"testing"
	"time"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
	"google.golang.org/protobuf/proto"
)

const testMicroKey = "clave-de-prueba"

// fakeUniversityServer responde como micro_service y guarda lo que recibió, para
// comprobar que el cliente envía la petición y la clave.
type fakeUniversityServer struct {
	microv1.UnimplementedMicroServiceServer
	receivedKeys    []string
	receivedRequest *microv1.PlanUniversityRoutesRequest
}

func (server *fakeUniversityServer) rememberKey(requestContext context.Context) {
	incoming, _ := metadata.FromIncomingContext(requestContext)
	server.receivedKeys = append(server.receivedKeys, incoming.Get("x-admin-key")...)
}

func (server *fakeUniversityServer) ListCampuses(requestContext context.Context, _ *microv1.ListCampusesRequest) (*microv1.ListCampusesResponse, error) {
	server.rememberKey(requestContext)
	return &microv1.ListCampusesResponse{Campuses: []*microv1.Campus{{Id: "san-francisco", Name: "Campus San Francisco"}}}, nil
}

func (server *fakeUniversityServer) PlanUniversityRoutes(requestContext context.Context, request *microv1.PlanUniversityRoutesRequest) (*microv1.PlanUniversityRoutesResponse, error) {
	server.rememberKey(requestContext)
	server.receivedRequest = request
	return &microv1.PlanUniversityRoutesResponse{
		Routes: []*microv1.UniversityRoute{{CampusId: "san-francisco", TotalTimeSeconds: 240}},
		Total:  1,
	}, nil
}

func startFakeMicroService(t *testing.T) (*MicroClient, *fakeUniversityServer) {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	fakeServer := &fakeUniversityServer{}
	grpcServer := grpc.NewServer()
	microv1.RegisterMicroServiceServer(grpcServer, fakeServer)
	go func() { _ = grpcServer.Serve(listener) }()

	microClient, err := NewMicroClient(listener.Addr().String(), testMicroKey, 5*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = microClient.Close()
		grpcServer.Stop()
	})
	return microClient, fakeServer
}

func TestListCampusesSendsKey(t *testing.T) {
	microClient, fakeServer := startFakeMicroService(t)
	response, err := microClient.ListCampuses(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(response.GetCampuses()) != 1 || response.GetCampuses()[0].GetId() != "san-francisco" {
		t.Errorf("respuesta inesperada: %+v", response)
	}
	if len(fakeServer.receivedKeys) != 1 || fakeServer.receivedKeys[0] != testMicroKey {
		t.Errorf("se esperaba la clave en la petición: %v", fakeServer.receivedKeys)
	}
}

func TestPlanUniversityRoutesForwardsRequest(t *testing.T) {
	microClient, fakeServer := startFakeMicroService(t)
	request := &microv1.PlanUniversityRoutesRequest{
		Latitude:  proto.Float64(-38.7),
		Longitude: proto.Float64(-72.6),
		CampusId:  "san-francisco",
		Limit:     2,
	}
	response, err := microClient.PlanUniversityRoutes(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if response.GetTotal() != 1 || response.GetRoutes()[0].GetTotalTimeSeconds() != 240 {
		t.Errorf("respuesta inesperada: %+v", response)
	}
	if !proto.Equal(fakeServer.receivedRequest, request) {
		t.Errorf("la petición cambió en el camino: %+v", fakeServer.receivedRequest)
	}
	if len(fakeServer.receivedKeys) != 1 || fakeServer.receivedKeys[0] != testMicroKey {
		t.Errorf("se esperaba la clave en la petición: %v", fakeServer.receivedKeys)
	}
}

func TestPlanUniversityRoutesFailsWhenServiceIsDown(t *testing.T) {
	microClient, err := NewMicroClient(unreachableTarget, testMicroKey, 500*time.Millisecond)
	if err != nil {
		t.Fatal(err)
	}
	defer microClient.Close()
	if _, err := microClient.PlanUniversityRoutes(context.Background(), &microv1.PlanUniversityRoutesRequest{}); err == nil {
		t.Error("se esperaba un error con el servicio caído")
	}
}
