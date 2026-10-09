package syncserver

import (
	"sync"
	"time"
)

// limiter is a per-key token bucket (key = client IP).
type limiter struct {
	mu      sync.Mutex
	perMin  int
	burst   float64
	now     func() time.Time
	buckets map[string]*bkt
	lastGC  time.Time
}

type bkt struct {
	tokens float64
	last   time.Time
}

func newLimiter(perMin int, now func() time.Time) *limiter {
	burst := float64(perMin) / 4
	if burst < 5 {
		burst = 5
	}
	return &limiter{perMin: perMin, burst: burst, now: now, buckets: map[string]*bkt{}}
}

func (l *limiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	t := l.now()
	b := l.buckets[key]
	if b == nil {
		b = &bkt{tokens: l.burst, last: t}
		l.buckets[key] = b
	}
	b.tokens += t.Sub(b.last).Seconds() * float64(l.perMin) / 60
	if b.tokens > l.burst {
		b.tokens = l.burst
	}
	b.last = t
	if t.Sub(l.lastGC) > time.Minute {
		for k, v := range l.buckets {
			if t.Sub(v.last) > 10*time.Minute {
				delete(l.buckets, k)
			}
		}
		l.lastGC = t
	}
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// failTracker implements per-username exponential backoff after repeated failures.
type failTracker struct {
	mu    sync.Mutex
	limit int
	now   func() time.Time
	m     map[string]*fail
}

type fail struct {
	n     int
	until time.Time
	seen  time.Time
}

func newFailTracker(limit int, now func() time.Time) *failTracker {
	return &failTracker{limit: limit, now: now, m: map[string]*fail{}}
}

// locked reports whether the user is currently backed off.
func (f *failTracker) locked(user string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	v := f.m[user]
	return v != nil && f.now().Before(v.until)
}

func (f *failTracker) fail(user string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	t := f.now()
	if len(f.m) > 100000 { // bound memory under username spraying
		for k, v := range f.m {
			if t.Sub(v.seen) > time.Hour {
				delete(f.m, k)
			}
		}
	}
	v := f.m[user]
	if v == nil {
		v = &fail{}
		f.m[user] = v
	}
	v.n++
	v.seen = t
	if v.n >= f.limit {
		d := time.Second << uint(min(v.n-f.limit, 10)) // 1s .. ~17min
		v.until = t.Add(d)
	}
}

func (f *failTracker) ok(user string) {
	f.mu.Lock()
	delete(f.m, user)
	f.mu.Unlock()
}
