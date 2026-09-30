import re
from typing import Any, Dict, List, Optional, Set
import yaml
from pathlib import Path
import jsonschema
from deepdiff import DeepDiff

SCHEMAS_PATH = Path(__file__).resolve().parent.parent / "fixtures" / "golden_schemas.yaml"

_cached_schemas: Optional[Dict[str, Any]] = None


def get_golden_schemas() -> Dict[str, Any]:
    global _cached_schemas
    if _cached_schemas is None:
        if SCHEMAS_PATH.exists():
            with open(SCHEMAS_PATH, "r", encoding="utf-8") as f:
                _cached_schemas = yaml.safe_load(f) or {}
        else:
            _cached_schemas = {}
    return _cached_schemas


def to_camel_case(snake_str: str) -> str:
    """Convert snake_case or kebab-case to camelCase."""
    components = re.split(r"[-_]", snake_str)
    if not components:
        return snake_str
    return components[0] + "".join(x.capitalize() for x in components[1:])


def unwrap_graphql(payload: Any) -> Any:
    """Unwrap GraphQL payload data/errors if present."""
    if isinstance(payload, dict):
        if "errors" in payload and payload["errors"]:
            raise ValueError(f"GraphQL Error: {payload['errors']}")
        if "data" in payload and isinstance(payload["data"], dict):
            # If data has exactly one root query/mutation key, unwrap it
            keys = list(payload["data"].keys())
            if len(keys) == 1:
                return payload["data"][keys[0]]
            return payload["data"]
    return payload


def normalize_keys(obj: Any) -> Any:
    """Recursively convert dictionary keys to camelCase."""
    if isinstance(obj, dict):
        new_dict = {}
        for k, v in obj.items():
            camel_k = to_camel_case(str(k))
            new_dict[camel_k] = normalize_keys(v)
        return new_dict
    elif isinstance(obj, list):
        return [normalize_keys(x) for x in obj]
    return obj


DEFAULT_VOLATILE_FIELDS = {
    "createdat",
    "updatedat",
    "calculatedat",
    "appliedat",
    "lastmessageat",
    "chronologicaltimestamp",
    "id",
    "uuid",
    "passwordhash",
}


def strip_volatile_fields(
    obj: Any,
    additional_ignored: Optional[Set[str]] = None
) -> Any:
    """
    Remove or mask volatile non-deterministic runtime fields (UUIDs, timestamps)
    to facilitate strict cross-backend equivalence comparisons.
    """
    ignored = {k.lower() for k in DEFAULT_VOLATILE_FIELDS}
    if additional_ignored:
        ignored.update(k.lower() for k in additional_ignored)

    if isinstance(obj, dict):
        return {
            k: strip_volatile_fields(v, additional_ignored)
            for k, v in obj.items()
            if k.lower() not in ignored
        }
    elif isinstance(obj, list):
        return [strip_volatile_fields(x, additional_ignored) for x in obj]
    return obj


def normalize_response(raw: Any, strip_volatile: bool = False) -> Any:
    """Full normalization pipeline for any backend response."""
    unwrapped = unwrap_graphql(raw)
    camel_cased = normalize_keys(unwrapped)
    if strip_volatile:
        return strip_volatile_fields(camel_cased)
    return camel_cased


def validate_schema(data: Any, schema_name: str) -> bool:
    """Validate normalized data against a golden schema."""
    schemas = get_golden_schemas()
    if schema_name not in schemas:
        raise ValueError(f"Schema '{schema_name}' not found in golden_schemas.yaml")
    
    schema = schemas[schema_name]
    normalized = normalize_response(data, strip_volatile=False)
    
    # If list, validate each item
    if isinstance(normalized, list) and schema.get("type") == "object":
        for item in normalized:
            jsonschema.validate(instance=item, schema=schema)
    else:
        jsonschema.validate(instance=normalized, schema=schema)
    return True


def assert_conformance(
    actual: Any,
    expected_schema: Optional[str] = None,
    compare_with: Optional[Any] = None,
    tolerance: float = 0.01,
) -> bool:
    """
    Assert that actual conforms to golden schema AND matches an expected response
    across backends within numeric tolerance.
    """
    norm_actual = normalize_response(actual, strip_volatile=False)

    if expected_schema:
        validate_schema(norm_actual, expected_schema)

    if compare_with is not None:
        norm_expected = normalize_response(compare_with, strip_volatile=False)
        actual_stripped = strip_volatile_fields(norm_actual)
        expected_stripped = strip_volatile_fields(norm_expected)

        diff = DeepDiff(
            actual_stripped,
            expected_stripped,
            ignore_order=True,
            significant_digits=2,
            math_epsilon=tolerance,
        )
        if diff:
            raise AssertionError(f"Cross-backend conformance diff detected:\n{diff.pretty()}")

    return True
