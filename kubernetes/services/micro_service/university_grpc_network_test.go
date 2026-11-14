package main

import (
	"context"
	"net"
	"testing"
	"time"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
	"google.golang.org/protobuf/proto"
)

// Estas pruebas usan una conexión gRPC real, pero en memoria: pasan por la
// serialización de los mensajes y por el interceptor de la clave, sin abrir puertos.

const (
	testAdminKey        = "clave-de-prueba"
	testRequestDuration = 5 * time.Second
	inMemoryBufferBytes = 1024 * 1024
)

func startUniversityGRPCClient(t *testing.T, graph *TransitGraph) microv1.MicroServiceClient {
	t.Helper()
	store := &GraphStore{}
	store.Replace(graph)
	listener := bufconn.Listen(inMemoryBufferBytes)
	grpcServer := grpc.NewServer(grpc.UnaryInterceptor(microAuthInterceptor(testAdminKey)))
	microv1.RegisterMicroServiceServer(grpcServer, &microGRPCServer{service: &Server{store: store}})
	go func() { _ = grpcServer.Serve(listener) }()

	dialInMemory := func(ctx context.Context, _ string) (net.Conn, error) { return listener.DialContext(ctx) }
	connection, err := grpc.NewClient("passthrough:///in-memory",
		grpc.WithContextDialer(dialInMemory),
		grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = connection.Close()
		grpcServer.Stop()
	})
	return microv1.NewMicroServiceClient(connection)
}

// authorizedContext agrega la clave como lo hace el cliente de backend-go.
func authorizedContext(t *testing.T) context.Context {
	t.Helper()
	requestContext, cancel := context.WithTimeout(context.Background(), testRequestDuration)
	t.Cleanup(cancel)
	return metadata.AppendToOutgoingContext(requestContext, "x-admin-key", testAdminKey)
}

func TestGRPCListCampuses(t *testing.T) {
	client := startUniversityGRPCClient(t, loadSeedNetwork(t).buildGraph())
	response, err := client.ListCampuses(authorizedContext(t), &microv1.ListCampusesRequest{})
	if err != nil {
		t.Fatal(err)
	}
	if len(response.GetCampuses()) != len(universityCampuses) {
		t.Errorf("se esperaban %d campus y se obtuvieron %d", len(universityCampuses), len(response.GetCampuses()))
	}
}

func TestGRPCPlanUniversityRoutesFromStop(t *testing.T) {
	client := startUniversityGRPCClient(t, loadSeedNetwork(t).buildGraph())
	response, err := client.PlanUniversityRoutes(authorizedContext(t), &microv1.PlanUniversityRoutesRequest{
		OriginStopId: "PAR-PORTAL-01",
	})
	if err != nil {
		t.Fatal(err)
	}
	if response.GetTotal() != defaultUniversityRoutes || len(response.GetRoutes()) != defaultUniversityRoutes {
		t.Fatalf("se esperaban %d rutas: %+v", defaultUniversityRoutes, response)
	}
	firstRoute := response.GetRoutes()[0]
	if firstRoute.GetCampusId() != "san-francisco" || firstRoute.GetTotalTimeSeconds() != 240 || firstRoute.GetTransfers() != 0 {
		t.Errorf("primera ruta inesperada: %+v", firstRoute)
	}
	campusIDs := make(map[string]bool)
	for _, route := range response.GetRoutes() {
		campusIDs[route.GetCampusId()] = true
	}
	if !campusIDs["san-francisco"] || !campusIDs["san-juan-pablo-ii"] {
		t.Errorf("deben aparecer ambos campus: %v", campusIDs)
	}
}

