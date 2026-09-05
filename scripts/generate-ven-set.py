#!/usr/bin/env python3
"""
Generate data/sets/ven.json from the Riftcodex read API.

Why this exists:
- Hextech's existing set files use the Riftcodex-shaped card object.
- Vendetta must preserve the same engine-facing structure.
- This script paginates the full VEN corpus and writes the cards as a JSON array.
- It validates the structural contract against an existing set JSON when supplied.

Usage:
    python scripts/generate-ven-set.py
    python scripts/generate-ven-set.py --output data/sets/ven.json
    python scripts/generate-ven-set.py --reference data/sets/unl.json

No third-party Python packages are required.
"""

from __future__ import annotations

import argparse
from html.parser import HTMLParser
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Iterable

RIFTCODEX_BASE = "https://api.riftcodex.com"
RIFTBOUND_GALLERY_URL = "https://playriftbound.com/en-us/card-gallery/"
SET_ID = "ven"
PAGE_SIZE = 100

CORE_TOP_LEVEL_KEYS = {
    "id",
    "name",
    "riftbound_id",
    "tcgplayer_id",
    "public_code",
    "collector_number",
    "attributes",
    "classification",
    "text",
    "set",
    "media",
    "tags",
    "orientation",
    "metadata",
}

CORE_NESTED_KEYS = {
    "attributes": {"energy", "might", "power"},
    "classification": {"type", "supertype", "rarity", "domain"},
    "set": {"set_id", "label"},
    "media": {"image_url", "artist", "accessibility_text"},
}

REQUIRED_METADATA_KEYS = {
    "clean_name",
    "alternate_art",
    "overnumbered",
    "signature",
}


def request_json(url: str) -> Any:
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "hextech-simulator-ven-set-generator/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        if response.status != 200:
            raise RuntimeError(f"GET {url} returned HTTP {response.status}")
        return json.load(response)


def request_text(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "text/html",
            "User-Agent": "hextech-simulator-ven-set-generator/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        if response.status != 200:
            raise RuntimeError(f"GET {url} returned HTTP {response.status}")
        return response.read().decode("utf-8")


class NextDataParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_next_data = False
        self.parts: list[str] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        if tag == "script" and dict(attrs).get("id") == "__NEXT_DATA__":
            self.in_next_data = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self.in_next_data:
            self.in_next_data = False

    def handle_data(self, data: str) -> None:
        if self.in_next_data:
            self.parts.append(data)


def find_gallery_cards(value: Any) -> list[dict[str, Any]] | None:
    if (
        isinstance(value, list)
        and value
        and all(isinstance(item, dict) for item in value)
        and all("id" in item and "publicCode" in item for item in value)
    ):
        return value

    if isinstance(value, dict):
        for nested in value.values():
            result = find_gallery_cards(nested)
            if result is not None:
                return result
    elif isinstance(value, list):
        for nested in value:
            result = find_gallery_cards(nested)
            if result is not None:
                return result

    return None


def fetch_public_codes() -> dict[str, str]:
    """
    Riftcodex v0.2 removed public_code from its Card response even though the
    existing Hextech set contract requires it. Read the printed value from
    Riot's official gallery and join it by the exact Riftbound card ID rather
    than attempting to derive special, variant, or star codes.
    """
    parser = NextDataParser()
    parser.feed(request_text(RIFTBOUND_GALLERY_URL))
    if not parser.parts:
        raise RuntimeError("Could not find __NEXT_DATA__ in the Riftbound gallery.")

    payload = json.loads("".join(parser.parts))
    cards = find_gallery_cards(payload)
    if cards is None:
        raise RuntimeError("Could not find card data in the Riftbound gallery.")

    result: dict[str, str] = {}
    for card in cards:
        card_id = card.get("id")
        public_code = card.get("publicCode")
        if not isinstance(card_id, str) or not isinstance(public_code, str):
            continue
        normalized_id = card_id.lower()
        if normalized_id in result and result[normalized_id] != public_code:
            raise RuntimeError(
                f"Conflicting public codes for {card_id}: "
                f"{result[normalized_id]!r} and {public_code!r}"
            )
        result[normalized_id] = public_code

    return result


def extract_cards(payload: Any) -> list[dict[str, Any]]:
    """
    Accept Riftcodex's paginated wrapper while remaining defensive against
    reasonable wrapper-name changes.
    """
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]

    if not isinstance(payload, dict):
        raise RuntimeError(
            f"Unexpected Riftcodex payload type: {type(payload).__name__}"
        )

    for key in ("items", "cards", "data", "results"):
        value = payload.get(key)
        if isinstance(value, list):
            return [x for x in value if isinstance(x, dict)]

    # Some APIs wrap results one level deeper.
    for value in payload.values():
        if isinstance(value, dict):
            for key in ("items", "cards", "data", "results"):
                nested = value.get(key)
                if isinstance(nested, list):
                    return [x for x in nested if isinstance(x, dict)]

    raise RuntimeError(
        "Could not identify the card list in the Riftcodex response. "
        f"Top-level keys: {sorted(payload.keys())}"
    )


