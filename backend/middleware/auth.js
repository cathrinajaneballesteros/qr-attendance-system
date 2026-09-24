
var jwt = require('jsonwebtoken');
var JWT_SECRET = process.env.JWT_SECRET || 'qr-attendance-secret-key-2025';

function auth(req, res, next) {
    try {
        var authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided.' });
        }

        var token = authHeader.split(' ')[1];
        var decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }
}

module.exports = auth;

