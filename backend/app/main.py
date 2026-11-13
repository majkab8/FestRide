from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from .config import DEFAULT_SECRET_KEY, Settings, settings
from .database import init_db
from .routers import ai, auth, events, notifications, rides


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


def create_app(config: Settings = settings) -> FastAPI:
    if config.static_dir and config.secret_key == DEFAULT_SECRET_KEY:
        raise RuntimeError("SECRET_KEY must be set before the app is served publicly")

    app = FastAPI(title="FestRide API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in config.frontend_origin.split(",") if origin.strip()],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    api = APIRouter(prefix=config.api_prefix)
    for router in (auth.router, events.router, rides.router, rides.requests_router, ai.router, notifications.router):
        api.include_router(router)

    @api.get("/health", tags=["meta"])
    def health() -> dict:
        return {"status": "ok", "ai_enabled": config.ai_enabled}

    app.include_router(api)
    if config.static_dir:
        serve_frontend(app, Path(config.static_dir), config.api_prefix)
    return app


def serve_frontend(app: FastAPI, root: Path, api_prefix: str) -> None:
    root = root.resolve()
    index = root / "index.html"
    api_path = api_prefix.strip("/")

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str) -> FileResponse:
        if api_path and (path == api_path or path.startswith(api_path + "/")):
            raise HTTPException(status_code=404, detail="Not Found")
        file = (root / path).resolve()
        if path and file.is_file() and file.is_relative_to(root):
            cache = "public, max-age=31536000, immutable" if path.startswith("assets/") else "no-cache"
            return FileResponse(file, headers={"Cache-Control": cache})
        return FileResponse(index, headers={"Cache-Control": "no-cache"})


app = create_app()
