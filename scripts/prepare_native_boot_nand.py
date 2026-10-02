#!/usr/bin/env python3
"""Build a native-boot NAND test image without changing any input image."""

from __future__ import annotations

import argparse
from pathlib import Path
import shutil
import struct
import zlib

from bbk9288s_nand_image import (
    NAND_RAW_SIZE, PAGE_DATA_SIZE, RAW_PAGE_SIZE, SECTORS_PER_PAGE,
    SECTOR_SIZE, ecc256,
)

BOOT_PAGES = 128
KERNEL_FIRST_PAGE = 256
KERNEL_PAGES = 1664
FIRST_LEGACY_PAGE = 2560
ERASED_ECC = b"\xff" * 3
CAPTURE_HEADER = struct.Struct("<8sIIII4sI")
CAPTURE_TRAILER = struct.Struct("<8sII")


def check_size(path: Path, expected: int) -> None:
    actual = path.stat().st_size
    if actual != expected:
        raise ValueError(f"{path}: expected {expected} bytes, got {actual}")


def read_kernel_pages(path: Path) -> bytes:
    data = path.read_bytes()
    raw_size = KERNEL_PAGES * RAW_PAGE_SIZE
    if len(data) == raw_size:
        return data
    if len(data) != CAPTURE_HEADER.size + raw_size + CAPTURE_TRAILER.size:
        raise ValueError(f"unexpected kernel page capture size: {len(data)}")
    magic, index, first, count, page_size, nand_id, flags = (
        CAPTURE_HEADER.unpack_from(data)
    )
    if (magic, index, first, count, page_size, nand_id, flags) != (
        b"B7DUMP01", 0, KERNEL_FIRST_PAGE, KERNEL_PAGES,
        RAW_PAGE_SIZE, b"\xad\xda\x80\x15", 2,
    ):
        raise ValueError("invalid v7 capture header or NAND ID")
    payload = data[CAPTURE_HEADER.size:-CAPTURE_TRAILER.size]
    end_magic, recorded_crc, recorded_count = CAPTURE_TRAILER.unpack_from(
        data, len(data) - CAPTURE_TRAILER.size
    )
    if (end_magic, recorded_crc, recorded_count) != (
        b"B7END001", zlib.crc32(payload), KERNEL_PAGES
    ):
        raise ValueError("invalid v7 capture trailer or CRC")
    return payload


def fill_missing_ecc(page: bytearray) -> bool:
    changed = False
    for sector in range(SECTORS_PER_PAGE):
        data = page[sector * SECTOR_SIZE:(sector + 1) * SECTOR_SIZE]
        slot = PAGE_DATA_SIZE + sector * 16
        for offset, area in ((13, data[:256]), (8, data[256:])):
            if page[slot + offset:slot + offset + 3] == ERASED_ECC:
                expected = ecc256(area)
                if expected != ERASED_ECC:
                    page[slot + offset:slot + offset + 3] = expected
                    changed = True
    return changed


def build(base: Path, boot: Path, kernel: Path, output: Path) -> int:
    for path in (base, boot, kernel):
        if not path.is_file():
            raise ValueError(f"input does not exist: {path}")
    check_size(base, NAND_RAW_SIZE)
    check_size(boot, BOOT_PAGES * RAW_PAGE_SIZE)
    kernel_data = read_kernel_pages(kernel)
    if output.drive.upper() == "G:":
        raise ValueError("output must be on the computer, not the device G: drive")
    if output.exists():
        raise ValueError(f"output already exists: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    patched = 0
    with base.open("rb") as source, output.open("x+b") as dest:
        shutil.copyfileobj(source, dest, 1024 * 1024)
        dest.seek(0)
        dest.write(boot.read_bytes())
        dest.seek(KERNEL_FIRST_PAGE * RAW_PAGE_SIZE)
        dest.write(kernel_data)
        for page_number in range(FIRST_LEGACY_PAGE, NAND_RAW_SIZE // RAW_PAGE_SIZE):
            dest.seek(page_number * RAW_PAGE_SIZE)
            page = bytearray(dest.read(RAW_PAGE_SIZE))
            if fill_missing_ecc(page):
                dest.seek(page_number * RAW_PAGE_SIZE + PAGE_DATA_SIZE)
                dest.write(page[PAGE_DATA_SIZE:])
                patched += 1
    return patched


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", type=Path, required=True,
                        help="original synthetic NAND image")
    parser.add_argument("--boot-pages", type=Path, required=True,
                        help="genuine raw physical pages 0..127")
    parser.add_argument("--kernel-pages", type=Path, required=True,
                        help="P2561919.BIN v7 capture or extracted raw pages")
    parser.add_argument("--output", type=Path, required=True,
                        help="new local test image; must not exist")
    args = parser.parse_args()
    try:
        patched = build(args.base, args.boot_pages, args.kernel_pages,
                        args.output)
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    print(f"native boot image: {args.output}; legacy ECC repaired on "
          f"{patched} pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
