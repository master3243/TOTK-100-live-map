import argparse
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    in_path = Path(args.input)
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        from PIL import Image  # type: ignore
    except Exception as exc:
        print("ERROR: Pillow is required to convert PNG -> ICO.")
        print("Install it with: python -m pip install pillow")
        print(f"Details: {exc}")
        return 1

    img = Image.open(in_path).convert("RGBA")
    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    img.save(out_path, format="ICO", sizes=sizes)
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

