#!/usr/bin/env python3
"""Local fixtures for acceptance test 2. Plain HTTP only here: redirect loop (8080) and
accept-and-never-answer (8081). TLS fixtures on 8443 need generated certs (expired, self-signed,
wrong-hostname) - generate with openssl in the harness; TODO: add gen-certs step (UNVERIFIED)."""
import socket, threading, http.server, socketserver

class Loop(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(302); self.send_header("Location", "/loop"); self.end_headers()
    def log_message(self, *a): pass

def hang_server():
    s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(("127.0.0.1", 8081)); s.listen(8)
    conns = []
    while True:
        conns.append(s.accept()[0])  # accept, never respond

if __name__ == "__main__":
    threading.Thread(target=hang_server, daemon=True).start()
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", 8080), Loop) as srv:
        srv.serve_forever()
