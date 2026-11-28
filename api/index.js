import app from '../server.js';

export default function handler(request, response) {
  const requestUrl = new URL(request.url, 'http://vercel.local');
  const originalPath = requestUrl.searchParams.get('__taskflow_path');
  requestUrl.searchParams.delete('__taskflow_path');

  if (originalPath) {
    const query = requestUrl.searchParams.toString();
    request.url = `/api/${originalPath}${query ? `?${query}` : ''}`;
  }

  app(request, response);
}
