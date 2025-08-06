from starlette.responses import Response, StreamingResponse, AsyncContentStream
from typing import cast, TypeVar, Type, Optional
import json

T = TypeVar('T', bound=BaseException)

def find_exception_in_chain(exception: BaseException, target_type: Type[T]) -> Optional[T]:
    """
    Recursively search for an exception of the specified type in the exception chain.

    Args:
        exception: The exception to search.
        target_type: The target exception type.

    Returns:
        The found exception instance, or None if not found.
    """
    current = exception
    depth = 0
    max_depth = 20  # Prevent infinite loop
    
    while current and depth < max_depth:
        if isinstance(current, target_type):
            return current
        
        current = getattr(current, '__context__', None)
        depth += 1
    
    return None

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

def convert_to_openai_message(message: dict):
    content = message.get('content')

    if isinstance(content, list):
        content_list = content
    else:
        content_list = [content]

    messages = []
    for content_item in content_list:
        new_message = message.copy()

        if isinstance(content_item, dict):
            content_type = content_item.get("type")

            if content_type == "text":
                new_message['content'] = content_item.get('text', '')
            elif content_type == "tool_use":
                new_message['content'] = None
                new_message['tool_calls'] = [{
                    "id": content_item.get('id', ''),
                    "type": "function",
                    "function": {
                        "name": content_item.get('name', ''),
                        "arguments": json.dumps(content_item.get('input', {}))
                    }
                }]
            elif content_type == "tool_result":
                new_message['role'] = 'tool'
                new_message['tool_call_id'] = content_item.get('tool_use_id', '')

                tool_content = content_item.get('content', '')
                if isinstance(tool_content, list):
                    text_parts = []
                    for item in tool_content:
                        if isinstance(item, dict) and item.get('type') == 'text':
                            text_parts.append(item.get('text', ''))
                        else:
                            text_parts.append(str(item))
                    new_message['content'] = '\n'.join(text_parts)
                else:
                    new_message['content'] = str(tool_content)
            else:
                new_message['content'] = content_item
        else:
            new_message['content'] = content_item

        messages.append(new_message)

    return messages