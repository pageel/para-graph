"""
Sample Python fixture for para-graph SSEC testing.
Tests: class, function, method, imports, calls.
"""

import os
from pathlib import Path
from typing import List, Optional


class FileService:
    """Manages file operations within a base directory."""

    def __init__(self, base_dir: str):
        self.base_dir = Path(base_dir)

    def list_files(self, pattern: str = "*") -> List[Path]:
        """List files matching a glob pattern."""
        return list(self.base_dir.glob(pattern))

    def read_file(self, name: str) -> Optional[str]:
        """Read file contents, return None if not found."""
        target = self.base_dir / name
        if target.exists():
            return target.read_text()
        return None


class CacheManager:
    """Simple in-memory cache with TTL."""

    def __init__(self, ttl: int = 300):
        self._store: dict = {}
        self._ttl = ttl

    def get(self, key: str):
        return self._store.get(key)

    def set(self, key: str, value):
        self._store[key] = value


def process_file(filepath: str) -> str:
    """Read and process a single file."""
    service = FileService(os.path.dirname(filepath))
    content = service.read_file(os.path.basename(filepath))
    return content or ""


def batch_process(directory: str, pattern: str = "*.txt") -> List[str]:
    """Process all matching files in a directory."""
    service = FileService(directory)
    results = []
    for f in service.list_files(pattern):
        results.append(process_file(str(f)))
    return results
