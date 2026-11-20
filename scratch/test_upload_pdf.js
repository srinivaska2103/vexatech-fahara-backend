const http = require('http');

const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
const pdfData = '%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF';
const postBody = [
  '--' + boundary,
  'Content-Disposition: form-data; name="file"; filename="test_ticket.pdf"',
  'Content-Type: application/pdf',
  '',
  pdfData,
  '--' + boundary + '--',
  ''
].join('\r\n');

const req = http.request({
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/v1/uploads',
  method: 'POST',
  headers: {
    'Content-Type': 'multipart/form-data; boundary=' + boundary,
    'Content-Length': Buffer.byteLength(postBody)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('BODY:', body);
    process.exit(res.statusCode === 200 ? 0 : 1);
  });
});

req.on('error', err => {
  console.error('Request error:', err.message);
  process.exit(1);
});

req.write(postBody);
req.end();
