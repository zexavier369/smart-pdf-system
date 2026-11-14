import sys
import os
from pathlib import Path

# Pastikan folder backend masuk ke sistem import Python
root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Muat instance FastAPI utama
from app.main import app
