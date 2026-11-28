"""Entrena el modelo y lo guarda en model.json.

Todavía no hay historial real de pasajeros: micro_telemetry los guarda, pero no se
pueden consultar. Por eso se entrena con datos simulados que siguen los supuestos del
equipo: horas punta a las 7:45, 13:00 y 18:15, y 40 % menos pasajeros el fin de
semana. Con historial real, solo cambia generate_trips.

Uso: python train.py
"""

import math
import pathlib
import random

from occupancy_model import KNOWN_LINES, OccupancyModel, features, train_weights

RANDOM_SEED = 20261128
TRAINING_TRIPS = 6000
TEST_TRIPS = 2000
MODEL_NAME = "ridge-occupancy-v1"
MODEL_PATH = pathlib.Path(__file__).with_name("model.json")

# Qué tan llena va cada línea en su hora más tranquila y cuánto sube en punta.
LINE_DEMAND = {"L1C": (0.25, 0.55), "L7A": (0.20, 0.50), "L7B": (0.30, 0.60)}
PEAK_HOURS = ((7.75, 1.0), (13.0, 0.6), (18.25, 1.1))


def expected_ratio(line_id, hour, day_of_week):
    base, peak_increase = LINE_DEMAND[line_id]
    peak = sum(strength * math.exp(-((hour - peak_hour) ** 2) / 1.5) for peak_hour, strength in PEAK_HOURS)
    weekend_factor = 0.6 if day_of_week in (0, 6) else 1.0
    return (base + peak_increase * min(peak, 1.0)) * weekend_factor


def generate_trips(count, generator):
    """Cada viaje es una lectura de una micro y su ocupación 15 minutos después:
    se acerca a lo habitual de esa hora, con variación aleatoria."""
    samples, targets = [], []
    for _ in range(count):
        line_id = generator.choice(KNOWN_LINES)
        hour, day_of_week = generator.randrange(24), generator.randrange(7)
        current = max(0.0, expected_ratio(line_id, hour, day_of_week) + generator.gauss(0, 0.15))
        later = expected_ratio(line_id, (hour + 0.25) % 24, day_of_week)
        future = max(0.0, 0.55 * current + 0.45 * later + generator.gauss(0, 0.05))
        samples.append(features(current, hour, day_of_week, line_id))
        targets.append(future)
    return samples, targets


def mean_absolute_error(predictions, targets):
    return sum(abs(predicted - target) for predicted, target in zip(predictions, targets)) / len(targets)


def train():
    """Entrena con unos viajes y mide el error con otros que el modelo no vio."""
    generator = random.Random(RANDOM_SEED)
    training_samples, training_targets = generate_trips(TRAINING_TRIPS, generator)
    test_samples, test_targets = generate_trips(TEST_TRIPS, generator)
    weights = train_weights(training_samples, training_targets)
    predictions = [sum(weight * value for weight, value in zip(weights, sample)) for sample in test_samples]
    model_error = mean_absolute_error(predictions, test_targets)
    # Referencia: suponer que la ocupación no cambia (la columna 1 es la actual).
    unchanged_error = mean_absolute_error([sample[1] for sample in test_samples], test_targets)
    return OccupancyModel(weights, MODEL_NAME, model_error), unchanged_error


if __name__ == "__main__":
    model, unchanged_error = train()
    MODEL_PATH.write_text(model.to_json(), encoding="utf-8")
    print("error medio del modelo: %.4f" % model.mean_absolute_error)
    print("error medio suponiendo que no cambia: %.4f" % unchanged_error)
    print("guardado en", MODEL_PATH.name)
