package repository

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// Tests contra PostgreSQL real. Solo corren si TEST_DATABASE_URL apunta a una
// base de prueba con las migraciones aplicadas (nunca a la base de desarrollo:
// los tests crean y borran datos). Ejemplo:
//
//	TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/transithub_test go test ./internal/repository
func attachmentTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL no definida: se omiten los tests de integración")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	if err := pool.Ping(ctx); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// seedComplaint crea empresa, pasajero y reclamo de prueba (se borran al terminar).
func seedComplaint(t *testing.T, pool *pgxpool.Pool) (complaintID, userID string) {
	t.Helper()
	ctx := context.Background()
	suffix := strings.ReplaceAll(t.Name(), "/", "-") + "-" + time.Now().Format("150405.000000000")
	var companyID string
	if err := pool.QueryRow(ctx, `INSERT INTO companies (name, rut, email) VALUES ('Empresa test', $1, $2) RETURNING id`,
		"rut-"+suffix, "empresa-"+suffix+"@test.cl").Scan(&companyID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO users (name, email, "passwordHash", role, "companyId") VALUES ('Pasajero', $1, 'x', 'PASSENGER', $2) RETURNING id`,
		"pasajero-"+suffix+"@test.cl", companyID).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO complaints (title, description, "passengerId", "companyId") VALUES ('Reclamo', 'Descripción', $1, $2) RETURNING id`,
		userID, companyID).Scan(&complaintID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx := context.Background()
		_, _ = pool.Exec(ctx, `DELETE FROM complaints WHERE id = $1`, complaintID) // borra también sus adjuntos
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
		_, _ = pool.Exec(ctx, `DELETE FROM companies WHERE id = $1`, companyID)
	})
	return complaintID, userID
}

func newAttachment(complaintID, userID, key, hashChar string) domain.ComplaintAttachment {
	return domain.ComplaintAttachment{
		ComplaintID:   complaintID,
		StorageKey:    key,
		MimeType:      domain.MimeTypeJPEG,
		SizeBytes:     123_456,
		Width:         1280,
		Height:        960,
		SHA256:        strings.Repeat(hashChar, 64),
		MaskedRegions: 1,
		UploadedBy:    &userID,
	}
}

func TestAttachmentRepositoryCreateAndList(t *testing.T) {
	pool := attachmentTestPool(t)
	repo := NewComplaintAttachmentRepository(pool)
	ctx := context.Background()
	complaintID, userID := seedComplaint(t, pool)

	empty, err := repo.FindByComplaintID(ctx, complaintID)
	if err != nil {
		t.Fatal(err)
	}
	if empty == nil || len(empty) != 0 {
		t.Fatalf("un reclamo sin imágenes debe devolver lista vacía (no nil), got %#v", empty)
	}

	first, err := repo.Create(ctx, newAttachment(complaintID, userID, "complaints/"+complaintID+"/a.jpg", "a"))
	if err != nil {
		t.Fatal(err)
	}
	if first.ID == "" || first.CreatedAt.IsZero() {
		t.Fatalf("la base debe asignar id y createdAt: %+v", first)
	}
	if first.StorageKey != "complaints/"+complaintID+"/a.jpg" || first.MaskedRegions != 1 || first.UploadedBy == nil || *first.UploadedBy != userID {
		t.Fatalf("datos guardados incorrectos: %+v", first)
	}

	second, err := repo.Create(ctx, newAttachment(complaintID, userID, "complaints/"+complaintID+"/b.jpg", "b"))
	if err != nil {
		t.Fatal(err)
	}

	list, err := repo.FindByComplaintID(ctx, complaintID)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || list[0].ID != first.ID || list[1].ID != second.ID {
		t.Fatalf("se esperaban las 2 imágenes en orden de subida, got %+v", list)
	}
}

func TestAttachmentRepositoryCreateErrors(t *testing.T) {
	pool := attachmentTestPool(t)
	repo := NewComplaintAttachmentRepository(pool)
	ctx := context.Background()
	complaintID, userID := seedComplaint(t, pool)

	if _, err := repo.Create(ctx, newAttachment(complaintID, userID, "complaints/"+complaintID+"/a.jpg", "c")); err != nil {
		t.Fatal(err)
	}

	// Misma imagen (mismo hash) en el mismo reclamo.
	_, err := repo.Create(ctx, newAttachment(complaintID, userID, "complaints/"+complaintID+"/otra.jpg", "c"))
	if !errors.Is(err, ErrAttachmentDuplicate) {
		t.Fatalf("want ErrAttachmentDuplicate, got %v", err)
	}

	// Reclamo inexistente.
	_, err = repo.Create(ctx, newAttachment("no-existe", userID, "complaints/no-existe/a.jpg", "d"))
	if !errors.Is(err, ErrAttachmentComplaintNotFound) {
		t.Fatalf("want ErrAttachmentComplaintNotFound, got %v", err)
	}
}

func TestAttachmentRepositoryFindByIDIsScopedToComplaint(t *testing.T) {
	pool := attachmentTestPool(t)
	repo := NewComplaintAttachmentRepository(pool)
	ctx := context.Background()
	complaintID, userID := seedComplaint(t, pool)
	otherComplaintID, _ := seedComplaint(t, pool)

	created, err := repo.Create(ctx, newAttachment(complaintID, userID, "complaints/"+complaintID+"/a.jpg", "e"))
	if err != nil {
		t.Fatal(err)
	}

	found, err := repo.FindByID(ctx, complaintID, created.ID)
	if err != nil || found == nil || found.ID != created.ID || found.StorageKey != created.StorageKey {
		t.Fatalf("debe encontrar la imagen de su reclamo: %+v, %v", found, err)
	}

	// La misma imagen pedida desde otro reclamo no existe.
	if found, err := repo.FindByID(ctx, otherComplaintID, created.ID); err != nil || found != nil {
		t.Fatalf("no debe acceder a la imagen de otro reclamo: %+v, %v", found, err)
	}
	if found, err := repo.FindByID(ctx, complaintID, "no-existe"); err != nil || found != nil {
		t.Fatalf("id inexistente debe devolver nil: %+v, %v", found, err)
	}
}

