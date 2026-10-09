package phase4

import "encoding/base64"

func decodeB64(s string) []byte {
	b, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		panic(err)
	}
	return b
}

func encodeB64(b []byte) string { return base64.StdEncoding.EncodeToString(b) }
