from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .database import init_db
from .routers import ai, auth, events, notifications, rides


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="FestRide API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.frontend_origin.split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(events.router)
app.include_router(rides.router)
app.include_router(rides.requests_router)
app.include_router(ai.router)
app.include_router(notifications.router)


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "ai_enabled": settings.ai_enabled}
