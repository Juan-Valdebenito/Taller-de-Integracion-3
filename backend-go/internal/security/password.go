package security

import (
	"errors"
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

// BcryptCost define el factor de coste de cálculo para el hashing de contraseñas.
// Cumplimiento de normativas de seguridad y privacidad (GDPR / Ley N° 19.628 de Protección de Datos Personales):
// Un coste de 12 asegura alta resistencia contra ataques de fuerza bruta y diccionarios con GPU/ASIC.
const BcryptCost = 12

// Errores de validación de contraseñas
var (
	ErrPasswordTooShort = errors.New("la contraseña debe contener al menos 8 caracteres")
	ErrPasswordEmpty    = errors.New("la contraseña no puede estar vacía")
)

// HashPassword genera un hash criptográfico robusto utilizando bcrypt con 12 rondas de salt.
// Previene el almacenamiento de contraseñas en texto plano y mitiga ataques de tablas rainbow.
func HashPassword(plainPassword string) (string, error) {
	if len(plainPassword) == 0 {
		return "", ErrPasswordEmpty
	}
	if len(plainPassword) < 8 {
		return "", ErrPasswordTooShort
	}

	bytes, err := bcrypt.GenerateFromPassword([]byte(plainPassword), BcryptCost)
	if err != nil {
		return "", fmt.Errorf("error al generar hash bcrypt: %w", err)
	}

	return string(bytes), nil
}

// ComparePassword valida si una contraseña en texto plano coincide con el hash almacenado.
// Utiliza una comparación en tiempo constante implementada por bcrypt para mitigar ataques de temporización (timing attacks).
func ComparePassword(plainPassword, hashedPassword string) bool {
	if plainPassword == "" || hashedPassword == "" {
		return false
	}

	err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(plainPassword))
	return err == nil
}
