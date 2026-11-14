package currentweather

import (
	"context"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

const (
	// refreshInterval evita consultar clima_service en cada petición de rutas: el
	// clima no cambia tanto en 5 minutos.
	refreshInterval = 5 * time.Minute
	// maxStaleAge es cuánto puede usarse el último clima si clima_service falla.
	// Pasado ese tiempo, es mejor calcular sin clima que con uno viejo.
	maxStaleAge = 30 * time.Minute
	// fetchTimeout limita la espera: una ruta no debe demorarse por el clima.
	fetchTimeout = 2 * time.Second
)

// Fetcher lo implementa Provider.
type Fetcher interface {
	Fetch(requestContext context.Context) (*Conditions, error)
}

// Cache guarda el último clima y lo renueva cada cierto tiempo. Las fallas de
// clima_service nunca impiden calcular rutas: en el peor caso, no hay clima.
type Cache struct {
	fetcher       Fetcher
	mutex         sync.Mutex
	conditions    *Conditions
	conditionsAt  time.Time
	lastAttemptAt time.Time
	now           func() time.Time
}

func NewCache(fetcher Fetcher) *Cache {
	return &Cache{fetcher: fetcher, now: time.Now}
}

// Current entrega el clima actual, o nil si no se conoce. Consulta clima_service
// como máximo una vez cada refreshInterval, aunque la consulta anterior haya
// fallado, para no insistir con un servicio caído. El mutex hace que peticiones
// simultáneas esperen una sola consulta en vez de hacer varias.
func (cache *Cache) Current(requestContext context.Context) *Conditions {
	cache.mutex.Lock()
	defer cache.mutex.Unlock()
	currentTime := cache.now()
	if cache.lastAttemptAt.IsZero() || currentTime.Sub(cache.lastAttemptAt) >= refreshInterval {
		cache.lastAttemptAt = currentTime
		cache.refresh(requestContext, currentTime)
	}
	if cache.conditions == nil || currentTime.Sub(cache.conditionsAt) > maxStaleAge {
		return nil
	}
	return cache.conditions
}

func (cache *Cache) refresh(requestContext context.Context, currentTime time.Time) {
	fetchContext, cancel := context.WithTimeout(requestContext, fetchTimeout)
	defer cancel()
	conditions, err := cache.fetcher.Fetch(fetchContext)
	if err != nil {
		log.Warn().Err(err).Str("event", "weather_fetch_failed").Msg("Could not fetch current weather; using the last known value")
		return
	}
	cache.conditions, cache.conditionsAt = conditions, currentTime
}
