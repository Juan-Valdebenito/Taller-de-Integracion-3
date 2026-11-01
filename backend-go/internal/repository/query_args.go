package repository

import "fmt"

// queryArgs acumula los argumentos de una consulta SQL con parámetros
// posicionales ($1, $2, ...). add devuelve el placeholder del valor recién
// agregado según la cantidad de argumentos, así la numeración no puede
// desincronizarse al agregar o quitar filtros (antes se llevaba un contador
// argIdx a mano en cada filtro).
type queryArgs []any

func (a *queryArgs) add(value any) string {
	*a = append(*a, value)
	return fmt.Sprintf("$%d", len(*a))
}
