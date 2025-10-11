"""
ai_module_platform.py
----------------------

FastAPI service for the Onboardian Instructional Design AI "brain".
Includes health check, CORS, analysis, blueprint generation, validation,
and an optional upload endpoint (if python-multipart is installed).

Endpoints:
  GET  /health
  POST /analyse       (UK)
  POST /analyze       (US alias -> /analyse)
  POST /blueprint
  POST /validate
  POST /upload        (only if python-multipart available)
"""

from typing import List, Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# --------------------------------------------------------------------------------------
# App & CORS (keep allow_origins=["*"] for easiest first run; tighten later if needed)
# --------------------------------------------------------------------------------------

app = FastAPI(title="Onboardian Instructional Design AI Platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],            # TODO: replace with exact origins when ready
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}


# --------------------------------------------------------------------------------------
# (Optional) File upload support — only if python-multipart is installed
# --------------------------------------------------------------------------------------
# We conditionally import UploadFile & File so the app still runs even if
# python-multipart is not present. If available, we define /upload.

try:
    from fastapi import UploadFile, File  # type: ignore

    MULTIPART_AVAILABLE = True
except Exception:  # pragma: no cover
    MULTIPART_AVAILABLE = False


# --------------------------------------------------------------------------------------
# Placeholder logic (replace with real integrations as you wire up services)
# --------------------------------------------------------------------------------------

class VectorStore:
    """Simple stub for a vector database."""
    def __init__(self):
        self.documents = []  # store tuples of (content, metadata)

    def index_document(self, content: str, metadata: Dict):
        # TODO: generate embeddings and store in actual vector DB
        self.documents.append((content, metadata))

    def semantic_search(self, query: str, top_k: int = 5) -> List[Dict]:
        # TODO: perform semantic search using embeddings
        return []


vector_store = VectorStore()


def parse_document(file_bytes: bytes, filename: str) -> str:
    """Stub for multi-modal content parsing. Accepts file bytes and returns raw text."""
    # TODO: implement parsing for PDF, DOCX, PPTX, etc.
    try:
        return file_bytes.decode("utf-8")
    except Exception:
        return ""


def classify_content(text: str) -> Dict[str, float]:
    """Stub for domain & structure recognition. Returns mapping of domains to confidence."""
    # TODO: integrate NLP models or heuristic rules
    return {"factual": 0.3, "procedural": 0.4, "conceptual": 0.3}


def generate_objectives(text: str) -> List[str]:
    """Stub for objective inference. Replace with LLM call when ready."""
    # TODO: call an LLM API and generate domain-appropriate objectives
    return [
        "Explain key concepts from the input file with 100% accuracy.",
        "Apply the described procedures in a simulated environment with ≥85% success.",
    ]


def select_archetypes(domains: Dict[str, float]) -> List[str]:
    """Select relevant archetypes based on content domains."""
    primary = max(domains, key=domains.get)
    mapping = {
        "factual": "Knowledge",
        "procedural": "Procedural",
        "conceptual": "Leadership",
    }
    primary_arch = mapping.get(primary, "Knowledge")
    secondary_arch = [arch for arch in mapping.values() if arch != primary_arch][:2]
    return [primary_arch] + secondary_arch


def build_blueprint(objectives: List[str], archetypes: List[str]) -> Dict:
    """Generate a simple module blueprint skeleton."""
    return {
        "overview": {
            "title": "Generated Module",
            "archetypes": archetypes,
            "objectives": objectives,
        },
        "sections": [
            {"name": "Module Overview", "duration": "5 min"},
            {"name": "Pre-Assessment", "duration": "5 min"},
            {"name": "Core Learning", "duration": "25 min"},
            {"name": "Application Workshop", "duration": "30 min"},
            {"name": "Assessment", "duration": "10 min"},
            {"name": "Resources", "duration": "5 min"},
        ],
    }


def validate_inputs(required_fields: Dict[str, bool]) -> bool:
    """Check that all required fields are present before generation."""
    return all(required_fields.values())


# --------------------------------------------------------------------------------------
# Pydantic request/response models
# --------------------------------------------------------------------------------------

class AnalysisRequest(BaseModel):
    content: str = Field(..., description="Raw text extracted from uploaded file")


class AnalysisResponse(BaseModel):
    domains: Dict[str, float]
    archetypes: List[str]
    objectives: List[str]


class BlueprintRequest(BaseModel):
    objectives: List[str]
    archetypes: List[str]


class BlueprintResponse(BaseModel):
    blueprint: Dict


class ValidationRequest(BaseModel):
    required_fields: Dict[str, bool]


class ValidationResponse(BaseModel):
    valid: bool
    message: str


# --------------------------------------------------------------------------------------
# API endpoints
# --------------------------------------------------------------------------------------

@app.post("/analyse", response_model=AnalysisResponse)
async def analyse_document(request: AnalysisRequest):
    """Analyse input content, classify domains, infer objectives and suggest archetypes."""
    if not request.content or not request.content.strip():
        raise HTTPException(status_code=400, detail="No content provided.")
    domains = classify_content(request.content)
    objectives = generate_objectives(request.content)
    archetypes = select_archetypes(domains)
    return AnalysisResponse(domains=domains, archetypes=archetypes, objectives=objectives)


# US spelling alias — lets callers use /analyze interchangeably
@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_alias(request: AnalysisRequest):
    return await analyse_document(request)


@app.post("/blueprint", response_model=BlueprintResponse)
async def generate_blueprint(req: BlueprintRequest):
    """Generate a module blueprint given objectives and archetypes."""
    if not req.objectives or not req.archetypes:
        raise HTTPException(status_code=400, detail="Objectives and archetypes are required.")
    blueprint = build_blueprint(req.objectives, req.archetypes)
    return BlueprintResponse(blueprint=blueprint)


@app.post("/validate", response_model=ValidationResponse)
async def validate_module(req: ValidationRequest):
    """Validate that all required fields are present before module generation."""
    valid = validate_inputs(req.required_fields or {})
    msg = "All required inputs provided." if valid else "Missing required fields; generation blocked."
    return ValidationResponse(valid=valid, message=msg)


# Optional upload endpoint if python-multipart is installed
if MULTIPART_AVAILABLE:
    @app.post("/upload", response_model=AnalysisResponse)
    async def upload_file(file: UploadFile = File(...)):  # type: ignore[name-defined]
        """Accept a file upload, parse content, and run analysis."""
        contents = await file.read()
        text = parse_document(contents, file.filename)
        if not text:
            raise HTTPException(status_code=400, detail="Unable to parse uploaded file")
        domains = classify_content(text)
        objectives = generate_objectives(text)
        archetypes = select_archetypes(domains)
        return AnalysisResponse(domains=domains, archetypes=archetypes, objectives=objectives)


# --------------------------------------------------------------------------------------
# Local dev entrypoint (Railway/Render/etc. use the Procfile)
# --------------------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    # Matches Procfile defaults if you run locally
    uvicorn.run(app, host="0.0.0.0", port=8000)
