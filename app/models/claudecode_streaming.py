class ClaudeCodeStreamingResponseWrapper:
    def __init__(self, original_iterator):
        self.original_iterator = original_iterator
        self.buffer = b""

    def __aiter__(self):
        return self

    def fix_litellm_malformed_data(self, data):
        import json
        
        try:
            parsed_data = json.loads(data)
            if isinstance(parsed_data, dict) and 'error' in parsed_data:
                error_content = parsed_data['error']
            else:
                error_content = {"type": "overloaded_error", "message": str(parsed_data)}
            error_data = {"type": "error", "error": error_content}
            mock_data = f"event: error\ndata: {json.dumps(error_data)}\n\n"
        except json.JSONDecodeError:
            error_data = {"type": "error", "error": {"type": "overloaded_error", "message": data}}
            mock_data = f"event: error\ndata: {json.dumps(error_data)}\n\n"
        
        return mock_data.encode('utf-8')

    async def __anext__(self):
        try:
            chunk = await self.original_iterator.__anext__()
            self.buffer += chunk
            
            while b'\n\n' in self.buffer:
                message_end_index = self.buffer.find(b'\n\n')
                message_to_process = self.buffer[:message_end_index]
                self.buffer = self.buffer[message_end_index + 2:]

                message_str = message_to_process.decode('utf-8')
                event = None
                data = None
                for line in message_str.split('\n'):
                    if line.startswith('event:'):
                        event = line[len('event:'):].strip()
                    elif line.startswith('data:'):
                        data = line[len('data:'):].strip()
                
                if data and not event:
                    print(f"[ClaudeCodeStreamingResponseWrapper] Fixing litellm malformed data: {data}", flush=True)
                    return self.fix_litellm_malformed_data(data)

            return chunk
        except StopAsyncIteration:
            if self.buffer:
                message_str = self.buffer.decode('utf-8')
                event = None
                data = None
                for line in message_str.split('\n'):
                    if line.startswith('event:'):
                        event = line[len('event:'):].strip()
                    elif line.startswith('data:'):
                        data = line[len('data:'):].strip()
                
                if data and not event:
                    print(f"[ClaudeCodeStreamingResponseWrapper] Fixing final litellm malformed data: {data}", flush=True)
                    return self.fix_litellm_malformed_data(data)
            raise
