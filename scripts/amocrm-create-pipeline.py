"""One-off amoCRM setup: create the VITTORIA HOME pipeline with the 7 order stages.

Usage (token NOT stored here — pass via env):
    AMOCRM_TOKEN=<long-lived-token> python scripts/amocrm-create-pipeline.py

Idempotency: if a pipeline named "VITTORIA HOME" already exists, it prints its
ids instead of creating a duplicate. Prints stage name -> status_id mapping.
"""
import json
import os
import sys
import urllib.request
import urllib.error

BASE = "https://vittoriaamo.amocrm.ru"
TOKEN = os.environ.get("AMOCRM_TOKEN", "")
if not TOKEN:
    print("ERROR: set AMOCRM_TOKEN env var")
    sys.exit(1)

STAGES = [
    ("preparation_for_production", "Подготовка для производства", "#fffeb2"),
    ("detailing", "Деталировка", "#fffd7f"),
    ("materials_arrival", "Поступление материалов на склад", "#fff000"),
    ("production", "Производство изделия", "#ffeab2"),
    ("transfer_to_warehouse", "Передача готового изделия на склад", "#ffdc7f"),
    ("completeness_check", "Проверка комплектности товара", "#ffce5a"),
    ("ready_for_delivery", "Готовность к передаче клиенту", "#87f2c0"),
]


def api(method, path, payload=None):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None  # ensure_ascii=True -> \u escapes
    req = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8") or "{}")


def find_existing():
    code, body = api("GET", "/api/v4/leads/pipelines")
    for p in body.get("_embedded", {}).get("pipelines", []):
        if (p.get("name") or "").strip().upper() == "VITTORIA HOME":
            return p
    return None


def main():
    existing = find_existing()
    if existing:
        print("ALREADY EXISTS pipeline_id:", existing.get("id"))
        pipeline = existing
    else:
        payload = [{
            "name": "VITTORIA HOME",
            "is_main": False,
            "is_unsorted_on": False,
            "sort": 1000,
            "_embedded": {
                "statuses": [
                    {"name": ru, "sort": (i + 1) * 10, "color": color}
                    for i, (_key, ru, color) in enumerate(STAGES)
                ]
            },
        }]
        code, body = api("POST", "/api/v4/leads/pipelines", payload)
        if code not in (200, 201):
            print("CREATE FAILED", code, json.dumps(body, ensure_ascii=False)[:600])
            sys.exit(2)
        pipeline = body.get("_embedded", {}).get("pipelines", [{}])[0]
        print("CREATED pipeline_id:", pipeline.get("id"))

    # Build stage_key -> status_id by matching Russian names
    name_to_key = {ru: key for key, ru, _c in STAGES}
    mapping = {}
    for s in pipeline.get("_embedded", {}).get("statuses", []):
        key = name_to_key.get((s.get("name") or "").strip())
        if key:
            mapping[key] = s.get("id")
        print("  status", s.get("id"), "|", s.get("sort"), "|", repr(s.get("name")))
    print("PIPELINE_ID=" + str(pipeline.get("id")))
    print("STAGE_STATUS_MAP=" + json.dumps(mapping))


if __name__ == "__main__":
    main()
