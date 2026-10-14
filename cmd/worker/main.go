//go:build js && wasm

// Command worker is the Cloudflare Worker entry point. It is compiled to
// WebAssembly and serves the JSON API under /api/; everything else is
// served by Workers Static Assets from the built frontend.
package main

import (
	"database/sql"
	"log"

	"github.com/syumai/workers-go"
	"github.com/syumai/workers-go/cloudflare"
	_ "github.com/syumai/workers-go/cloudflare/d1" // registers the "d1" driver

	"github.com/fzn0x/verisign/internal/api"
	"github.com/fzn0x/verisign/internal/config"
	"github.com/fzn0x/verisign/internal/store"
)

func main() {
	// "DB" is the D1 binding name in wrangler.toml.
	db, err := sql.Open("d1", "DB")
	if err != nil {
		log.Fatalf("worker: open D1: %v", err)
	}
	srv := api.New(store.New(db), func() config.Config {
		return config.Load(cloudflare.Getenv)
	})
	workers.Serve(srv)
}
