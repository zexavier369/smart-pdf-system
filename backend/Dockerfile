# Menggunakan base image Python yang stabil dan hemat memori
FROM python:3.10-slim

# Mencegah Python membuat file .pyc dan memastikan output langsung tampil di log
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata/

# Install dependency sistem untuk PyMuPDF, OpenCV headless, dan Tesseract OCR (termasuk bahasa Indonesia)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-ind \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Salin dan install dependencies Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Salin seluruh kode backend
COPY . .

# Port yang dibuka untuk FastAPI
EXPOSE 8000

# Perintah menjalankan server FastAPI menggunakan Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
