"""Modelo de ocupación: predice qué tan llena irá una línea dentro de 15 minutos.

Es una regresión lineal con regularización (ridge), entrenada con mínimos cuadrados.
No usa librerías externas, así la imagen no instala nada.
"""

import json

PREDICTION_MINUTES = 15
KNOWN_LINES = ("L1C", "L7A", "L7B")
MAX_PREDICTED_RATIO = 1.5
# El fin de semana se agrupa en bloques de 4 horas: hay menos viajes para aprender.
WEEKEND_HOUR_BLOCKS = 6
FEATURE_NAMES = (
    ("bias", "current_ratio", "weekend", "current_ratio_weekend")
    + tuple("hour_%02d" % hour for hour in range(24))
    + tuple("weekend_block_%d" % block for block in range(WEEKEND_HOUR_BLOCKS))
    + tuple("line_" + line_id for line_id in KNOWN_LINES)
)


def normalize_line(route_id):
    """Acepta "L7B", "route-7B" o "7b" y entrega "L7B". Una línea desconocida da ""."""
    code = str(route_id).strip().upper()
    for prefix in ("ROUTE-", "L"):
        if code.startswith(prefix):
            code = code[len(prefix):]
    line_id = "L" + code
    return line_id if line_id in KNOWN_LINES else ""


def features(current_ratio, hour, day_of_week, route_id):
    """Convierte una consulta en los números que usa el modelo. Cada hora tiene su
    propia variable, así el modelo aprende las horas punta sin que se las digan."""
    weekend = 1.0 if day_of_week in (0, 6) else 0.0
    line_id = normalize_line(route_id)
    weekend_block = hour * WEEKEND_HOUR_BLOCKS // 24
    return (
        [1.0, current_ratio, weekend, current_ratio * weekend]
        + [1.0 if hour == each_hour else 0.0 for each_hour in range(24)]
        + [weekend if block == weekend_block else 0.0 for block in range(WEEKEND_HOUR_BLOCKS)]
        + [1.0 if line_id == known else 0.0 for known in KNOWN_LINES]
    )


def solve_linear_system(matrix, values):
    """Resuelve matrix × x = values con eliminación gaussiana y pivoteo parcial."""
    size = len(values)
    rows = [list(matrix[row_index]) + [values[row_index]] for row_index in range(size)]
    for column in range(size):
        pivot = max(range(column, size), key=lambda row_index: abs(rows[row_index][column]))
        if abs(rows[pivot][column]) < 1e-12:
            raise ValueError("el sistema no tiene solución única")
        rows[column], rows[pivot] = rows[pivot], rows[column]
        for row_index in range(column + 1, size):
            factor = rows[row_index][column] / rows[column][column]
            for other_column in range(column, size + 1):
                rows[row_index][other_column] -= factor * rows[column][other_column]
    solution = [0.0] * size
    for row_index in reversed(range(size)):
        known = sum(rows[row_index][column] * solution[column] for column in range(row_index + 1, size))
        solution[row_index] = (rows[row_index][size] - known) / rows[row_index][row_index]
    return solution


def train_weights(samples, targets, regularization=0.1):
    """Ridge: minimiza el error cuadrático más regularization × pesos². El sesgo no
    se regulariza."""
    size = len(samples[0])
    normal_matrix = [[0.0] * size for _ in range(size)]
    normal_values = [0.0] * size
    for sample, target in zip(samples, targets):
        for row_index in range(size):
            normal_values[row_index] += sample[row_index] * target
            for column in range(size):
                normal_matrix[row_index][column] += sample[row_index] * sample[column]
    for index in range(1, size):
        normal_matrix[index][index] += regularization
    return solve_linear_system(normal_matrix, normal_values)


def occupancy_level(ratio):
    """Los mismos límites de OccupancyService en backend-go."""
    if ratio < 0.4:
        return "LOW"
    if ratio < 0.7:
        return "MEDIUM"
    if ratio < 0.9:
        return "HIGH"
    return "FULL"


class OccupancyModel:
    def __init__(self, weights, name, mean_absolute_error):
        if len(weights) != len(FEATURE_NAMES):
            raise ValueError("el modelo tiene %d pesos y se esperaban %d" % (len(weights), len(FEATURE_NAMES)))
        self.weights = weights
        self.name = name
        self.mean_absolute_error = mean_absolute_error

    def predict_ratio(self, current_ratio, hour, day_of_week, route_id):
        values = features(current_ratio, hour, day_of_week, route_id)
        predicted = sum(weight * value for weight, value in zip(self.weights, values))
        return min(MAX_PREDICTED_RATIO, max(0.0, predicted))

    def confidence(self):
        """Con un error medio de 0,05, la confianza es 0,9. Nunca baja de 0."""
        return round(max(0.0, 1 - 2 * self.mean_absolute_error), 3)

    def to_json(self):
        return json.dumps({
            "name": self.name, "prediction_minutes": PREDICTION_MINUTES,
            "mean_absolute_error": round(self.mean_absolute_error, 6),
            "features": dict(zip(FEATURE_NAMES, (round(weight, 6) for weight in self.weights))),
        }, indent=2, ensure_ascii=False) + "\n"

    @classmethod
    def from_json(cls, text):
        data = json.loads(text)
        weights = [float(data["features"][feature_name]) for feature_name in FEATURE_NAMES]
        return cls(weights, data["name"], float(data["mean_absolute_error"]))
