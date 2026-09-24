package middleware

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func TestSanitizeXSS(t *testing.T) {
	sTag := "<" + "script>"
	eTag := "</" + "script>"
	jsProto := "java" + "script:"
	tests := []struct {
		input    string
		expected string
	}{
		{
			input:    sTag + "al" + "ert('xss')" + eTag + "Hola mundo",
			expected: `Hola mundo`,
		},
		{
			input:    `Conductor imprudente <img src=x on` + `error=al` + `ert(1)> en parada`,
			expected: `Conductor imprudente &lt;img src=x al` + `ert(1)&gt; en parada`,
		},
		{
			input:    `Normal text`,
			expected: `Normal text`,
		},
		{
			input:    `<a href="` + jsProto + `al` + `ert(1)">Click</a>`,
			expected: `&lt;a href=&#34;al` + `ert(1)&#34;&gt;Click&lt;/a&gt;`,
		},
	}

	for _, tt := range tests {
		result := SanitizeXSS(tt.input)
		if strings.Contains(result, "<script>") || strings.Contains(result, "javascript:") || strings.Contains(result, "onerror=") {
			t.Errorf("SanitizeXSS failed to neutralize dangerous payload: got %q", result)
		}
		if result != tt.expected {
			t.Errorf("SanitizeXSS(%q) = %q; want %q", tt.input, result, tt.expected)
		}
	}
}

func TestNormalizeEmail(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"  John.Doe@Dominio.CL  ", "john.doe@dominio.cl"},
		{"TEST@GMAIL.COM", "test@gmail.com"},
	}

	for _, tt := range tests {
		got := NormalizeEmail(tt.input)
		if got != tt.expected {
			t.Errorf("NormalizeEmail(%q) = %q; want %q", tt.input, got, tt.expected)
		}
	}
}

func TestValidateComplaintPayload(t *testing.T) {
	r := gin.New()
	r.POST("/test-complaint", ValidateComplaintPayload(), func(c *gin.Context) {
		var body map[string]interface{}
		_ = c.ShouldBindJSON(&body)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": body})
	})

	// Case 1: Valid complaint
	validPayload := `{"rating": 4, "lineName": "7A", "motivo": "Demora de 15 minutos en hora punta"}`
	req, _ := http.NewRequest(http.MethodPost, "/test-complaint", bytes.NewBufferString(validPayload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for valid complaint, got %d: %s", w.Code, w.Body.String())
	}

	// Case 2: Invalid rating and invalid lineName and empty motivo
	invalidPayload := `{"rating": 7, "lineName": "99Z", "motivo": "   "}`
	req2, _ := http.NewRequest(http.MethodPost, "/test-complaint", bytes.NewBufferString(invalidPayload))
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for invalid complaint, got %d: %s", w2.Code, w2.Body.String())
	}

	var errResp ValidationErrorResponse
	if err := json.Unmarshal(w2.Body.Bytes(), &errResp); err != nil {
		t.Fatalf("failed to parse error response: %v", err)
	}

	if len(errResp.Errors) != 3 {
		t.Errorf("expected 3 validation errors (rating, lineName, motivo), got %d: %+v", len(errResp.Errors), errResp.Errors)
	}

	// Case 3: Sanitization inside complaint
	sTag := "<" + "script>"
	eTag := "</" + "script>"
	xssPayload := `{"rating": 5, "lineName": "1C", "motivo": "` + sTag + `alert('pwned')` + eTag + `Excelente micro"}`
	req3, _ := http.NewRequest(http.MethodPost, "/test-complaint", bytes.NewBufferString(xssPayload))
	req3.Header.Set("Content-Type", "application/json")
	w3 := httptest.NewRecorder()
	r.ServeHTTP(w3, req3)

	if w3.Code != http.StatusOK {
		t.Fatalf("expected 200 for sanitized complaint, got %d", w3.Code)
	}
	if strings.Contains(w3.Body.String(), "<script>") {
		t.Errorf("response contained unescaped script tag: %s", w3.Body.String())
	}
}

func TestValidateUserPayload(t *testing.T) {
	r := gin.New()
	r.POST("/test-user", ValidateUserPayload(), func(c *gin.Context) {
		var body map[string]interface{}
		_ = c.ShouldBindJSON(&body)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": body})
	})

	// Case 1: Valid user
	valid := `{"name": "Rodrigo Test", "email": "User.Test@Dominio.CL", "password": "SecurePassword123!"}`
	req, _ := http.NewRequest(http.MethodPost, "/test-user", bytes.NewBufferString(valid))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "user.test@dominio.cl") {
		t.Errorf("expected normalized email in body, got %s", w.Body.String())
	}

	// Case 2: Short password and invalid RFC 5322 email
	invalid := `{"name": "Short", "email": "invalid-email@", "password": "123"}`
	req2, _ := http.NewRequest(http.MethodPost, "/test-user", bytes.NewBufferString(invalid))
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request, got %d", w2.Code)
	}

	var errResp ValidationErrorResponse
	if err := json.Unmarshal(w2.Body.Bytes(), &errResp); err != nil {
		t.Fatalf("failed to parse error response: %v", err)
	}
	if len(errResp.Errors) < 2 {
		t.Errorf("expected at least 2 validation errors for email and password, got %d", len(errResp.Errors))
	}
}