func TestGRPCPlanUniversityRoutesFromLocation(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	latitude, longitude := locationNearStop(graph, "PAR-PORTAL-01")
	client := startUniversityGRPCClient(t, graph)
	response, err := client.PlanUniversityRoutes(authorizedContext(t), &microv1.PlanUniversityRoutesRequest{
		Latitude:  proto.Float64(latitude),
		Longitude: proto.Float64(longitude),
		CampusId:  "san-juan-pablo-ii",
		Limit:     2,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(response.GetRoutes()) == 0 || len(response.GetRoutes()) > 2 {
		t.Fatalf("se esperaban entre 1 y 2 rutas: %+v", response)
	}
	for _, route := range response.GetRoutes() {
		firstMovement := route.GetMovements()[0]
		if route.GetCampusId() != "san-juan-pablo-ii" || firstMovement.GetFromStopId() != userLocationID || firstMovement.GetMode() != "walk" {
			t.Errorf("la ruta debe partir caminando hacia San Juan Pablo II: %+v", route)
		}
	}
}

func TestGRPCPlanUniversityRoutesWhenAlreadyAtCampus(t *testing.T) {
	client := startUniversityGRPCClient(t, loadSeedNetwork(t).buildGraph())
	response, err := client.PlanUniversityRoutes(authorizedContext(t), &microv1.PlanUniversityRoutesRequest{
		OriginStopId: "PAR-CSF-01",
		CampusId:     "san-francisco",
	})
	if err != nil {
		t.Fatal(err)
	}
	if response.GetTotal() != 0 || len(response.GetRoutes()) != 0 {
		t.Errorf("ya está en el campus, no debe haber rutas: %+v", response)
	}
}

func assertGRPCCode(t *testing.T, err error, expectedCode codes.Code) {
	t.Helper()
	if code := status.Code(err); code != expectedCode {
		t.Errorf("se esperaba %s y se obtuvo %s (%v)", expectedCode, code, err)
	}
}

func TestGRPCUniversityRoutesRequireAdminKey(t *testing.T) {
	client := startUniversityGRPCClient(t, loadSeedNetwork(t).buildGraph())
	routeRequest := &microv1.PlanUniversityRoutesRequest{OriginStopId: "PAR-PORTAL-01"}

	requestContext, cancel := context.WithTimeout(context.Background(), testRequestDuration)
	t.Cleanup(cancel)
	_, err := client.PlanUniversityRoutes(requestContext, routeRequest)
	assertGRPCCode(t, err, codes.Unauthenticated)

	wrongKeyContext := metadata.AppendToOutgoingContext(requestContext, "x-admin-key", "clave-incorrecta")
	_, err = client.ListCampuses(wrongKeyContext, &microv1.ListCampusesRequest{})
	assertGRPCCode(t, err, codes.Unauthenticated)
}

func TestGRPCUniversityRoutesReportInvalidRequests(t *testing.T) {
	client := startUniversityGRPCClient(t, loadSeedNetwork(t).buildGraph())
	testCases := []struct {
		name         string
		routeRequest *microv1.PlanUniversityRoutesRequest
		expectedCode codes.Code
	}{
		{"sin origen", &microv1.PlanUniversityRoutesRequest{}, codes.InvalidArgument},
		{"dos orígenes", &microv1.PlanUniversityRoutesRequest{
			OriginStopId: "PAR-PORTAL-01", Latitude: proto.Float64(-38.7), Longitude: proto.Float64(-72.6),
		}, codes.InvalidArgument},
		{"falta longitud", &microv1.PlanUniversityRoutesRequest{Latitude: proto.Float64(-38.7)}, codes.InvalidArgument},
		{"coordenada fuera de rango", &microv1.PlanUniversityRoutesRequest{
			Latitude: proto.Float64(-91), Longitude: proto.Float64(-72.6),
		}, codes.InvalidArgument},
		{"límite excesivo", &microv1.PlanUniversityRoutesRequest{OriginStopId: "PAR-PORTAL-01", Limit: 6}, codes.InvalidArgument},
		{"límite negativo", &microv1.PlanUniversityRoutesRequest{OriginStopId: "PAR-PORTAL-01", Limit: -1}, codes.InvalidArgument},
		{"paradero inexistente", &microv1.PlanUniversityRoutesRequest{OriginStopId: "NO-EXISTE"}, codes.NotFound},
		{"campus inexistente", &microv1.PlanUniversityRoutesRequest{OriginStopId: "PAR-PORTAL-01", CampusId: "otro"}, codes.NotFound},
		{"lejos de la red", &microv1.PlanUniversityRoutesRequest{
			Latitude: proto.Float64(-38.0), Longitude: proto.Float64(-72.0),
		}, codes.NotFound},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := client.PlanUniversityRoutes(authorizedContext(t), testCase.routeRequest)
			assertGRPCCode(t, err, testCase.expectedCode)
		})
	}
}

