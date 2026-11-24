package currentweather

// Comprobaciones al compilar. main.go arma el clima así:
//
//	NewCache(NewProvider(climateClient))
//
// Si alguien cambia una firma, el error aparece al compilar y no en el cluster.
// Asignar un valor nil del tipo a la interfaz no ejecuta nada: solo obliga al
// compilador a revisar que el tipo la cumpla.

import "github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/infrastructure/grpcclient"

var (
	_ TelemetryLister = (*grpcclient.ClimateClient)(nil)
	_ Fetcher         = (*Provider)(nil)
)
