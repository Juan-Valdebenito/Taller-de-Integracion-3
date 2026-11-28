"""Pruebas del modelo y de la API. Uso: python -m unittest -v"""

import datetime
import json
import pathlib
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import train
from occupancy_model import OccupancyModel, normalize_line, solve_linear_system, train_weights
from server import InvalidRequest, make_handler, predict

MODEL_PATH = pathlib.Path(__file__).with_name("model.json")
NOW = datetime.datetime(2026, 11, 30, 12, tzinfo=datetime.timezone.utc)


def load_model():
    return OccupancyModel.from_json(MODEL_PATH.read_text(encoding="utf-8"))


# Entrenar tarda unos segundos: se hace una sola vez para todas las pruebas.
TRAINED_MODEL, UNCHANGED_ERROR = train.train()


class ModelTest(unittest.TestCase):
    def test_solves_known_system(self):
        # 2x + y = 5 y x + 3y = 10 → x = 1, y = 3. El pivoteo evita el 0 inicial.
        solution = solve_linear_system([[0.0, 1.0], [1.0, 0.0]], [3.0, 1.0])
        self.assertAlmostEqual(solution[0], 1.0)
        self.assertEqual([round(value, 9) for value in solve_linear_system([[2, 1], [1, 3]], [5, 10])], [1, 3])

    def test_recovers_exact_line(self):
        samples = [[1.0, float(value)] for value in range(10)]
        weights = train_weights(samples, [3 + 2 * sample[1] for sample in samples], regularization=0)
        self.assertAlmostEqual(weights[0], 3)
        self.assertAlmostEqual(weights[1], 2)

    def test_normalizes_line_ids(self):
        for route_id in ("L7B", "route-7B", "route-7b", " 7b "):
            self.assertEqual(normalize_line(route_id), "L7B")
        self.assertEqual(normalize_line("uuid-de-la-base"), "")

    def test_saved_model_is_reproducible(self):
        # model.json es exactamente lo que produce train.py.
        self.assertEqual(TRAINED_MODEL.to_json(), MODEL_PATH.read_text(encoding="utf-8"))

    def test_model_beats_unchanged_guess(self):
        self.assertLess(TRAINED_MODEL.mean_absolute_error, 0.06)
        self.assertLess(TRAINED_MODEL.mean_absolute_error, UNCHANGED_ERROR * 0.8)

    def test_learned_patterns(self):
        model = load_model()
        # Con la micro a la mitad, en punta se llena más que de madrugada y que el
        # domingo; y una micro más llena hoy sigue más llena después.
        rush = model.predict_ratio(0.5, 18, 2, "L7B")
        self.assertGreater(rush, model.predict_ratio(0.5, 3, 2, "L7B") + 0.1)
        self.assertGreater(rush, model.predict_ratio(0.5, 18, 0, "L7B"))
        self.assertGreater(model.predict_ratio(0.9, 10, 2, "L1C"), model.predict_ratio(0.3, 10, 2, "L1C") + 0.2)
        self.assertGreaterEqual(model.predict_ratio(0.0, 3, 0, "otra"), 0.0)


class PredictTest(unittest.TestCase):
    def setUp(self):
        self.model = load_model()

    def test_answer_has_backend_go_fields(self):
        body = {"route_id": "route-7B", "current_passengers": 30, "capacity": 40, "hour": 18, "day_of_week": 2}
        answer = predict(self.model, body, NOW)
        self.assertEqual(set(answer), {"predicted_ratio", "predicted_passengers", "occupancy_level",
                                       "confidence", "predictor_name", "predicted_at"})
        self.assertEqual(answer["predicted_passengers"], round(answer["predicted_ratio"] * 40))
        self.assertEqual(answer["predicted_at"], "2026-11-30T12:00:00Z")
        self.assertGreater(answer["confidence"], 0.8)

    def test_rejects_invalid_requests(self):
        valid = {"route_id": "L1C", "current_passengers": 10, "capacity": 40, "hour": 8, "day_of_week": 1}
        for field_name, value in (("capacity", 0), ("capacity", 501), ("current_passengers", 81),
                                  ("current_passengers", -1), ("hour", 24), ("day_of_week", 7),
                                  ("hour", True), ("hour", 8.5), ("route_id", 7), ("route_id", "x" * 101)):
            with self.subTest(field=field_name, value=value):
                with self.assertRaises(InvalidRequest):
                    predict(self.model, dict(valid, **{field_name: value}), NOW)
        with self.assertRaises(InvalidRequest):
            predict(self.model, [valid], NOW)


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(load_model()))
        cls.base_url = "http://127.0.0.1:%d" % cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def request(self, path, body=None):
        request = urllib.request.Request(self.base_url + path, data=body, method="POST" if body else "GET")
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())

    def test_endpoints(self):
        self.assertEqual(self.request("/health")[0], 200)
        body = json.dumps({"route_id": "L7A", "current_passengers": 5, "capacity": 40, "hour": 8, "day_of_week": 1})
        status, answer = self.request("/predict", body.encode())
        self.assertEqual(status, 200)
        self.assertIn(answer["occupancy_level"], ("LOW", "MEDIUM", "HIGH", "FULL"))
        self.assertEqual(self.request("/predict", b"{no es json")[0], 400)
        self.assertEqual(self.request("/predict", b"x" * 5000)[0], 400)
        self.assertEqual(self.request("/otra", b"{}")[0], 404)


if __name__ == "__main__":
    unittest.main()
