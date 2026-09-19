// Shared authentication helper for all pages
var token = localStorage.getItem('token');
var user = null;

try {
    user = JSON.parse(localStorage.getItem('user') || 'null');
} catch (e) {
    user = null;
}

if (!token || !user) {
    localStorage.clear();
    if (window.location.pathname.indexOf('index.html') === -1 && window.location.pathname !== '/') {
        window.location.href = 'index.html';
    }
}

function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
    };
}

async function authFetch(url, options) {
    if (!options) options = {};
    if (!options.headers) options.headers = {};
    options.headers['Authorization'] = 'Bearer ' + token;
    if (!options.headers['Content-Type'] && options.method !== 'GET') {
        options.headers['Content-Type'] = 'application/json';
    }

    try {
        var response = await fetch(url, options);

        if (response.status === 401 || response.status === 403) {
            // Token expired - try to check if server restarted
            var confirmRelogin = confirm('Your session has expired. Please login again.');
            if (confirmRelogin) {
                localStorage.clear();
                window.location.href = 'index.html';
            }
            return null;
        }

        return response;
    } catch (err) {
        console.error('Network error:', err);
        return null;
    }
}

function confirmLogout(e) {
    if (e) e.preventDefault();
    if (confirm('Are you sure you want to logout?')) {
        localStorage.clear();
        window.location.href = 'index.html';
    }
}
