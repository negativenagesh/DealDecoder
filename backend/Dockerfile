FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    libmupdf-dev \
    && rm -rf /var/lib/apt/lists/*

RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app

COPY pyproject.toml README.md ./
RUN uv pip install --system -e .

COPY . .

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
