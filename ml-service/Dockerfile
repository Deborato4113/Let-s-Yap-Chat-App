FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
# CPU-only torch keeps the image far smaller than the default CUDA build.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt
COPY app.py .
# Download the model at build time so cold starts don't wait on it.
RUN python -c "from detoxify import Detoxify; Detoxify('multilingual')"
ENV PORT=8001
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
