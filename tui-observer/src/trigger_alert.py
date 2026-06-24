import asyncio
import json
import random
import websockets

# The 9-cell grid mapping used by the observer TUI
GRID_CELLS = [
    "9q8yye", "9q8yym", "9q8yyq",
    "9q8yyd", "9q8yyk", "9q8yyp",
    "9q8yyh", "9q8yyj", "9q8yyn"
]

SEVERITIES = ["INFO", "WARNING", "CRITICAL"]
MESSAGES = [
    "Water main break reported on 5th Avenue.",
    "Suspicious package spotted near the post office.",
    "Stray dog sighted block 4.",
    "Gas leak detected at the corner store.",
    "Power outage reported in the western sector."
]

async def trigger():
    uri = "ws://localhost:8080"
    print(f"Connecting to {uri} to trigger alert...")
    try:
        async with websockets.connect(uri) as ws:
            # Receive welcome message
            welcome = await ws.recv()
            welcome_data = json.loads(welcome)
            session_id = welcome_data.get("sessionId")
            print(f"Connected with Session ID: {session_id}")

            # Pick random geohash, severity, and message
            geohash = random.choice(GRID_CELLS)
            severity = random.choice(SEVERITIES)
            msg = random.choice(MESSAGES)

            alert_payload = {
                "type": "ALERT",
                "geohash": geohash,
                "severity": severity,
                "message": msg,
                "timestamp": "2026-06-24T22:00:00Z",
                "originSessionId": session_id
            }

            await ws.send(json.dumps(alert_payload))
            print(f"Sent mock ALERT payload: {json.dumps(alert_payload)}")

            # Receive ack
            ack = await ws.recv()
            print(f"Received ACK: {ack}")

    except Exception as e:
        print(f"Error triggering alert: {e}")

if __name__ == "__main__":
    asyncio.run(trigger())