func TestGRPCUniversityRoutesRequireLoadedGraph(t *testing.T) {
	client := startUniversityGRPCClient(t, nil)
	_, err := client.PlanUniversityRoutes(authorizedContext(t), &microv1.PlanUniversityRoutesRequest{OriginStopId: "PAR-PORTAL-01"})
	assertGRPCCode(t, err, codes.Unavailable)
}

// El costo viaja como double por la red: esta prueba confirma que llega sin
// cambios después de la serialización.
func TestGRPCUniversityRoutesIncludeCost(t *testing.T) {
	client := startUniversityGRPCClient(t, loadSeedNetwork(t).buildGraph())
	response, err := client.PlanUniversityRoutes(authorizedContext(t), &microv1.PlanUniversityRoutesRequest{
		OriginStopId: "PAR-PORTAL-01",
		CampusId:     "san-francisco",
		Limit:        1,
	})
	if err != nil {
		t.Fatal(err)
	}
	cost := response.GetRoutes()[0].GetCost()
	if cost.GetRide() != 240 || cost.GetWait() != 600 || cost.GetTotal() != 840 {
		t.Errorf("costo inesperado: %+v", cost)
	}
	weights := response.GetCostWeights()
	if weights.GetWalkWeight() != 2 || weights.GetAssumedHeadwaySeconds() != defaultHeadwaySeconds {
		t.Errorf("pesos inesperados: %+v", weights)
	}
}

// REST y gRPC deben entregar las mismas rutas, en el mismo orden y con el mismo
// costo, porque comparten planUniversityRoutes.
func TestGRPCAndRESTReportSameCosts(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	grpcResponse, err := client.PlanUniversityRoutes(authorizedContext(t), &microv1.PlanUniversityRoutesRequest{
		OriginStopId: "PAR-PORTAL-01",
		Limit:        5,
	})
	if err != nil {
		t.Fatal(err)
	}
	statusCode, restBody := getUniversityRoutes(t, universityTestHandler(t), "from_stop=PAR-PORTAL-01&limit=5")
	if statusCode != 200 || len(restBody.Routes) != len(grpcResponse.GetRoutes()) {
		t.Fatalf("REST entregó %d rutas y gRPC %d", len(restBody.Routes), len(grpcResponse.GetRoutes()))
	}
	for routeIndex, restRoute := range restBody.Routes {
		grpcRoute := grpcResponse.GetRoutes()[routeIndex]
		grpcCost := costBreakdownResponse{
			Ride:     grpcRoute.GetCost().GetRide(),
			Walk:     grpcRoute.GetCost().GetWalk(),
			Wait:     grpcRoute.GetCost().GetWait(),
			Transfer: grpcRoute.GetCost().GetTransfer(),
			Crowding: grpcRoute.GetCost().GetCrowding(),
			Weather:  grpcRoute.GetCost().GetWeather(),
			Total:    grpcRoute.GetCost().GetTotal(),
		}
		if grpcRoute.GetCampusId() != restRoute.CampusID || grpcCost != restRoute.Cost {
			t.Errorf("ruta %d: REST %s %+v y gRPC %s %+v", routeIndex+1, restRoute.CampusID, restRoute.Cost, grpcRoute.GetCampusId(), grpcCost)
		}
	}
}
