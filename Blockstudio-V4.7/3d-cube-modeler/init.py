#!/usr/bin/env python3
"""Start the 3D Cube Modeler development website."""

from __future__ import annotations

import argparse
import contextlib
import os
import socket
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent


class WebsiteServer(ThreadingHTTPServer):
    """Small reusable threaded server for local development."""

    allow_reuse_address = True


def available_port(host: str, preferred_port: int) -> int:
    """Use the requested port when available, otherwise select a free one."""
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
        try:
            sock.bind((host, preferred_port))
        except OSError:
            sock.bind((host, 0))
        return int(sock.getsockname()[1])


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Start the 3D Cube Modeler website")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8000, help="Preferred port (default: 8000)")
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Do not open the website in the default browser",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    os.chdir(PROJECT_DIR)
    port = available_port(args.host, args.port)
    server = WebsiteServer((args.host, port), SimpleHTTPRequestHandler)

    browser_host = "localhost" if args.host in {"0.0.0.0", "::"} else args.host
    url = f"http://{browser_host}:{port}/"
    print(f"3D Cube Modeler is running at {url}")
    print("Press Ctrl+C to stop the server.")

    if not args.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
