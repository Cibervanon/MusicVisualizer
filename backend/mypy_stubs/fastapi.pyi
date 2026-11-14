# Stub for fastapi
from typing import Any, Callable, TypeVar

T = TypeVar("T")

class FastAPI:
    def __init__(self, **kwargs: Any) -> None: ...
    def add_middleware(self, middleware: type, **options: Any) -> None: ...
    def include_router(self, router: Any, **kwargs: Any) -> None: ...
    def add_exception_handler(self, exc: type, handler: Callable) -> None: ...
    def on_event(self, event: str) -> Callable[[Callable], Callable]: ...

def Depends(dependency: Callable[..., T]) -> T: ...

class APIRouter:
    def __init__(self, **kwargs: Any) -> None: ...

class HTTPException(Exception):
    def __init__(self, status_code: int, detail: Any = None) -> None: ...
    status_code: int
    detail: Any

class Request:
    headers: dict
    url: Any

class Response:
    pass

class FileResponse:
    def __init__(self, path: str, media_type: str = None, headers: dict = None, filename: str = None) -> None: ...