func TestAttachmentRepositoryCountAndDelete(t *testing.T) {
	pool := attachmentTestPool(t)
	repo := NewComplaintAttachmentRepository(pool)
	ctx := context.Background()
	complaintID, userID := seedComplaint(t, pool)
	otherComplaintID, _ := seedComplaint(t, pool)

	if n, err := repo.CountByComplaintID(ctx, complaintID); err != nil || n != 0 {
		t.Fatalf("sin imágenes: want 0, got %d, %v", n, err)
	}
	a, err := repo.Create(ctx, newAttachment(complaintID, userID, "complaints/"+complaintID+"/a.jpg", "1"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.Create(ctx, newAttachment(complaintID, userID, "complaints/"+complaintID+"/b.jpg", "2")); err != nil {
		t.Fatal(err)
	}
	if n, err := repo.CountByComplaintID(ctx, complaintID); err != nil || n != 2 {
		t.Fatalf("want 2, got %d, %v", n, err)
	}

	// Borrar desde otro reclamo no borra nada.
	if _, err := repo.Delete(ctx, otherComplaintID, a.ID); !errors.Is(err, ErrAttachmentNotFound) {
		t.Fatalf("borrar desde otro reclamo: want ErrAttachmentNotFound, got %v", err)
	}

	deleted, err := repo.Delete(ctx, complaintID, a.ID)
	if err != nil {
		t.Fatal(err)
	}
	// Devuelve el nombre interno para poder borrar el archivo del almacenamiento.
	if deleted.ID != a.ID || deleted.StorageKey != "complaints/"+complaintID+"/a.jpg" {
		t.Fatalf("Delete debe devolver la imagen borrada: %+v", deleted)
	}
	if n, _ := repo.CountByComplaintID(ctx, complaintID); n != 1 {
		t.Fatalf("después de borrar: want 1, got %d", n)
	}
	if _, err := repo.Delete(ctx, complaintID, a.ID); !errors.Is(err, ErrAttachmentNotFound) {
		t.Fatalf("borrar dos veces: want ErrAttachmentNotFound, got %v", err)
	}
}

func TestAttachmentRepositoryCreateWithinLimit(t *testing.T) {
	pool := attachmentTestPool(t)
	repo := NewComplaintAttachmentRepository(pool)
	ctx := context.Background()
	complaintID, userID := seedComplaint(t, pool)

	for i := 0; i < domain.MaxAttachmentsPerComplaint; i++ {
		hash := string(rune('a' + i))
		if _, err := repo.CreateWithinLimit(ctx, newAttachment(complaintID, userID, "complaints/"+complaintID+"/"+hash+".jpg", hash)); err != nil {
			t.Fatalf("imagen %d: %v", i+1, err)
		}
	}
	_, err := repo.CreateWithinLimit(ctx, newAttachment(complaintID, userID, "complaints/"+complaintID+"/extra.jpg", "f"))
	if !errors.Is(err, domain.ErrAttachmentLimitReached) {
		t.Fatalf("la imagen %d debe rechazarse: want ErrAttachmentLimitReached, got %v", domain.MaxAttachmentsPerComplaint+1, err)
	}

	_, err = repo.CreateWithinLimit(ctx, newAttachment("no-existe", userID, "complaints/no-existe/a.jpg", "0"))
	if !errors.Is(err, ErrAttachmentComplaintNotFound) {
		t.Fatalf("reclamo inexistente: want ErrAttachmentComplaintNotFound, got %v", err)
	}
}

// Subidas simultáneas al mismo reclamo: el bloqueo del reclamo impide pasar el límite.
func TestAttachmentRepositoryCreateWithinLimitConcurrent(t *testing.T) {
	pool := attachmentTestPool(t)
	repo := NewComplaintAttachmentRepository(pool)
	ctx := context.Background()
	complaintID, userID := seedComplaint(t, pool)

	const uploads = 6
	errs := make(chan error, uploads)
	start := make(chan struct{})
	for i := 0; i < uploads; i++ {
		go func(i int) {
			<-start
			hash := string(rune('a' + i))
			_, err := repo.CreateWithinLimit(ctx, newAttachment(complaintID, userID, "complaints/"+complaintID+"/c"+hash+".jpg", hash))
			errs <- err
		}(i)
	}
	close(start)

	ok, limited := 0, 0
	for i := 0; i < uploads; i++ {
		switch err := <-errs; {
		case err == nil:
			ok++
		case errors.Is(err, domain.ErrAttachmentLimitReached):
			limited++
		default:
			t.Errorf("error inesperado: %v", err)
		}
	}
	if ok != domain.MaxAttachmentsPerComplaint || limited != uploads-domain.MaxAttachmentsPerComplaint {
		t.Fatalf("want %d guardadas y %d rechazadas, got %d y %d", domain.MaxAttachmentsPerComplaint, uploads-domain.MaxAttachmentsPerComplaint, ok, limited)
	}
	if n, _ := repo.CountByComplaintID(ctx, complaintID); n != domain.MaxAttachmentsPerComplaint {
		t.Fatalf("en la base quedaron %d imágenes, máximo %d", n, domain.MaxAttachmentsPerComplaint)
	}
}
