package phase4

import (
	"database/sql"

	_ "modernc.org/sqlite"
)

func openSQL(path string) (*sql.DB, error) { return sql.Open("sqlite", "file:"+path) }
