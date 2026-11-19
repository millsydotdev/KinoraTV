# Kinora Synthetic Media, EPG & Xtream Codes Fixture Server
# Lightweight, secure, non-root Alpine container for local and CI testing.
FROM python:3.12-alpine

LABEL maintainer="millsydotdev" \
      description="Kinora local mock IPTV, EPG and stream fixture server" \
      version="0.6.0"

# Create non-root user
RUN addgroup -S kinora && adduser -S kinora -G kinora

WORKDIR /app

COPY server.py /app/server.py
RUN chmod +x /app/server.py && chown -R kinora:kinora /app

USER kinora

EXPOSE 18765

ENV PYTHONUNBUFFERED=1 \
    FIXTURE_HOST=0.0.0.0 \
    FIXTURE_PORT=18765

HEALTHCHECK --interval=10s --timeout=3s --start-period=2s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:18765/health')" || exit 1

ENTRYPOINT ["python3", "/app/server.py"]
