/**
 * Request/Response Logger Middleware for Express
 * Standardized formatted terminal logging (Method, Path, Query/Body, Status Code, Duration, Response Body)
 */
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const { method, originalUrl, body, query, ip } = req;

  // Mask sensitive credentials in logged request body
  const sanitizedBody = { ...body };
  if (sanitizedBody.password) sanitizedBody.password = '***';
  if (sanitizedBody.confirmPassword) sanitizedBody.confirmPassword = '***';
  if (sanitizedBody.newPassword) sanitizedBody.newPassword = '***';
  if (sanitizedBody.card_number) sanitizedBody.card_number = '***';
  if (sanitizedBody.cvv) sanitizedBody.cvv = '***';

  console.log(`\n======================================================================`);
  console.log(`📥 [INCOMING REQUEST] ${timestamp}`);
  console.log(`   Method : ${method}`);
  console.log(`   Path   : ${originalUrl}`);
  console.log(`   IP     : ${ip}`);
  if (Object.keys(query || {}).length > 0) {
    console.log(`   Query  :`, JSON.stringify(query));
  }
  if (Object.keys(sanitizedBody || {}).length > 0) {
    console.log(`   Body   :`, JSON.stringify(sanitizedBody, null, 2));
  }

  // Intercept response send to log outgoing status and payload summary
  const originalSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const statusIcon = statusCode < 400 ? '🟢' : '🔴';

    console.log(`\n📤 [OUTGOING RESPONSE] ${statusIcon} ${method} ${originalUrl}`);
    console.log(`   Status : ${statusCode}`);
    console.log(`   Time   : ${duration}ms`);

    try {
      if (typeof data === 'string') {
        const parsed = JSON.parse(data);
        const copy = { ...parsed };
        if (copy.accessToken) copy.accessToken = copy.accessToken.slice(0, 15) + '...';
        if (copy.refreshToken) copy.refreshToken = copy.refreshToken.slice(0, 15) + '...';
        console.log(`   Payload:`, JSON.stringify(copy, null, 2));
      } else if (typeof data === 'object') {
        console.log(`   Payload:`, JSON.stringify(data, null, 2));
      }
    } catch (e) {
      console.log(`   Payload: [Raw Text / Buffer ${data ? String(data).length : 0} bytes]`);
    }

    console.log(`======================================================================\n`);
    return originalSend.apply(res, arguments);
  };

  next();
};

module.exports = requestLogger;
