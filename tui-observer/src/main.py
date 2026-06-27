"""
Aegis TUI Observer — Main Entry Point.

Starts the Textual Swarm Monitor dashboard which connects to the local
Edge WebSocket server and visualizes active neighborhood grid cells.
"""

try:
    from .app import AegisTuiApp
except ImportError:
    from app import AegisTuiApp


def main() -> None:
    """Launch the Aegis Swarm Monitor."""
    app = AegisTuiApp()
    app.run()


if __name__ == "__main__":
    main()
