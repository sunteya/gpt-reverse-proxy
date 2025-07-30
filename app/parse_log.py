import sys
import json
from urllib.parse import urlparse
import os

def parse_log_file(file_path: str):
    """
    Parses a log file to extract HTTP request and response details.
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    except FileNotFoundError:
        print(f"Error: Log file not found at {file_path}", file=sys.stderr)
        return
    except Exception as e:
        print(f"Error reading log file: {e}", file=sys.stderr)
        return

    request = {
        'method': '', 'path': '', 'http_version': 'HTTP/unknown',
        'headers': {}, 'body': ''
    }
    response = {
        'http_version': 'HTTP/unknown', 'status_code': '', 'status_message': '',
        'headers': {}, 'body': ''
    }

    current_section = None
    reading_headers = False
    request_body_chunks, response_body_chunks = [], []

    for line in lines:
        stripped_line = line.strip()

        if stripped_line.startswith('==== REQUEST ['):
            current_section, reading_headers = 'request', True
        elif stripped_line.startswith('==== RESPONSE ['):
            current_section, reading_headers = 'response', True
        elif stripped_line.startswith('==== REQUEST CHUNK -'):
            current_section = 'request-chunk'
        elif stripped_line.startswith(('==== RESPONSE CHUNK -', '==== CHUNK -')):
            current_section = 'response-chunk'
        elif stripped_line.startswith(('==== REQUEST BODY COMPLETE', '==== RESPONSE BODY COMPLETE')):
            current_section = None
        elif reading_headers:
            if not stripped_line:
                reading_headers = False
                continue
            
            target = request if current_section == 'request' else response
            if not target.get('method') and not target.get('status_code'):
                parts = stripped_line.split(' ', 2)
                if current_section == 'request':
                    target['method'] = parts[0]
                    try:
                        url = urlparse(' '.join(parts[1:]))
                        target['path'] = url.path + ('?' + url.query if url.query else '')
                    except Exception:
                        target['path'] = ' '.join(parts[1:])
                else:
                    if stripped_line.startswith('Status:'):
                        target['status_code'] = stripped_line.split(': ', 1)[1]
                    else:
                        target['http_version'] = parts[0]
                        target['status_code'] = parts[1]
                        target['status_message'] = parts[2] if len(parts) > 2 else ''
            elif ': ' in stripped_line:
                key, value = stripped_line.split(': ', 1)
                target['headers'][key] = value
        elif current_section == 'request-chunk':
            if stripped_line:
                request_body_chunks.append(stripped_line)
        elif current_section == 'response-chunk':
            if stripped_line:
                response_body_chunks.append(stripped_line)

    # Process request body
    if request_body_chunks:
        raw_body = ''.join(request_body_chunks)
        try:
            request['body'] = json.dumps(json.loads(raw_body), indent=2, ensure_ascii=False)
        except json.JSONDecodeError:
            request['body'] = raw_body

    # Process response body
    raw_response_body = os.linesep.join(response_body_chunks)
    if 'data:' in raw_response_body:
        content, tool_calls = process_streamed_response(raw_response_body)
        response['body'] = content or (json.dumps({"tool_calls": tool_calls}, indent=2, ensure_ascii=False) if tool_calls else "")
    else:
        try:
            response['body'] = json.dumps(json.loads(raw_response_body), indent=2, ensure_ascii=False)
        except (json.JSONDecodeError, TypeError):
            response['body'] = raw_response_body

    print_results(request, response)

def process_streamed_response(raw_body: str):
    full_content = ""
    tool_calls = []
    for line in raw_body.splitlines():
        if line.startswith('data: '):
            chunk_str = line.removeprefix('data: ').strip()
            if chunk_str == '[DONE]' or not chunk_str:
                continue
            try:
                chunk = json.loads(chunk_str)
                delta = chunk.get('choices', [{}])[0].get('delta', {})
                if delta.get('content'):
                    full_content += delta['content']
                if delta.get('tool_calls'):
                    for tc_chunk in delta.get('tool_calls'):
                        idx = tc_chunk['index']
                        while len(tool_calls) <= idx: tool_calls.append({})
                        merge_tool_call_chunk(tool_calls[idx], tc_chunk)
            except json.JSONDecodeError:
                pass
    
    for tc in tool_calls:
        if 'function' in tc and 'arguments' in tc['function']:
            try:
                tc['function']['arguments'] = json.loads(tc['function']['arguments'])
            except json.JSONDecodeError: pass # Keep as string if not valid JSON

    return full_content, tool_calls

def merge_tool_call_chunk(full_tc, chunk):
    if 'id' in chunk: full_tc['id'] = chunk['id']
    if 'type' in chunk: full_tc['type'] = chunk['type']
    if 'function' in chunk:
        if 'function' not in full_tc: full_tc['function'] = {}
        if 'name' in chunk['function']: full_tc['function']['name'] = chunk['function']['name']
        if 'arguments' in chunk['function']:
            if 'arguments' not in full_tc['function']: full_tc['function']['arguments'] = ""
            full_tc['function']['arguments'] += chunk['function']['arguments']

def print_results(request, response):
    print('--- REQUEST ---')
    print(f"{request['method']} {request['path']} {request.get('http_version', '')}")
    for key, value in request['headers'].items():
        print(f"{key}: {value}")
    print()
    if request['body']:
        print(request['body'])

    print()
    print('--- RESPONSE ---')
    print(f"{response.get('http_version', '')} {response['status_code']} {response['status_message']}")
    for key, value in response['headers'].items():
        print(f"{key}: {value}")
    print()
    if response['body']:
        print(response['body'])


def main():
    if len(sys.argv) < 2:
        print(f"Usage: python {sys.argv[0]} <path_to_log_file>", file=sys.stderr)
        sys.exit(1)
    
    log_file_path = sys.argv[1]
    if not os.path.exists(log_file_path):
        print(f"File not found: {log_file_path}", file=sys.stderr)
        sys.exit(1)

    parse_log_file(log_file_path)

if __name__ == "__main__":
    main()
