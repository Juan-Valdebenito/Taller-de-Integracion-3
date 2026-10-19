package config

import (
	"reflect"
	"testing"
)

func TestRateLimitDefaults(t *testing.T) {
	for _, key := range []string{"RATE_LIMIT_ENABLED", "RATE_LIMIT_AUTH_PER_MIN", "RATE_LIMIT_AUTH_BURST",
		"RATE_LIMIT_TOKEN_PER_MIN", "RATE_LIMIT_TOKEN_BURST", "TRUSTED_PROXIES"} {
		t.Setenv(key, "")
	}
	cfg := Load()

	if !cfg.RateLimitEnabled {
		t.Fatal("rate limiting must be enabled by default")
	}
	if cfg.AuthRateLimitPerMin != 10 || cfg.AuthRateLimitBurst != 5 {
		t.Fatalf("unexpected auth defaults: %d/min burst %d", cfg.AuthRateLimitPerMin, cfg.AuthRateLimitBurst)
	}
	if cfg.TokenRateLimitPerMin != 30 || cfg.TokenRateLimitBurst != 10 {
		t.Fatalf("unexpected token defaults: %d/min burst %d", cfg.TokenRateLimitPerMin, cfg.TokenRateLimitBurst)
	}
	if len(cfg.TrustedProxies) != 0 {
		t.Fatalf("TRUSTED_PROXIES must be empty by default, got %v", cfg.TrustedProxies)
	}
}

func TestRateLimitFromEnvironment(t *testing.T) {
	t.Setenv("RATE_LIMIT_ENABLED", "false")
	t.Setenv("RATE_LIMIT_AUTH_PER_MIN", "3")
	t.Setenv("RATE_LIMIT_AUTH_BURST", "2")
	t.Setenv("RATE_LIMIT_TOKEN_PER_MIN", "60")
	t.Setenv("RATE_LIMIT_TOKEN_BURST", "20")
	t.Setenv("TRUSTED_PROXIES", " 10.0.0.0/8, ,127.0.0.1 ")
	cfg := Load()

	if cfg.RateLimitEnabled {
		t.Fatal("RATE_LIMIT_ENABLED=false must disable rate limiting")
	}
	if cfg.AuthRateLimitPerMin != 3 || cfg.AuthRateLimitBurst != 2 || cfg.TokenRateLimitPerMin != 60 || cfg.TokenRateLimitBurst != 20 {
		t.Fatalf("env values not applied: %+v", cfg)
	}
	if want := []string{"10.0.0.0/8", "127.0.0.1"}; !reflect.DeepEqual(cfg.TrustedProxies, want) {
		t.Fatalf("expected trusted proxies %v, got %v", want, cfg.TrustedProxies)
	}
}

func TestCORSOrigins(t *testing.T) {
	cases := []struct {
		name string
		env  string
		want []string
	}{
		{"por defecto el frontend web", "", []string{"http://localhost:5173"}},
		{"un solo origen (como en el cluster)", "https://backend-tpenroz.dev.censei.cl", []string{"https://backend-tpenroz.dev.censei.cl"}},
		{"varios orígenes separados por coma", " http://localhost:5173, ,http://localhost:8081 ", []string{"http://localhost:5173", "http://localhost:8081"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("CORS_ORIGIN", tc.env)
			if got := Load().CORSOrigins; !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("CORS_ORIGIN=%q: expected %v, got %v", tc.env, tc.want, got)
			}
		})
	}
}
