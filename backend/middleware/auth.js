
const jwt = require('jsonwebtoken');

var JWT_SECRET = 'qr-attendance-secret-key-2026';

function auth(req, res, next) {
    try {
        var authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
        var token = '';

        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        } else if (authHeader) {
            token = authHeader;
        }

        if (!token || token === 'null' || token === 'undefined') {
            console.log('AUTH: No token provided');
            return res.status(401).json({ error: 'No token provided' });
        }

        jwt.verify(token, JWT_SECRET, function(err, decoded) {
            if (err) {
                console.log('AUTH: Token failed:', err.message);
                return res.status(401).json({ error: 'Invalid or expired token' });
            }
            console.log('AUTH: OK -', decoded.username, decoded.role);
            req.user = decoded;
            next();
        });
    } catch (error) {
        console.log('AUTH: Error:', error.message);
        return res.status(401).json({ error: 'Authentication failed' });
    }
}

module.exports = auth;

