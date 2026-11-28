"""API del modelo: POST /predict y GET /health. Es el contrato que usa backend-go
(backend-go/internal/transport/http_client.go)."""

import datetime
import json
import os
import pathlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from occupancy_model import OccupancyModel, occupancy_level

MAX_BODY_BYTES = 4096
MAX_CAPACITY = 500


class InvalidRequest(ValueError):
    pass


def whole_number(body, field_name, minimum, maximum):
    value = body.get(field_name)
    # En Python, True es un entero: se rechaza aparte.
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise InvalidRequest("%s debe ser un entero entre %d y %d" % (field_name, minimum, maximum))
    return value


def predict(model, body, now):
    """Valida la consulta y entrega la predicción, con los nombres que espera backend-go."""
    if not isinstance(body, dict):
        raise InvalidRequest("el cuerpo debe ser un objeto JSON")
    route_id = body.get("route_id", "")
    if not isinstance(route_id, str) or len(route_id) > 100:
        raise InvalidRequest("route_id debe ser un texto de hasta 100 caracteres")
    capacity = whole_number(body, "capacity", 1, MAX_CAPACITY)
    current_passengers = whole_number(body, "current_passengers", 0, 2 * capacity)
    hour = whole_number(body, "hour", 0, 23)
    day_of_week = whole_number(body, "day_of_week", 0, 6)
    ratio = model.predict_ratio(current_passengers / capacity, hour, day_of_week, route_id)
    return {
        "predicted_ratio": round(ratio, 3),
        "predicted_passengers": round(ratio * capacity),
        "occupancy_level": occupancy_level(ratio),
        "confidence": model.confidence(),
        "predictor_name": model.name,
        "predicted_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def make_handler(model):
    class PredictionHandler(BaseHTTPRequestHandler):
        def send_json(self, status, content):
            encoded = json.dumps(content).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def do_GET(self):
            if self.path == "/health":
                self.send_json(200, {"status": "ok", "model": model.name})
            else:
                self.send_json(404, {"error": "no existe"})

        def do_POST(self):
            if self.path != "/predict":
                self.send_json(404, {"error": "no existe"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = -1
            if not 0 < length <= MAX_BODY_BYTES:
                self.send_json(400, {"error": "el cuerpo debe tener entre 1 y %d bytes" % MAX_BODY_BYTES})
                return
            try:
                body = json.loads(self.rfile.read(length))
                now = datetime.datetime.now(datetime.timezone.utc)
                self.send_json(200, predict(model, body, now))
            except (json.JSONDecodeError, UnicodeDecodeError):
                self.send_json(400, {"error": "JSON inválido"})
            except InvalidRequest as problem:
                self.send_json(400, {"error": str(problem)})

        def log_message(self, message_format, *arguments):
            # Sin datos del cuerpo: solo ruta y estado.
            print("%s %s" % (self.command, message_format % arguments), flush=True)

    return PredictionHandler


def main():
    model_path = pathlib.Path(os.environ.get("MODEL_PATH", pathlib.Path(__file__).with_name("model.json")))
    model = OccupancyModel.from_json(model_path.read_text(encoding="utf-8"))
    port = int(os.environ.get("PORT", "8000"))
    print("prediction service listening on port %d with %s" % (port, model.name), flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), make_handler(model)).serve_forever()


if __name__ == "__main__":
    main()
