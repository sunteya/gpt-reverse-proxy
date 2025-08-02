from starlette.responses import Response, StreamingResponse

async def read_response_body(response: Response) -> bytes:
    if isinstance(response, StreamingResponse):
        chunks = []
        async for chunk in response.body_iterator:
            chunks.append(chunk)
        return b"".join(chunks)

    elif hasattr(response, 'body'):
        # 普通 Response 有 body 属性
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
