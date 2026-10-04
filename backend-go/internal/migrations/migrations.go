package migrations

import (
	"embed"
	"io/fs"
)

//go:embed *.sql
var FS embed.FS

func Filesystem() fs.FS {
	return FS
}