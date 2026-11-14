package handler

// Comprobaciones al compilar. main.go conecta estas piezas reales al handler; si
// alguien cambia una firma, el error aparece al compilar y no en el cluster.
// Asignar un valor nil del tipo a la interfaz no ejecuta nada: solo obliga al
// compilador a revisar que el tipo la cumpla.

import (
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/currentweather"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/infrastructure/grpcclient"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/liveoccupancy"
)

var (
	_ LineOccupancySource  = (*liveoccupancy.Tracker)(nil)
	_ CurrentWeatherSource = (*currentweather.Cache)(nil)
	_ MicroRPC             = (*grpcclient.MicroClient)(nil)
	_ ClimateRPC           = (*grpcclient.ClimateClient)(nil)
)
