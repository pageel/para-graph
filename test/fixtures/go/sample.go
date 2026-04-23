package main

import (
	"fmt"
	"net/http"
)

// Handler interface
type Handler interface {
	ServeHTTP(w http.ResponseWriter, r *http.Request)
}

// Server struct
type Server struct {
	Port    int
	Handler Handler
}

// NewServer creates a new server instance
func NewServer(port int) *Server {
	return &Server{Port: port}
}

// Start method with receiver
func (s *Server) Start() error {
	addr := fmt.Sprintf(":%d", s.Port)
	fmt.Println("Starting server on", addr)
	return http.ListenAndServe(addr, nil)
}

// Shutdown method
func (s *Server) Shutdown() {
	fmt.Println("Shutting down server")
}

func main() {
	server := NewServer(8080)
	server.Start()
}
