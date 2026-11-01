package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
)

// fakeCompanies guarda empresas en memoria y simula los duplicados de la base.
type fakeCompanies struct {
	items   map[string]domain.Company
	failAll bool
	lastIn  domain.CompanyInput
}

func newFakeCompanies(items ...domain.Company) *fakeCompanies {
	f := &fakeCompanies{items: map[string]domain.Company{}}
	for _, c := range items {
		f.items[c.ID] = c
	}
	return f
}

func (f *fakeCompanies) FindAll(context.Context) ([]domain.Company, error) {
	if f.failAll {
		return nil, errors.New("db caída")
	}
	out := []domain.Company{}
	for _, c := range f.items {
		out = append(out, c)
	}
	return out, nil
}

func (f *fakeCompanies) FindByID(_ context.Context, id string) (*domain.Company, error) {
	if c, ok := f.items[id]; ok {
		return &c, nil
	}
	return nil, nil
}

func (f *fakeCompanies) duplicate(id string, in domain.CompanyInput) error {
	for otherID, c := range f.items {
		if otherID == id {
			continue
		}
		if c.Rut == in.Rut {
			return repository.ErrCompanyDuplicateRut
		}
		if c.Email == in.Email {
			return repository.ErrCompanyDuplicateEmail
		}
	}
	return nil
}

func (f *fakeCompanies) Create(_ context.Context, in domain.CompanyInput) (*domain.Company, error) {
	f.lastIn = in
	if err := f.duplicate("", in); err != nil {
		return nil, err
	}
	c := domain.Company{ID: "nueva", Name: in.Name, Rut: in.Rut, Email: in.Email, Phone: in.Phone, Address: in.Address, IsActive: true}
	f.items[c.ID] = c
	return &c, nil
}

func (f *fakeCompanies) Update(_ context.Context, id string, in domain.CompanyInput) (*domain.Company, error) {
	f.lastIn = in
	c, ok := f.items[id]
	if !ok {
		return nil, nil
	}
	if err := f.duplicate(id, in); err != nil {
		return nil, err
	}
	c.Name, c.Rut, c.Email, c.Phone, c.Address = in.Name, in.Rut, in.Email, in.Phone, in.Address
	f.items[id] = c
	return &c, nil
}

func (f *fakeCompanies) SetActive(_ context.Context, id string, active bool) (*domain.Company, error) {
	c, ok := f.items[id]
	if !ok {
		return nil, nil
	}
	c.IsActive = active
	f.items[id] = c
	return &c, nil
}

func companyRouter(store companyStore) *gin.Engine {
	gin.SetMode(gin.TestMode)
	h := &CompanyHandler{companies: store}
	r := gin.New()
	r.GET("/companies", h.GetAll)
	r.GET("/companies/:id", h.GetByID)
	r.POST("/companies", h.Create)
	r.PUT("/companies/:id", h.Update)
	r.PATCH("/companies/:id/status", h.SetStatus)
	return r
}

func do(r *gin.Engine, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

var demo = domain.Company{ID: "company-demo", Name: "Empresa Demo", Rut: "76.000.000-0", Email: "demo@empresa.cl", IsActive: true}
var off = domain.Company{ID: "vieja", Name: "Buses Antiguos", Rut: "12.345.678-5", Email: "antiguos@buses.cl", IsActive: false}

func TestCompanyGetAllIncludesInactiveAndFiltersActive(t *testing.T) {
	r := companyRouter(newFakeCompanies(demo, off))

	var all []domain.Company
	w := do(r, http.MethodGet, "/companies", "")
	if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &all) != nil || len(all) != 2 {
		t.Fatalf("GET /companies = %d %s; esperado las 2 empresas", w.Code, w.Body)
	}

	var active []domain.Company
	w = do(r, http.MethodGet, "/companies?active=true", "")
	if json.Unmarshal(w.Body.Bytes(), &active) != nil || len(active) != 1 || active[0].ID != "company-demo" {
		t.Fatalf("GET /companies?active=true = %s; esperado solo la activa", w.Body)
	}
}

func TestCompanyGetAllHidesInternalErrors(t *testing.T) {
	store := newFakeCompanies()
	store.failAll = true
	w := do(companyRouter(store), http.MethodGet, "/companies", "")
	if w.Code != http.StatusInternalServerError || strings.Contains(w.Body.String(), "db caída") {
		t.Fatalf("GET /companies con error = %d %s", w.Code, w.Body)
	}
}