def fetch_vendetta() -> list[dict[str, Any]]:
    all_cards: list[dict[str, Any]] = []
    page = 1

    while True:
        query = urllib.parse.urlencode(
            {
                "size": PAGE_SIZE,
                "set_id": SET_ID,
                "sort": "collector_number",
                "dir": 1,
                "page": page,
            }
        )
        url = f"{RIFTCODEX_BASE}/cards?{query}"
        payload = request_json(url)
        cards = extract_cards(payload)

        if not cards:
            break

        all_cards.extend(cards)

        if len(cards) < PAGE_SIZE:
            break

        page += 1

        # Defensive stop against a broken pagination contract.
        if page > 100:
            raise RuntimeError("Pagination exceeded 100 pages; refusing to continue.")

    return all_cards


def latest_update_key(card: dict[str, Any]) -> tuple[str, bool, str]:
    metadata = card.get("metadata")
    updated_on = metadata.get("updated_on", "") if isinstance(metadata, dict) else ""
    return str(updated_on), bool(card.get("new")), str(card.get("id", ""))


def deduplicate_cards(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Riftcodex currently retains older VEN reveal rows alongside refreshed rows.
    They share a riftbound_id but have different Riftcodex database IDs. Keep
    the most recently updated source row for each logical printing.
    """
    result: list[dict[str, Any]] = []
    positions: dict[str, int] = {}
    duplicate_rows = 0

    for card in cards:
        riftbound_id = card.get("riftbound_id")
        if not isinstance(riftbound_id, str) or not riftbound_id:
            result.append(card)
            continue

        normalized_id = riftbound_id.lower()
        existing_position = positions.get(normalized_id)
        if existing_position is None:
            positions[normalized_id] = len(result)
            result.append(card)
            continue

        duplicate_rows += 1
        if latest_update_key(card) > latest_update_key(result[existing_position]):
            result[existing_position] = card

    if duplicate_rows:
        print(
            "WARNING: Riftcodex returned "
            f"{len(cards)} rows for {len(result)} unique riftbound_id values; "
            f"kept the newest source row and discarded {duplicate_rows} stale rows.",
            file=sys.stderr,
        )

    return result


def restore_public_codes(
    cards: list[dict[str, Any]],
    public_codes: dict[str, str],
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []

    for card in cards:
        if isinstance(card.get("public_code"), str) and card["public_code"]:
            result.append(card)
            continue

        riftbound_id = card.get("riftbound_id")
        public_code = (
            public_codes.get(riftbound_id.lower())
            if isinstance(riftbound_id, str)
            else None
        )
        if public_code is None:
            raise RuntimeError(
                f"Card {riftbound_id or card.get('name')} is missing public_code "
                "and has no exact ID match in the official Riftbound gallery."
            )

        restored: dict[str, Any] = {}
        for key, value in card.items():
            if key == "collector_number":
                restored["public_code"] = public_code
            restored[key] = value
        result.append(restored)

    return result


def ensure_public_code(card: dict[str, Any]) -> None:
    """
    Riftcodex's docs list public_code as a sortable field and the existing
    Hextech set files carry it. Refuse to silently synthesize it because special
    VEN entries (Rxx, Txx, SPx, star printings) do not all follow one formula.
    """
    if not isinstance(card.get("public_code"), str) or not card["public_code"]:
        raise RuntimeError(
            f"Card {card.get('riftbound_id') or card.get('name')} is missing public_code."
        )


def normalize_clean_name(card: dict[str, Any]) -> None:
    metadata = card.get("metadata")
    if not isinstance(metadata, dict) or metadata.get("clean_name") is not None:
        return

    name = card.get("name")
    if not isinstance(name, str):
        raise RuntimeError(
            f"Card {card.get('riftbound_id')} cannot derive clean_name without a name."
        )

    clean_name = " ".join(
        "".join(
            character
            for character in name
            if character.isalnum() or character.isspace()
        ).split()
    )
    if not clean_name:
        raise RuntimeError(f"Card {card.get('riftbound_id')} has an empty clean_name.")
    metadata["clean_name"] = clean_name


def validate_card(card: dict[str, Any], index: int) -> None:
    missing = CORE_TOP_LEVEL_KEYS - card.keys()
    if missing:
        raise RuntimeError(
            f"Card #{index} ({card.get('name', '<unknown>')}) is missing "
            f"required keys: {sorted(missing)}"
        )

    for field, expected in CORE_NESTED_KEYS.items():
        value = card.get(field)
        if not isinstance(value, dict):
            raise RuntimeError(
                f"Card #{index} {field} must be an object, got "
                f"{type(value).__name__}."
            )
        missing_nested = expected - value.keys()
        if missing_nested:
            raise RuntimeError(
                f"Card #{index} {field} is missing keys: {sorted(missing_nested)}"
            )

    metadata = card.get("metadata")
    if not isinstance(metadata, dict):
        raise RuntimeError(f"Card #{index} metadata must be an object.")
    missing_metadata = REQUIRED_METADATA_KEYS - metadata.keys()
    if missing_metadata:
        raise RuntimeError(
            f"Card #{index} metadata is missing keys: {sorted(missing_metadata)}"
        )
    if not isinstance(metadata["clean_name"], str) or not metadata["clean_name"]:
        raise RuntimeError(f"Card #{index} metadata.clean_name must be a string.")

    if card["set"].get("set_id", "").upper() != "VEN":
        raise RuntimeError(
            f"Card #{index} is not Vendetta: {card['set'].get('set_id')!r}"
        )

    if not isinstance(card["classification"].get("domain"), list):
        raise RuntimeError(f"Card #{index} classification.domain must be an array.")

    if not isinstance(card.get("tags"), list):
        raise RuntimeError(f"Card #{index} tags must be an array.")

    if card.get("orientation") not in {"portrait", "landscape"}:
        raise RuntimeError(
            f"Card #{index} has invalid orientation {card.get('orientation')!r}."
        )

    ensure_public_code(card)


def canonicalize(cards: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Keep the Riftcodex object structure intact.

    Only discard Riftcodex's optional transient `new` marker, because the
    existing set files are source data rather than a 'new card' query result.
    """
    result: list[dict[str, Any]] = []
    seen_riftbound_ids: set[str] = set()

    for index, source in enumerate(cards, start=1):
        card = dict(source)
        card.pop("new", None)

        normalize_clean_name(card)
        validate_card(card, index)

        rid = card["riftbound_id"].lower()
        if rid in seen_riftbound_ids:
            raise RuntimeError(f"Duplicate riftbound_id: {card['riftbound_id']}")
        seen_riftbound_ids.add(rid)

        result.append(card)

    return result


def compare_reference_shape(
    vendetta: list[dict[str, Any]],
    reference_path: Path,
) -> None:
    reference = json.loads(reference_path.read_text(encoding="utf-8"))
    if not isinstance(reference, list) or not reference:
        raise RuntimeError(f"{reference_path} must contain a non-empty JSON array.")

    ref = reference[0]
    if not isinstance(ref, dict):
        raise RuntimeError(f"{reference_path} first entry must be an object.")

    # We compare the engine contract, not legacy/source-specific optional fields
    # such as ligamagic_id or updated_on.
    ref_core = CORE_TOP_LEVEL_KEYS & ref.keys()
    if ref_core != CORE_TOP_LEVEL_KEYS:
        missing = CORE_TOP_LEVEL_KEYS - ref_core
        raise RuntimeError(
            f"Reference set does not expose the expected core contract: "
            f"missing {sorted(missing)}"
        )

    for i, card in enumerate(vendetta, start=1):
        if CORE_TOP_LEVEL_KEYS - card.keys():
            raise RuntimeError(
                f"Vendetta card #{i} deviates from the reference core contract."
            )


def summarize(cards: list[dict[str, Any]]) -> str:
    base = 0
    over = 0
    special = 0
    for card in cards:
        public_code = card.get("public_code")
        if not isinstance(public_code, str):
            continue
        normalized_code = public_code.upper()
        if normalized_code.startswith(("VEN-R", "VEN-T", "VEN-SP")):
            special += 1
            continue
        if not normalized_code.startswith("VEN-") or not normalized_code.endswith(
            "/166"
        ):
            continue
        number = normalized_code.removeprefix("VEN-").removesuffix("/166")
        if number.isdigit():
            if int(number) <= 166:
                base += 1
            else:
                over += 1
    return (
        f"{len(cards)} Vendetta source entries "
        f"({base} base-numbered, {over} overnumbered, "
        f"{special} R/T/SP special entries)"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        default="data/sets/ven.json",
        help="Output JSON path (default: data/sets/ven.json)",
    )
    parser.add_argument(
        "--reference",
        default="data/sets/unl.json",
        help="Existing set JSON used to validate the common engine-facing shape.",
    )
    args = parser.parse_args()

    output = Path(args.output)
    reference = Path(args.reference)

    source_cards = deduplicate_cards(fetch_vendetta())
    cards = canonicalize(restore_public_codes(source_cards, fetch_public_codes()))

    if not cards:
        raise RuntimeError("Riftcodex returned no Vendetta cards.")

    if reference.exists():
        compare_reference_shape(cards, reference)

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(cards, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"Wrote {output}: {summarize(cards)}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
