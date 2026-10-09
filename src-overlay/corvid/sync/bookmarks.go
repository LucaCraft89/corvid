package syncclient

import (
	"encoding/json"
	"sort"
)

// Fixed bookmark roots. They exist on every device and are never synced as records.
const (
	BMRoot     = "root"
	BMToolbar  = "toolbar"
	BMOther    = "other"
	BMUnsorted = "unsorted" // deterministic landing place for orphans and cycle breaks
)

var bmRoots = map[string]bool{BMToolbar: true, BMOther: true, BMUnsorted: true}

// Bookmark is one node (folder or URL). Position is a fractional-index string.
type Bookmark struct {
	ID     string `json:"-"`
	Kind   string `json:"kind"` // "url" | "folder"
	Title  string `json:"title"`
	URL    string `json:"url,omitempty"`
	Parent string `json:"parent"`
	Index  string `json:"index"`
}

// PutBookmark creates or updates a node.
func (e *Engine) PutBookmark(id string, b Bookmark) error { return e.Put(Bookmarks, id, b) }

// DeleteBookmark tombstones a node (children are re-homed by the tree view, not deleted).
func (e *Engine) DeleteBookmark(id string) error { return e.Delete(Bookmarks, id) }

// BMNode is a node in the merged tree view.
type BMNode struct {
	Bookmark
	ID       string
	Children []*BMNode
}

// BookmarkTree builds the merged view. Repairs are deterministic functions of
// the record set (so every converged device renders the same tree) and are
// view-level: they do not write records.
//   - a node whose parent is missing/deleted/unknown goes to "unsorted"
//   - parent cycles are broken by re-homing the smallest-id member to "unsorted"
//   - siblings are ordered by (index, id)
func (e *Engine) BookmarkTree() *BMNode {
	nodes := map[string]*BMNode{}
	for _, r := range e.List(Bookmarks) {
		var b Bookmark
		if json.Unmarshal(r.Data, &b) != nil {
			continue
		}
		if bmRoots[r.ID] || r.ID == BMRoot {
			continue
		}
		b.ID = r.ID
		nodes[r.ID] = &BMNode{Bookmark: b, ID: r.ID}
	}
	parent := map[string]string{}
	for id, n := range nodes {
		p := n.Parent
		if !bmRoots[p] && nodes[p] == nil || nodes[p] != nil && nodes[p].Kind != "folder" {
			p = BMUnsorted
		}
		parent[id] = p
	}
	// break cycles: walk each chain; on a cycle, re-home its smallest id
	for {
		broke := false
		ids := make([]string, 0, len(nodes))
		for id := range nodes {
			ids = append(ids, id)
		}
		sort.Strings(ids)
		for _, id := range ids {
			seen := map[string]int{}
			cur := id
			var chain []string
			for !bmRoots[cur] {
				if _, ok := seen[cur]; ok {
					cyc := chain[seen[cur]:]
					min := cyc[0]
					for _, c := range cyc {
						if c < min {
							min = c
						}
					}
					parent[min] = BMUnsorted
					broke = true
					break
				}
				seen[cur] = len(chain)
				chain = append(chain, cur)
				cur = parent[cur]
			}
			if broke {
				break
			}
		}
		if !broke {
			break
		}
	}
	root := &BMNode{ID: BMRoot, Bookmark: Bookmark{Kind: "folder", Title: "root"}}
	rootKids := map[string]*BMNode{}
	for _, r := range []string{BMToolbar, BMOther, BMUnsorted} {
		n := &BMNode{ID: r, Bookmark: Bookmark{Kind: "folder", Title: r}}
		rootKids[r] = n
		root.Children = append(root.Children, n)
	}
	for id, n := range nodes {
		p := parent[id]
		if bmRoots[p] {
			rootKids[p].Children = append(rootKids[p].Children, n)
		} else {
			nodes[p].Children = append(nodes[p].Children, n)
		}
	}
	var sortKids func(n *BMNode)
	sortKids = func(n *BMNode) {
		sort.Slice(n.Children, func(i, j int) bool {
			a, b := n.Children[i], n.Children[j]
			if a.Index != b.Index {
				return a.Index < b.Index
			}
			return a.ID < b.ID
		})
		for _, c := range n.Children {
			sortKids(c)
		}
	}
	sortKids(root)
	return root
}

// Flatten renders the tree as "path: title" lines (stable; used by tests and the UI list view).
func (n *BMNode) Flatten(prefix string) []string {
	var out []string
	for _, c := range n.Children {
		p := prefix + "/" + c.Title
		if c.Kind == "url" {
			out = append(out, p+" -> "+c.URL)
		} else {
			out = append(out, p+"/")
			out = append(out, c.Flatten(p)...)
		}
	}
	return out
}

// ---------- fractional indexing (base 36, lexicographic) ----------

const digits = "0123456789abcdefghijklmnopqrstuvwxyz"

func dIdx(c byte) int {
	for i := 0; i < len(digits); i++ {
		if digits[i] == c {
			return i
		}
	}
	return 0
}

// IndexBetween returns a key strictly between a and b (b == "" means +infinity, a == "" means -infinity).
// Keys never end in '0', so there is always room.
func IndexBetween(a, b string) string {
	n := 0
	for n < len(b) && ((n < len(a) && a[n] == b[n]) || (n >= len(a) && b[n] == '0')) {
		n++
	}
	if n > 0 {
		return b[:n] + IndexBetween(a[min(n, len(a)):], b[n:])
	}
	da := 0
	if len(a) > 0 {
		da = dIdx(a[0])
	}
	db := 36
	if b != "" {
		db = dIdx(b[0])
	}
	if db-da > 1 {
		return string(digits[(da+db)/2])
	}
	if len(b) > 1 {
		return b[:1]
	}
	rest := ""
	if len(a) > 0 {
		rest = a[1:]
	}
	return string(digits[da]) + IndexBetween(rest, "")
}

// AppendIndex returns an index after the last child of parent in the current view.
func (e *Engine) AppendIndex(parent string) string {
	last := ""
	var walk func(n *BMNode) bool
	walk = func(n *BMNode) bool {
		if n.ID == parent {
			if len(n.Children) > 0 {
				last = n.Children[len(n.Children)-1].Index
			}
			return true
		}
		for _, c := range n.Children {
			if walk(c) {
				return true
			}
		}
		return false
	}
	walk(e.BookmarkTree())
	return IndexBetween(last, "")
}
