import json
import asyncio
import websockets
from textual import work
from textual.app import App, ComposeResult
from textual.containers import Container, Grid
from textual.widgets import Header, Footer, Log, Static

# Cyberpunk TUI Styling
TCSS = """
Screen {
    background: #0b0f19;
}

#main-layout {
    layout: horizontal;
    width: 100%;
    height: 100%;
}

#left-panel {
    width: 45%;
    height: 100%;
    padding: 1;
}

#right-panel {
    width: 55%;
    height: 100%;
    align: center middle;
    padding: 1;
}

.panel-container {
    background: #111827;
    border: solid #1f2937;
    border-title-color: #38bdf8;
    border-title-align: left;
    height: 100%;
    padding: 1;
}

#left-panel-container {
    border-title: "🛡️ LIVE NETWORK TRAFFIC";
}

#right-panel-container {
    border-title: "🗺️ SWARM GEOGRID (500M PRECISION)";
    align: center middle;
}

Log {
    background: #030712;
    border: solid #1f2937;
    color: #10b981;
    font-family: "Courier New", monospace;
}

#grid-container {
    layout: grid;
    grid-size: 3 3;
    grid-gutter: 1 2;
    width: 48;
    height: 15;
}

.grid-cell {
    background: #1f2937;
    border: solid #374151;
    content-align: center middle;
    color: #9ca3af;
    text-align: center;
    font-weight: bold;
}

.grid-cell.center-cell {
    border: double #38bdf8;
    color: #38bdf8;
    background: #0f172a;
}

.grid-cell.alerting {
    background: #ef4444;
    border: double #f87171;
    color: #ffffff;
}
"""

class AegisTuiApp(App):
    TITLE = "Aegis Observability Swarm Monitor"
    SUB_TITLE = "Zero-Knowledge Local GeoGrid Viewer"
    CSS = TCSS

    BINDINGS = [
        ("q", "quit", "Quit application"),
        ("c", "clear_logs", "Clear Logs"),
    ]

    # The 9-cell grid mapping around center cell '9q8yyk'
    GRID_CELLS = [
        "9q8yye", "9q8yym", "9q8yyq",  # Top Row (NW, N, NE)
        "9q8yyd", "9q8yyk", "9q8yyp",  # Mid Row (W, Center, E)
        "9q8yyh", "9q8yyj", "9q8yyn"   # Bot Row (SW, S, SE)
    ]

    def compose(self) -> ComposeResult:
        yield Header()
        with Container(id="main-layout"):
            # Left pane: Logs
            with Container(id="left-panel"):
                with Container(id="left-panel-container", classes="panel-container"):
                    yield Log()
            # Right pane: Visual GeoGrid
            with Container(id="right-panel"):
                with Container(id="right-panel-container", classes="panel-container"):
                    with Grid(id="grid-container"):
                        for cell in self.GRID_CELLS:
                            is_center = (cell == "9q8yyk")
                            classes = "grid-cell center-cell" if is_center else "grid-cell"
                            yield Static(
                                f"{cell.upper()}\n[Center]" if is_center else f"{cell.upper()}",
                                id=f"cell-{cell}",
                                classes=classes
                            )
        yield Footer()

    def on_mount(self) -> None:
        self.log_widget = self.query_one(Log)
        self.log_widget.write_line("🛡️ Aegis swarm observer TUI initialized.")
        self.websocket_worker()

    def action_clear_logs(self) -> None:
        self.log_widget.clear()
        self.log_widget.write_line("🧹 Logs cleared.")

    @work(exclusive=True)
    async def websocket_worker(self) -> None:
        uri = "ws://localhost:8080"
        self.log_widget.write_line(f"🔗 Connecting to Edge WebSocket Router at {uri}...")

        while True:
            try:
                async with websockets.connect(uri) as ws:
                    self.log_widget.write_line("✅ Connected to Edge Router!")

                    # Receive welcome message with session ID
                    welcome = await ws.recv()
                    data = json.loads(welcome)
                    session_id = data.get("sessionId")
                    self.log_widget.write_line(f"🔑 Client Session ID assigned: {session_id}")

                    # Subscribe to our 9-cell grid
                    subscribe_payload = {
                        "type": "SUBSCRIBE",
                        "geohashes": self.GRID_CELLS,
                        "sessionId": session_id
                    }
                    await ws.send(json.dumps(subscribe_payload))
                    self.log_widget.write_line("📡 Subscribed to demo grid cells.")

                    # Listen for incoming payloads
                    async for message in ws:
                        payload = json.loads(message)
                        self.log_widget.write_line(f"📥 Payload: {json.dumps(payload)}")

                        if payload.get("type") == "ALERT_RELAY":
                            alert = payload.get("alert", {})
                            geohash = alert.get("geohash")
                            severity = alert.get("severity")
                            msg = alert.get("message")
                            sender = alert.get("originSessionId")
                            self.log_widget.write_line(
                                f"🚨 ALERT in {geohash} [{severity}] from peer {sender}: {msg}"
                            )
                            self.flash_cell(geohash)

            except (websockets.exceptions.ConnectionClosed, ConnectionRefusedError, OSError) as e:
                self.log_widget.write_line(f"❌ Connection error: {e}. Reconnecting in 5s...")
                await asyncio.sleep(5)

    def flash_cell(self, geohash: str) -> None:
        """Flash a specific grid cell reactively on alert."""
        try:
            cell_widget = self.query_one(f"#cell-{geohash}", Static)
            cell_widget.add_class("alerting")
            # Set timer to remove alerting highlight after 2.0 seconds
            self.set_timer(2.0, lambda c=cell_widget: c.remove_class("alerting"))
        except Exception:
            self.log_widget.write_line(f"⚠️ Cell '{geohash}' is not in the visual grid.")

if __name__ == "__main__":
    app = AegisTuiApp()
    app.run()
