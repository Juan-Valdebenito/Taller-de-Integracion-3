package main

// Pruebas del servidor alrededor de RecommendRoutes: la clave interna y el uso de
// un solo grafo por petición.

import (
	"context"
	"sync"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
)

// microAuthInterceptor revisa la clave en todas las funciones, así que también
// protege RecommendRoutes sin que el método la revise.
func TestRecommendRoutesRequiresAdminKey(t *testing.T) {
	client := startUniversityGRPCClient(t, loadSeedNetwork(t).buildGraph())
	request := &microv1.RecommendRoutesRequest{Origin: stopMessage("PAR-PORTAL-01"), Destination: stopMessage("PAR-CJP-02")}

	requestContext, cancel := context.WithTimeout(context.Background(), testRequestDuration)
	t.Cleanup(cancel)
	_, err := client.RecommendRoutes(requestContext, request)
	assertGRPCCode(t, err, codes.Unauthenticated)

	wrongKeyContext := metadata.AppendToOutgoingContext(requestContext, "x-admin-key", "clave-incorrecta")
	_, err = client.RecommendRoutes(wrongKeyContext, request)
	assertGRPCCode(t, err, codes.Unauthenticated)

	response, err := client.RecommendRoutes(authorizedContext(t), request)
	if err != nil || response.GetTotal() == 0 {
		t.Fatalf("with the right key: total = %d, err = %v", response.GetTotal(), err)
	}
}

// La clave se revisa antes que todo lo demás: una petición inválida sin clave
// responde Unauthenticated, no InvalidArgument, para no dar pistas sin clave.
func TestRecommendRoutesChecksKeyBeforeRequest(t *testing.T) {
	client := startUniversityGRPCClient(t, loadSeedNetwork(t).buildGraph())
	requestContext, cancel := context.WithTimeout(context.Background(), testRequestDuration)
	t.Cleanup(cancel)
	_, err := client.RecommendRoutes(requestContext, &microv1.RecommendRoutesRequest{})
	assertGRPCCode(t, err, codes.Unauthenticated)
}

// Una petición toma el grafo una vez: si después se reemplaza, la respuesta se
// arma con el grafo con que empezó. Se prueba con el mismo paso que hace el
// método: tomar el grafo y responder con él.
func TestRecommendationUsesGraphTakenAtStart(t *testing.T) {
	store := &GraphStore{}
	store.Replace(loadSeedNetwork(t).buildGraph())
	graphAtStart := store.Get()
	store.Replace(NewTransitGraph())

	request := &microv1.RecommendRoutesRequest{Origin: stopMessage("PAR-PORTAL-01"), Destination: stopMessage("PAR-CJP-02")}
	response, err := answerRecommendRoutes(graphAtStart, request)
	if err != nil || response.GetTotal() == 0 {
		t.Fatalf("with the graph taken at start: total = %d, err = %v", response.GetTotal(), err)
	}
}

// Muchas peticiones al mismo tiempo, mientras el grafo se recarga una y otra vez:
// todas deben responder rutas válidas, porque cada una usa un grafo completo.
func TestRecommendRoutesWhileGraphReloads(t *testing.T) {
	// Los datos se leen aquí: t.Fatalf no se puede llamar desde otra goroutine.
	seedNetwork := loadSeedNetwork(t)
	graph := seedNetwork.buildGraph()
	server := recommendationServerWith(graph)
	request := &microv1.RecommendRoutesRequest{Origin: stopMessage("PAR-PORTAL-01"), Destination: stopMessage("PAR-CJP-02")}
	expectedResponse, _ := answerRecommendRoutes(graph, request)

	const concurrentClients, requestsPerClient, graphReloads = 8, 10, 40
	stopReloading := make(chan struct{})
	reloadsDone := make(chan struct{})
	go func() {
		defer close(reloadsDone)
		for reload := 0; reload < graphReloads; reload++ {
			select {
			case <-stopReloading:
				return
			default:
				server.service.store.Replace(seedNetwork.buildGraph())
			}
		}
	}()

	var clients sync.WaitGroup
	failures := make(chan string, concurrentClients*requestsPerClient)
	for client := 0; client < concurrentClients; client++ {
		clients.Add(1)
		go func() {
			defer clients.Done()
			for requestIndex := 0; requestIndex < requestsPerClient; requestIndex++ {
				response, err := server.RecommendRoutes(context.Background(), request)
				if err != nil || response.GetTotal() != expectedResponse.GetTotal() {
					failures <- "unexpected response during reload"
				}
			}
		}()
	}
	clients.Wait()
	close(stopReloading)
	<-reloadsDone
	close(failures)
	for failure := range failures {
		t.Fatal(failure)
	}
}
