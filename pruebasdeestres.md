# Levantar servidor primero

cd backend-go
go run ./cmd/server/

# En otra terminal — modo completo (con JWT)

go run ./tests/load/cmd/ --email=admin@test.com --password=tu_password

# Solo endpoints públicos (sin BD)

go run ./tests/load/cmd/ --public-only

# Fases personalizadas + output en carpeta específica

go run ./tests/load/cmd/ --email=x@x.com --password=pass --phases="5:10,25:20,50:15" --output=./reportes
