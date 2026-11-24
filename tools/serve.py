"""Local launcher for StudyBlock.

Serves the app folder on 127.0.0.1 only (never reachable from other machines),
picks a free port, opens the browser, and stops when this window is closed
or Ctrl+C is pressed. Standard library only.

    py tools/serve.py            # default: first free port from 8000
    py tools/serve.py --port 8123 --no-browser
"""

import argparse
import functools
import http.server
import os
import socket
import sys
import threading
import webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOST = "127.0.0.1"


def port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((HOST, port))
            return True
        except OSError:
            return False


def is_studyblock(port: int) -> bool:
    """True if StudyBlock is already being served on this port (e.g. a second launcher)."""
    import urllib.request
    try:
        with urllib.request.urlopen(f"http://{HOST}:{port}/manifest.webmanifest", timeout=1) as r:
            return b'"StudyBlock"' in r.read(4096)
    except Exception:
        return False


def pick_port(preferred: int, tries: int = 50):
    """Returns (port, already_running).

    The port matters: the browser keeps progress, settings and the installed app per
    address (http://127.0.0.1:<port>), so always use the same one when possible.
    """
    if port_free(preferred):
        return preferred, False
    if is_studyblock(preferred):
        return preferred, True
    for port in range(preferred + 1, preferred + tries):
        if port_free(port):
            return port, False
    raise SystemExit(f"No free port found between {preferred} and {preferred + tries - 1}.")


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".md": "text/markdown; charset=utf-8",
        ".csv": "text/csv; charset=utf-8",
        ".svg": "image/svg+xml",
    }

    def end_headers(self):
        # Always serve fresh files so edits show up on the next reload.
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):  # keep the window quiet except for errors
        if args and str(args[1])[:1] in "45":
            sys.stderr.write("  ! %s %s\n" % (args[1], args[0]))


def main() -> None:
    ap = argparse.ArgumentParser(description="Serve StudyBlock locally.")
    ap.add_argument("--port", type=int, default=8000, help="first port to try (default 8000)")
    ap.add_argument("--no-browser", action="store_true", help="don't open a browser tab")
    args = ap.parse_args()

    port, already = pick_port(args.port)
    url = f"http://{HOST}:{port}/"

    if already:
        print()
        print("  StudyBlock is already running at", url, "- opening it.")
        if not args.no_browser:
            webbrowser.open(url)
        return

    handler = functools.partial(Handler, directory=ROOT)
    server = http.server.ThreadingHTTPServer((HOST, port), handler)

    print()
    print("  StudyBlock is running at", url)
    print("  Only this computer can open it.")
    if port != args.port:
        print()
        print(f"  NOTE: port {args.port} is used by another program, so this is a different")
        print("  address than usual. Progress, settings and the installed app are kept per")
        print(f"  address, so they will look empty here. Free port {args.port} and relaunch to")
        print("  get your usual StudyBlock back.")
    print()
    print("  Close this window (or press Ctrl+C) to stop the server.")
    print()

    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        print("  Stopped.")


if __name__ == "__main__":
    main()
