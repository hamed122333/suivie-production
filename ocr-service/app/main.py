import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.routes import rolls
from app.services import database, worker, vision_extractor

logging.basicConfig(level=logging.INFO,
                    format="[%(asctime)s] [%(levelname)8s] %(name)s — %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="OCR Roll Scanner",
    description="Capture, extraction IA et vérification des étiquettes de bobines",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(rolls.router, prefix="/api", tags=["rolls"])


@app.on_event("startup")
def on_startup():
    """Prépare la base et lance le worker d'extraction en arrière-plan."""
    try:
        database.init_db()
    except Exception as e:
        logger.error(f"Initialisation DB échouée: {e}")
    worker.start()


@app.get("/health")
def health_check():
    db_ok = database.check_db_connection()
    return {
        "status": "ok" if db_ok else "degraded",
        "service": "ocr-roll-scanner",
        "database": "connected" if db_ok else "unreachable",
        "extraction": "vision-ai + ocr-fallback" if vision_extractor.is_available()
                      else "ocr-local-only",
    }
