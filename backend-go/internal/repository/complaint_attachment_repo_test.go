package repository

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// Las columnas del SELECT deben ser las mismas (y en el mismo orden) que los
// tags db del modelo, que es el orden en que scanAttachment las lee.
func TestAttachmentSelectColumnsMatchModel(t *testing.T) {
	var columns []string
	for _, c := range strings.Split(attachmentSelectColumns, ",") {
		columns = append(columns, strings.Trim(strings.TrimSpace(c), `"`))
	}

	var tags []string
	typ := reflect.TypeOf(domain.ComplaintAttachment{})
	for i := 0; i < typ.NumField(); i++ {
		tags = append(tags, typ.Field(i).Tag.Get("db"))
	}

	if !reflect.DeepEqual(columns, tags) {
		t.Fatalf("columnas del SELECT distintas al modelo:\n select %v\n modelo %v", columns, tags)
	}
}

func TestMapAttachmentInsertError(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want error
	}{
		{
			"imagen duplicada en el reclamo",
			&pgconn.PgError{Code: "23505", ConstraintName: "uq_complaint_attachments_complaint_sha256"},
			ErrAttachmentDuplicate,
		},
		{
			"reclamo inexistente",
			&pgconn.PgError{Code: "23503", ConstraintName: "complaint_attachments_complaintId_fkey"},
			ErrAttachmentComplaintNotFound,
		},
	}
	for _, tc := range cases {
		if got := mapAttachmentInsertError(tc.err); !errors.Is(got, tc.want) {
			t.Errorf("%s: want %v, got %v", tc.name, tc.want, got)
		}
	}

	// Otros errores (ej. storageKey repetido, conexión) se envuelven sin perder el original.
	other := &pgconn.PgError{Code: "23505", ConstraintName: "complaint_attachments_storageKey_key"}
	got := mapAttachmentInsertError(other)
	if errors.Is(got, ErrAttachmentDuplicate) || !errors.Is(got, other) {
		t.Errorf("un storageKey repetido es un error interno, no una imagen duplicada: %v", got)
	}
}

// Create valida con las reglas del dominio antes de tocar la base de datos
// (con pool nil, cualquier consulta entraría en pánico).
func TestCreateRejectsInvalidAttachmentWithoutQuerying(t *testing.T) {
	repo := NewComplaintAttachmentRepository(nil)
	_, err := repo.Create(context.Background(), domain.ComplaintAttachment{
		ComplaintID: "complaint-1",
		StorageKey:  "complaints/complaint-1/a.gif",
		MimeType:    "image/gif",
		SizeBytes:   100,
		Width:       10,
		Height:      10,
		SHA256:      strings.Repeat("a", 64),
	})
	if !errors.Is(err, domain.ErrAttachmentUnsupportedType) {
		t.Fatalf("want ErrAttachmentUnsupportedType, got %v", err)
	}
}
