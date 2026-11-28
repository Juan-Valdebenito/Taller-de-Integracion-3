# Solo usa la biblioteca estándar de Python: no se instala nada.
FROM python:3.12-slim

WORKDIR /app
COPY occupancy_model.py server.py train.py test_prediction.py model.json ./
# Si el modelo o la API fallan sus pruebas, la imagen no se construye.
RUN python -B -m unittest -q test_prediction && rm test_prediction.py

RUN useradd --no-create-home --uid 10001 appuser
USER appuser
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
EXPOSE 8000
CMD ["python", "server.py"]
