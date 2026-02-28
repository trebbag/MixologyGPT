import logging
from pythonjsonlogger import jsonlogger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from app.api.router import api_router
from app.core.config import settings
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from prometheus_fastapi_instrumentator import Instrumentator
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry import trace
from app.core.rate_limit import limiter


def _configure_logging() -> None:
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    handler = logging.StreamHandler()
    formatter = jsonlogger.JsonFormatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    handler.setFormatter(formatter)
    logger.handlers = [handler]


_configure_logging()

app = FastAPI(title=settings.app_name, version="0.1.0")


async def _json_rate_limit_exceeded_handler(request, exc: RateLimitExceeded):
    # Preserve SlowAPI headers while returning a stable JSON body for clients.
    response = _rate_limit_exceeded_handler(request, exc)
    retry_after_header = response.headers.get("Retry-After")
    retry_after: int | None = None
    if retry_after_header:
        try:
            retry_after = int(float(retry_after_header))
        except ValueError:
            retry_after = None
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Rate limit exceeded.",
            "retry_after_seconds": retry_after,
        },
        headers=dict(response.headers),
    )


app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _json_rate_limit_exceeded_handler)

if settings.otlp_endpoint:
    resource = Resource.create({"service.name": settings.app_name})
    provider = TracerProvider(resource=resource)
    processor = BatchSpanProcessor(OTLPSpanExporter(endpoint=settings.otlp_endpoint))
    provider.add_span_processor(processor)
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app)

if settings.enable_metrics:
    Instrumentator().instrument(app).expose(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(api_router, prefix="/v1")


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok"}
