package handler

import (
	"testing"
	"time"
)

func TestParseTokenDuration(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  time.Duration
	}{
		{name: "days", value: "7d", want: 7 * 24 * time.Hour},
		{name: "hours", value: "2h", want: 2 * time.Hour},
		{name: "minutes", value: "15m", want: 15 * time.Minute},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := parseTokenDuration(test.value)
			if err != nil || got != test.want {
				t.Fatalf("parseTokenDuration(%q) = %s, %v; want %s", test.value, got, err, test.want)
			}
		})
	}
}

func TestParseTokenDurationRejectsInvalidValues(t *testing.T) {
	for _, value := range []string{"", "0s", "-1h", "seven-days"} {
		if _, err := parseTokenDuration(value); err == nil {
			t.Errorf("parseTokenDuration(%q) should return an error", value)
		}
	}
}
