from starlette.responses import Response, StreamingResponse, AsyncContentStream
from typing import cast

async def read_response_body(response: Response) -> bytes:
    if hasattr(response, 'body_iterator'):
        chunks = []
        body_iterator = cast(AsyncContentStream, getattr(response, 'body_iterator'))
        async for chunk in body_iterator:
            if isinstance(chunk, bytes):
                chunks.append(chunk)
            elif isinstance(chunk, str):
                chunks.append(chunk.encode('utf-8'))
            else:
                chunks.append(bytes(chunk))
        return b"".join(chunks)

    elif hasattr(response, 'body'):
        body = response.body
        if isinstance(body, (memoryview, bytearray)):
            return bytes(body)
        elif isinstance(body, bytes):
            return body
        elif isinstance(body, str):
            return body.encode('utf-8')

    for attr_name in ['content', '_content', 'data']:
        if hasattr(response, attr_name):
            content = getattr(response, attr_name)
            if isinstance(content, (bytes, bytearray)):
                return bytes(content)
            elif isinstance(content, str):
                return content.encode('utf-8')

    return b""
