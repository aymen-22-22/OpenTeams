FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .
COPY alembic.ini ./
COPY migrations ./migrations
RUN useradd --create-home appuser
USER appuser
EXPOSE 8000
# One worker: the scheduler and the WebSocket hub live in this process.
# --proxy-headers: real client IPs from Caddy (for login rate limiting); the API port is not published.
# No access log: URLs can contain private tokens; the app logs route patterns instead.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*' --no-access-log"]
