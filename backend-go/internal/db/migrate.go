package db

import (
	"database/sql"
	"log"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"

	appmigrations "github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/migrations"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func RunMigrations(databaseURL string) {
	sqlDB, err := sql.Open("pgx", databaseURL)
	if err != nil {
		log.Fatalf("❌ No se pudo abrir conexión para migraciones: %v", err)
	}

	defer sqlDB.Close()

	if err := sqlDB.Ping(); err != nil {
		log.Fatalf("❌ PostgreSQL no está disponible: %v", err)
	}

	source, err := iofs.New(appmigrations.Filesystem(), ".")
	if err != nil {
		log.Fatalf("❌ No se pudo cargar las migraciones: %v", err)
	}

	driver, err := postgres.WithInstance(
		sqlDB,
		&postgres.Config{},
	)
	if err != nil {
		log.Fatalf("❌ No se pudo crear el driver PostgreSQL: %v", err)
	}

	m, err := migrate.NewWithInstance(
		"iofs",
		source,
		"postgres",
		driver,
	)
	if err != nil {
		log.Fatalf("❌ No se pudo inicializar migrate: %v", err)
	}

	defer m.Close()

	err = m.Up()

	if err != nil && err != migrate.ErrNoChange {
		log.Fatalf("❌ Error ejecutando migraciones: %v", err)
	}

	if err == migrate.ErrNoChange {
		log.Println("✅ Base de datos ya está actualizada")
		return
	}

	log.Println("✅ Migraciones ejecutadas correctamente")
}