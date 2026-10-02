#!/usr/bin/env python3
"""Package a validated native-boot NAND image and ROM for a GitHub Release."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
import zipfile

from bbk9288s_nand_image import NAND_RAW_SIZE


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def package(nand: Path, rom: Path, archive: Path) -> tuple[str, str]:
    if nand.stat().st_size != NAND_RAW_SIZE:
        raise ValueError("NAND must contain 131072 raw 2112-byte pages")
    if rom.stat().st_size != 240:
        raise ValueError("BOOT0.BIN must contain the 240-byte decoded ROM")
    if archive.exists() or archive.with_suffix(archive.suffix + ".sha256").exists():
        raise ValueError(f"release output already exists: {archive}")
    nand_hash = sha256(nand)
    rom_hash = sha256(rom)
    archive.parent.mkdir(parents=True, exist_ok=True)
    readme = (
        "BBK 9288 native boot NAND for emulator use.\n"
        "Extract this ZIP over the Windows emulator directory, then run "
        "run-bbk9288-web.cmd.\n"
        "The default launcher executes BOOT0.BIN and reads the original "
        "NAND boot pages.\n"
        "The emulator saves guest writes to nand-user.raw; keep a backup "
        "of this ZIP.\n\n"
        f"nand-user.raw SHA-256: {nand_hash}\n"
        f"BOOT0.BIN SHA-256: {rom_hash}\n"
    )
    with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED,
                         compresslevel=6, allowZip64=True) as output:
        output.write(nand, "runtime/nand-user.raw")
        output.write(rom, "runtime/BOOT0.BIN")
        output.writestr("runtime/README.txt", readme)
    archive_hash = sha256(archive)
    archive.with_suffix(archive.suffix + ".sha256").write_text(
        f"{archive_hash}  {archive.name}\n", encoding="ascii"
    )
    return nand_hash, archive_hash


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--nand", type=Path, required=True)
    parser.add_argument("--boot-rom", type=Path, required=True)
    parser.add_argument("--archive", type=Path, required=True)
    args = parser.parse_args()
    try:
        nand_hash, archive_hash = package(args.nand, args.boot_rom, args.archive)
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    print(f"NAND SHA-256: {nand_hash}")
    print(f"Archive SHA-256: {archive_hash}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
