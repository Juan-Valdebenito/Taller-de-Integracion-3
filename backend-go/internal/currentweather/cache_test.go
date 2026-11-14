package currentweather

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

// fakeFetcher cuenta las consultas y responde lo que se le indique.
type fakeFetcher struct {
	mutex         sync.Mutex
	conditions    *Conditions
	responseError error
	fetchCount    int
}

func (fetcher *fakeFetcher) Fetch(context.Context) (*Conditions, error) {
	fetcher.mutex.Lock()
	defer fetcher.mutex.Unlock()
	fetcher.fetchCount++
	return fetcher.conditions, fetcher.responseError
}

func (fetcher *fakeFetcher) respond(conditions *Conditions, responseError error) {
	fetcher.mutex.Lock()
	defer fetcher.mutex.Unlock()
	fetcher.conditions, fetcher.responseError = conditions, responseError
}

func cacheWithClock(fetcher Fetcher) (*Cache, *time.Time) {
	currentTime := referenceTime
	cache := NewCache(fetcher)
	cache.now = func() time.Time { return currentTime }
	return cache, &currentTime
}

func TestCacheReusesRecentWeather(t *testing.T) {
	fetcher := &fakeFetcher{conditions: &Conditions{TemperatureC: 4}}
	cache, currentTime := cacheWithClock(fetcher)
	cache.Current(context.Background())
	*currentTime = currentTime.Add(4 * time.Minute)
	conditions := cache.Current(context.Background())
	if fetcher.fetchCount != 1 || conditions == nil || conditions.TemperatureC != 4 {
		t.Errorf("antes de 5 minutos debe reutilizar el clima: %d consultas, %+v", fetcher.fetchCount, conditions)
	}
}

func TestCacheRefreshesAfterInterval(t *testing.T) {
	fetcher := &fakeFetcher{conditions: &Conditions{TemperatureC: 4}}
	cache, currentTime := cacheWithClock(fetcher)
	cache.Current(context.Background())
	fetcher.respond(&Conditions{TemperatureC: 9}, nil)
	*currentTime = currentTime.Add(refreshInterval)
	if conditions := cache.Current(context.Background()); fetcher.fetchCount != 2 || conditions.TemperatureC != 9 {
		t.Errorf("a los 5 minutos debe renovar el clima: %d consultas, %+v", fetcher.fetchCount, conditions)
	}
}

func TestCacheKeepsLastWeatherWhenServiceFails(t *testing.T) {
	fetcher := &fakeFetcher{conditions: &Conditions{TemperatureC: 4}}
	cache, currentTime := cacheWithClock(fetcher)
	cache.Current(context.Background())
	fetcher.respond(nil, errors.New("clima_service no responde"))
	*currentTime = currentTime.Add(refreshInterval)
	if conditions := cache.Current(context.Background()); conditions == nil || conditions.TemperatureC != 4 {
		t.Errorf("si el servicio falla debe usar el último clima: %+v", conditions)
	}
}

func TestCacheDropsWeatherThatIsTooOld(t *testing.T) {
	fetcher := &fakeFetcher{conditions: &Conditions{TemperatureC: 4}}
	cache, currentTime := cacheWithClock(fetcher)
	cache.Current(context.Background())
	fetcher.respond(nil, errors.New("clima_service no responde"))
	*currentTime = currentTime.Add(maxStaleAge + time.Minute)
	if conditions := cache.Current(context.Background()); conditions != nil {
		t.Errorf("un clima de más de 30 minutos no debe usarse: %+v", conditions)
	}
}

func TestCacheDoesNotRetryFailedServiceImmediately(t *testing.T) {
	fetcher := &fakeFetcher{responseError: errors.New("clima_service no responde")}
	cache, currentTime := cacheWithClock(fetcher)
	cache.Current(context.Background())
	*currentTime = currentTime.Add(time.Minute)
	if conditions := cache.Current(context.Background()); fetcher.fetchCount != 1 || conditions != nil {
		t.Errorf("no debe insistir con un servicio caído: %d consultas, %+v", fetcher.fetchCount, conditions)
	}
}

func TestCacheFetchesOnceForSimultaneousRequests(t *testing.T) {
	fetcher := &fakeFetcher{conditions: &Conditions{TemperatureC: 4}}
	cache, _ := cacheWithClock(fetcher)
	var requests sync.WaitGroup
	for requestIndex := 0; requestIndex < 20; requestIndex++ {
		requests.Add(1)
		go func() {
			defer requests.Done()
			cache.Current(context.Background())
		}()
	}
	requests.Wait()
	if fetcher.fetchCount != 1 {
		t.Errorf("20 peticiones simultáneas deben hacer una sola consulta, y hubo %d", fetcher.fetchCount)
	}
}
