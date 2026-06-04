import socketio
import logging

logger = logging.getLogger(__name__)

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=[
        "http://localhost",
        "http://localhost:80",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
    logger=False,
    engineio_logger=False,
)

sio_app = socketio.ASGIApp(sio, socketio_path="/socket.io")


@sio.event
async def connect(sid, environ):
    logger.info(f"Client connected: {sid}")


@sio.event
async def disconnect(sid):
    logger.info(f"Client disconnected: {sid}")


@sio.event
async def subscribe(sid, data):
    """Subscribe to specific channels (events, markets, flights, vessels, tension)."""
    channels = data.get("channels", [])
    for channel in channels:
        await sio.enter_room(sid, channel)
        logger.debug(f"Client {sid} subscribed to {channel}")


@sio.event
async def unsubscribe(sid, data):
    channels = data.get("channels", [])
    for channel in channels:
        await sio.leave_room(sid, channel)


async def emit_event(channel: str, event_type: str, data: dict):
    """Emit an event to all subscribers of a channel."""
    await sio.emit(event_type, data, room=channel)


async def emit_to_all(event_type: str, data: dict):
    """Emit to all connected clients."""
    await sio.emit(event_type, data)
