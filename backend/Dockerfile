# Base image Python yang stabil dan hemat memori
FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata/

# Install dependency sistem untuk PyMuPDF, OpenCV headless, dan Tesseract OCR (bahasa Indonesia & Inggris)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-ind \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Salin dan install dependencies Python
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade -r requirements.txt

# Salin seluruh kode backend
COPY . .

# Port dinamis: mendukung port 8000 (Koyeb/Render) maupun 7860 (Hugging Face)
EXPOSE 8000 7860

# Perintah menjalankan server FastAPI: membaca $PORT jika ada, default ke 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
