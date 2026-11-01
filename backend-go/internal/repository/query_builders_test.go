package repository

import (
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

func ptr[T any](v T) *T { return &v }

var placeholderRe = regexp.MustCompile(`\$(\d+)`)

// assertPlaceholdersMatchArgs comprueba que la consulta use exactamente $1..$N
// para N argumentos: ni placeholders sin valor ni valores sin placeholder.
func assertPlaceholdersMatchArgs(t *testing.T, query string, args []any) {
	t.Helper()
	used := map[int]bool{}
	for _, m := range placeholderRe.FindAllStringSubmatch(query, -1) {
		n, _ := strconv.Atoi(m[1])
		used[n] = true
	}
	if len(used) != len(args) {
		t.Fatalf("query uses %d distinct placeholders but has %d args\n%s\nargs=%v", len(used), len(args), query, args)
	}
	for i := 1; i <= len(args); i++ {
		if !used[i] {
			t.Fatalf("placeholder $%d missing in query\n%s", i, query)
		}
	}
}

func TestBuildComplaintQueryWithoutFilters(t *testing.T) {
	query, args := buildComplaintFindAllQuery(ComplaintFilter{})
	if len(args) != 0 || strings.Contains(query, "$") {
		t.Fatalf("expected no parameters, got args=%v\n%s", args, query)
	}
	if !strings.HasSuffix(strings.TrimSpace(query), `ORDER BY "createdAt" DESC`) {
		t.Fatalf("expected ORDER BY at the end\n%s", query)
	}
}

func TestBuildComplaintQueryFiltersAndPagination(t *testing.T) {
	status := domain.ComplaintStatus("PENDING")
	query, args := buildComplaintFindAllQuery(
		ComplaintFilter{Status: &status, LineName: ptr("7A"), CompanyID: ptr("comp-1")},
		Pagination{Page: 3, Limit: 10},
	)

	assertPlaceholdersMatchArgs(t, query, args)
	for _, fragment := range []string{
		"status = $1",
		`"lineName" ILIKE $2`,
		`"companyId" = $3`,
		"LIMIT $4",
		"OFFSET $5",
	} {
		if !strings.Contains(query, fragment) {
			t.Errorf("expected %q in query\n%s", fragment, query)
		}
	}
	want := []any{status, "%7A%", "comp-1", 10, 20}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("args = %v, want %v", args, want)
	}
}

func TestBuildComplaintQueryFirstPageHasNoOffset(t *testing.T) {
	query, args := buildComplaintFindAllQuery(ComplaintFilter{MinRating: ptr(3)}, Pagination{Page: 1, Limit: 20})

	assertPlaceholdersMatchArgs(t, query, args)
	if strings.Contains(query, "OFFSET") {
		t.Fatalf("page 1 must not have OFFSET\n%s", query)
	}
	if !reflect.DeepEqual(args, []any{3, 20}) {
		t.Fatalf("args = %v", args)
	}
}

func TestBuildComplaintQueryIgnoresEmptyStrings(t *testing.T) {
	_, args := buildComplaintFindAllQuery(ComplaintFilter{BusID: ptr(""), PassengerID: ptr(""), CompanyID: ptr("")})
	if len(args) != 0 {
		t.Fatalf("empty string filters must be ignored, got %v", args)
	}
}

func TestBuildBusQueryRouteAndLine(t *testing.T) {
	query, args := buildBusFindAllQuery(BusFilter{RouteID: ptr("route-1"), Line: ptr(" línea 7a ")})

	assertPlaceholdersMatchArgs(t, query, args)
	if !strings.Contains(query, `"routeId" = $1`) {
		t.Fatalf("expected routeId as $1\n%s", query)
	}
	// La línea se normaliza ("LÍNEA 7A" → "7A") y ocupa $2..$6 en orden.
	for _, fragment := range []string{"UPPER(r.code) = $2", "UPPER(r.code) ILIKE $3", "UPPER(r.name) ILIKE $4", `UPPER("routeId") ILIKE $5`, "UPPER(id) ILIKE $6"} {
		if !strings.Contains(query, fragment) {
			t.Errorf("expected %q in query\n%s", fragment, query)
		}
	}
	want := []any{"route-1", "7A", "%7A%", "%7A%", "%7A%", "%7A%"}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("args = %v, want %v", args, want)
	}
}

func TestBuildBusQueryAllFilters(t *testing.T) {
	status := domain.BusStatus("ACTIVE")
	query, args := buildBusFindAllQuery(BusFilter{RouteID: ptr("r"), CompanyID: ptr("c"), Status: &status, Line: ptr("1C")})

	assertPlaceholdersMatchArgs(t, query, args)
	if len(args) != 8 {
		t.Fatalf("expected 3 filters + 5 line params = 8 args, got %d", len(args))
	}
}
