package domain

import "testing"

func complaintOf(passengerID string) *Complaint {
	return &Complaint{ID: "comp-1", PassengerID: &passengerID}
}

func TestAttachmentPermissions(t *testing.T) {
	complaint := complaintOf("usr-pass-01")

	cases := []struct {
		name                 string
		actor                Actor
		upload, view, delete bool
	}{
		{"pasajero dueño del reclamo", Actor{UserID: "usr-pass-01", Role: UserRolePassenger}, true, true, true},
		{"otro pasajero", Actor{UserID: "usr-pass-02", Role: UserRolePassenger}, false, false, false},
		{"administrador", Actor{UserID: "usr-admin-01", Role: UserRoleAdmin}, false, true, true},
		{"usuario de empresa", Actor{UserID: "usr-comp-01", Role: UserRoleCompany}, false, false, false},
		{"sin sesión", Actor{}, false, false, false},
		{"rol desconocido", Actor{UserID: "usr-pass-01", Role: "SUPERUSER"}, false, false, false},
		// Mismo id que el dueño pero con otro rol: no es el dueño.
		{"mismo id con rol de empresa", Actor{UserID: "usr-pass-01", Role: UserRoleCompany}, false, false, false},
		{"administrador sin id", Actor{Role: UserRoleAdmin}, false, false, false},
		{"id con espacios", Actor{UserID: "  ", Role: UserRolePassenger}, false, false, false},
	}
	for _, tc := range cases {
		if got := CanUploadAttachment(complaint, tc.actor); got != tc.upload {
			t.Errorf("%s: subir = %v, want %v", tc.name, got, tc.upload)
		}
		if got := CanViewAttachments(complaint, tc.actor); got != tc.view {
			t.Errorf("%s: ver = %v, want %v", tc.name, got, tc.view)
		}
		if got := CanDeleteAttachment(complaint, tc.actor); got != tc.delete {
			t.Errorf("%s: borrar = %v, want %v", tc.name, got, tc.delete)
		}
	}
}

// Un reclamo sin pasajero (dato antiguo o incompleto) no tiene dueño: nadie
// puede subir; los administradores sí pueden ver y borrar.
func TestAttachmentPermissionsComplaintWithoutPassenger(t *testing.T) {
	complaint := &Complaint{ID: "comp-1"}
	passenger := Actor{UserID: "usr-pass-01", Role: UserRolePassenger}
	admin := Actor{UserID: "usr-admin-01", Role: UserRoleAdmin}

	if CanUploadAttachment(complaint, passenger) || CanViewAttachments(complaint, passenger) {
		t.Error("sin pasajero dueño, un pasajero no tiene acceso")
	}
	if CanUploadAttachment(complaint, admin) {
		t.Error("un administrador no sube imágenes en nombre del pasajero")
	}
	if !CanViewAttachments(complaint, admin) || !CanDeleteAttachment(complaint, admin) {
		t.Error("un administrador puede ver y borrar")
	}
}

// Sin reclamo (no existe) nadie tiene acceso, y no hay pánico.
func TestAttachmentPermissionsNilComplaint(t *testing.T) {
	for _, a := range []Actor{
		{UserID: "usr-pass-01", Role: UserRolePassenger},
		{UserID: "usr-admin-01", Role: UserRoleAdmin},
	} {
		if CanUploadAttachment(nil, a) || CanViewAttachments(nil, a) || CanDeleteAttachment(nil, a) {
			t.Errorf("%+v: sin reclamo no debe haber acceso", a)
		}
	}
}