func TestCompanyCreateNormalizesAndValidates(t *testing.T) {
	store := newFakeCompanies(demo)
	r := companyRouter(store)

	w := do(r, http.MethodPost, "/companies", `{"name":" Buses Ñielol ","rut":"123456785","email":"Contacto@Nielol.CL","phone":"+56 45 2345 678","address":""}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("POST /companies = %d %s", w.Code, w.Body)
	}
	if store.lastIn.Name != "Buses Ñielol" || store.lastIn.Rut != "12.345.678-5" || store.lastIn.Email != "contacto@nielol.cl" || store.lastIn.Address != nil {
		t.Errorf("datos guardados = %+v", store.lastIn)
	}

	cases := []struct {
		name, body string
		code       int
		msg        string
	}{
		{"sin nombre", `{"name":"","rut":"76.000.000-0","email":"x@y.cl"}`, http.StatusBadRequest, domain.ErrCompanyNameRequired.Error()},
		{"RUT inválido", `{"name":"X","rut":"76.000.000-1","email":"x@y.cl"}`, http.StatusBadRequest, domain.ErrCompanyRutInvalid.Error()},
		{"correo inválido", `{"name":"X","rut":"10.000.013-K","email":"no-es-correo"}`, http.StatusBadRequest, domain.ErrCompanyEmailInvalid.Error()},
		{"JSON roto", `{"name":`, http.StatusBadRequest, "Cuerpo de la solicitud inválido"},
		{"RUT repetido (con otro formato)", `{"name":"Otra","rut":"760000000","email":"otra@x.cl"}`, http.StatusConflict, repository.ErrCompanyDuplicateRut.Error()},
		{"correo repetido", `{"name":"Otra","rut":"10.000.013-K","email":"DEMO@empresa.cl"}`, http.StatusConflict, repository.ErrCompanyDuplicateEmail.Error()},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			w := do(r, http.MethodPost, "/companies", tt.body)
			if w.Code != tt.code || !strings.Contains(w.Body.String(), tt.msg) {
				t.Fatalf("POST = %d %s; esperado %d con %q", w.Code, w.Body, tt.code, tt.msg)
			}
		})
	}
}

func TestCompanyUpdate(t *testing.T) {
	store := newFakeCompanies(demo, off)
	r := companyRouter(store)

	w := do(r, http.MethodPut, "/companies/company-demo", `{"name":"Empresa Demo SpA","rut":"76.000.000-0","email":"demo@empresa.cl","phone":"45 222 3333"}`)
	if w.Code != http.StatusOK || store.items["company-demo"].Name != "Empresa Demo SpA" {
		t.Fatalf("PUT = %d %s", w.Code, w.Body)
	}
	// Mantener su propio RUT no es duplicado; usar el de otra empresa sí.
	if w := do(r, http.MethodPut, "/companies/company-demo", `{"name":"X","rut":"12.345.678-5","email":"demo@empresa.cl"}`); w.Code != http.StatusConflict {
		t.Errorf("RUT de otra empresa = %d %s; esperado 409", w.Code, w.Body)
	}
	if w := do(r, http.MethodPut, "/companies/no-existe", `{"name":"X","rut":"76.000.000-0","email":"x@y.cl"}`); w.Code != http.StatusNotFound {
		t.Errorf("empresa inexistente = %d; esperado 404", w.Code)
	}
}

func TestCompanySetStatusAndGetByID(t *testing.T) {
	store := newFakeCompanies(demo)
	r := companyRouter(store)

	if w := do(r, http.MethodPatch, "/companies/company-demo/status", `{"isActive":false}`); w.Code != http.StatusOK || store.items["company-demo"].IsActive {
		t.Fatalf("desactivar = %d %s", w.Code, w.Body)
	}
	if w := do(r, http.MethodPatch, "/companies/company-demo/status", `{}`); w.Code != http.StatusBadRequest {
		t.Errorf("sin isActive = %d; esperado 400", w.Code)
	}
	if w := do(r, http.MethodPatch, "/companies/no-existe/status", `{"isActive":true}`); w.Code != http.StatusNotFound {
		t.Errorf("inexistente = %d; esperado 404", w.Code)
	}
	if w := do(r, http.MethodGet, "/companies/company-demo", ""); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"rut":"76.000.000-0"`) {
		t.Errorf("GET por id = %d %s", w.Code, w.Body)
	}
	if w := do(r, http.MethodGet, "/companies/no-existe", ""); w.Code != http.StatusNotFound {
		t.Errorf("GET inexistente = %d; esperado 404", w.Code)
	}
}
