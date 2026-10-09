package syncclient

import (
	"os"
	"path/filepath"
	"sync"
)

// MemLocalStore keeps the local database in memory (tests, ephemeral profiles).
type MemLocalStore struct {
	mu sync.Mutex
	b  []byte
}

func (m *MemLocalStore) Load() ([]byte, error) { m.mu.Lock(); defer m.mu.Unlock(); return m.b, nil }
func (m *MemLocalStore) Save(b []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.b = append([]byte(nil), b...)
	return nil
}

// FileLocalStore persists the local database to a file atomically (survives restarts: offline queue).
type FileLocalStore struct{ Path string }

func (f FileLocalStore) Load() ([]byte, error) {
	b, err := os.ReadFile(f.Path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	return b, err
}

func (f FileLocalStore) Save(b []byte) error {
	if err := os.MkdirAll(filepath.Dir(f.Path), 0o700); err != nil {
		return err
	}
	tmp := f.Path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, f.Path)
}
