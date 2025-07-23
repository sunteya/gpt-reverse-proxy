import fs from 'fs';

function parseLogFile(filePath: string) {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  // Normalize line endings to handle Windows (CRLF), Mac (CR), and Linux (LF)
  const lines = fileContent.replace(/\r\n/g, '\n').replace(/\n/g, '\n').split('\n');

  const request = {
    method: '',
    path: '',
    httpVersion: '',
    headers: {} as Record<string, string>,
    body: ''
  };

  const response = {
    httpVersion: '',
    statusCode: '',
    statusMessage: '',
    headers: {} as Record<string, string>,
    body: ''
  };

  let currentSection = '';
  const requestBodyChunks: string[] = [];
  const responseBodyChunks: string[] = [];
  let readingHeaders = false;

  for (const line of lines) {
    if (line.startsWith('==== REQUEST [')) {
      currentSection = 'request';
      readingHeaders = true;
      continue;
    } else if (line.startsWith('==== RESPONSE [')) {
      currentSection = 'response';
      readingHeaders = true;
      continue;
    } else if (line.startsWith('==== REQUEST CHUNK -')) {
      currentSection = 'request-chunk';
      continue;
    } else if (line.startsWith('==== CHUNK -')) {
      currentSection = 'response-chunk';
      continue;
    } else if (line.startsWith('==== REQUEST BODY COMPLETE') || line.startsWith('data: [DONE]')) {
      currentSection = ''; // Stop capturing content after this
      continue;
    }

    if (readingHeaders) {
        if (line.trim() === '') {
            readingHeaders = false;
            continue;
        }
        if (currentSection === 'request') {
            if (!request.method) {
                const [method, reqPath, httpVersion] = line.split(' ');
                request.method = method;
                request.path = reqPath;
                request.httpVersion = httpVersion;
            } else {
                const [key, ...valueParts] = line.split(': ');
                if (key && valueParts.length > 0) request.headers[key.trim()] = valueParts.join(': ').trim();
            }
        } else if (currentSection === 'response') {
            if (!response.statusCode) {
                const parts = line.split(' ');
                response.httpVersion = parts[0];
                response.statusCode = parts[1];
                response.statusMessage = parts.slice(2).join(' ');
            } else {
                const [key, ...valueParts] = line.split(': ');
                if (key && valueParts.length > 0) response.headers[key.trim()] = valueParts.join(': ').trim();
            }
        }
    } else if (currentSection === 'request-chunk') {
        if(line.trim() !== '') requestBodyChunks.push(line);
    } else if (currentSection === 'response-chunk') {
        if(line.trim() !== '') responseBodyChunks.push(line);
    }
  }

  // Process request body
  if(requestBodyChunks.length > 0) {
    const rawBody = requestBodyChunks.join('');
    try {
      const parsedJson = JSON.parse(rawBody);
      request.body = JSON.stringify(parsedJson, null, 2);
    } catch (e) {
      request.body = rawBody;
    }
  }

  // Process response body from SSE chunks or as a single JSON object
  let responseContent = '';
  const rawResponseBody = responseBodyChunks.join('').trim();

  if (rawResponseBody.startsWith('data:')) { // Heuristic for SSE
    responseContent = responseBodyChunks
      .join('\n')
      .split('\n')
      .filter(line => line.startsWith('data: '))
      .map(line => line.substring('data: '.length).trim())
      .filter(line => line && line !== '[DONE]')
      .map(jsonStr => {
        try {
            const parsed = JSON.parse(jsonStr);
            return parsed.choices[0].delta.content || '';
        } catch (e) {
            return ''; // Ignore malformed JSON parts
        }
    }).join('');
  } else { // Assume it's a complete (or fragmented) JSON body
    try {
      const parsedJson = JSON.parse(rawResponseBody);
      responseContent = JSON.stringify(parsedJson, null, 2);
    } catch (e) {
      responseContent = rawResponseBody; // Not a JSON body, use raw
    }
  }

  response.body = responseContent;

  // --- Output ---
  console.log('--- REQUEST ---');
  console.log(`${request.method} ${request.path} ${request.httpVersion}`);
  for (const [key, value] of Object.entries(request.headers)) {
    console.log(`${key}: ${value}`);
  }
  console.log();
  console.log(request.body);

  console.log();
  console.log('--- RESPONSE ---');
  console.log(`${response.httpVersion} ${response.statusCode} ${response.statusMessage}`);
  for (const [key, value] of Object.entries(response.headers)) {
    console.log(`${key}: ${value}`);
  }
  console.log();
  console.log(response.body);
}


if (process.argv.length < 3) {
  console.error('Usage: ts-node parse_log.ts <path_to_log_file>');
  process.exit(1);
}

const logFilePath = process.argv[2];
if (!fs.existsSync(logFilePath)) {
  console.error(`File not found: ${logFilePath}`);
  process.exit(1);
}

parseLogFile(logFilePath); 