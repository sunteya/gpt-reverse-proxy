import os
import re
from datetime import datetime
from http import HTTPStatus
from pathlib import Path

from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send
import logging
from app.config import Settings

uvicorn_logger = logging.getLogger("uvicorn.info")

def generate_log_file_path(request_path: str) -> Path:
    clean_path = re.sub(r'[<>:"|*?]', "_", request_path.split("?")[0])
    if clean_path.startswith("/"):
        clean_path = clean_path[1:]
    if clean_path.endswith("/"):
        clean_path = clean_path[:-1]
    clean_path = clean_path or "root"
    log_dir = Path("log") / Path(*clean_path.split("/"))
    log_dir.mkdir(parents=True, exist_ok=True)
    file_timestamp = datetime.now().strftime("%Y%m%d%H%M%S%f")[:-3]
    return log_dir / f"{file_timestamp}.txt"


def log_request_chunk(log_file: Path, chunk_index: int, chunk: bytes):
    log_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    content = os.linesep.join([
        f"==== REQUEST CHUNK - {chunk_index} [{log_timestamp}] ====",
        chunk.decode('utf-8', errors='ignore'),
        ""
    ])
    with log_file.open("a") as f:
        f.write(content)


def log_response_chunk(log_file: Path, chunk_index: int, chunk: bytes):
    log_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    content = os.linesep.join([
        f"==== RESPONSE CHUNK - {chunk_index} [{log_timestamp}] ====",
        chunk.decode('utf-8', errors='ignore'),
        ""
    ])
    with log_file.open("a") as f:
        f.write(content)


class FullLoggingMiddleware:
    def __init__(self, app: ASGIApp, settings: Settings):
        self.app = app
        self.settings = settings

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http" or not self.settings.dump_http_content:
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        log_file = generate_log_file_path(request.url.path)
        uvicorn_logger.info(f"Request start logged to: {log_file}")

        log_content = [f"==== REQUEST [{datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]}] ===="]
        log_content.append(f"{request.method} {request.url}")
        for key, value in request.headers.items():
            log_content.append(f"{key}: {value}")

        with log_file.open("a") as f:
            f.write(os.linesep.join(log_content))
            f.write(os.linesep * 2)

        req_chunk_index = 0

        async def logging_receive() -> Message:
            nonlocal req_chunk_index
            message = await receive()
            if message["type"] == "http.request":
                body = message.get("body", b"")
                if body:
                    log_request_chunk(log_file, req_chunk_index, body)
                    req_chunk_index += 1
                if not message.get("more_body", False):
                    with log_file.open("a") as f:
                        f.write("==== REQUEST BODY COMPLETE ====" + os.linesep * 2)
            return message

        res_chunk_index = 0
        original_send = send

        async def logging_send(message: Message):
            nonlocal res_chunk_index
            if message["type"] == "http.response.start":
                status_code = message["status"]
                try:
                    status_phrase = HTTPStatus(status_code).phrase
                except ValueError:
                    status_phrase = ""

                log_content = [
                    f"==== RESPONSE [{datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]}] ====",
                    f"HTTP/1.1 {status_code} {status_phrase}",
                ]
                for key, value in message["headers"]:
                    log_content.append(f"{key.decode()}: {value.decode()}")
                with log_file.open("a") as f:
                    f.write(os.linesep.join(log_content))
                    f.write(os.linesep * 2)

            elif message["type"] == "http.response.body":
                body = message.get("body", b"")
                if body:
                    log_response_chunk(log_file, res_chunk_index, body)
                    res_chunk_index += 1
                if not message.get("more_body", False):
                    with log_file.open("a") as f:
                        f.write("==== RESPONSE BODY COMPLETE ====" + os.linesep * 2)
            await original_send(message)

        await self.app(scope, logging_receive, logging_send)
