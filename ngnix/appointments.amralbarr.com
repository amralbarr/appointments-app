server {
    listen 80;
    server_name appointments.amralbarr.com;
    return 301 https://appointments.amralbarr.com$request_uri;
}

server {
    listen 443 ssl http2;
    server_name appointments.amralbarr.com;
    ssl_certificate /etc/letsencrypt/live/appointments.amralbarr.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/appointments.amralbarr.com/privkey.pem;

    # Socket.IO's browser client connects directly to the backend (see
    # frontend/src/lib/socket.ts's own comment on why - no server-rendered
    # page to proxy it through the BFF with), so it needs to be reachable
    # under this same public origin rather than the backend's own internal
    # localhost:6410 the browser can never reach. Socket.IO's transport
    # path is always /socket.io/ regardless of which namespace a client
    # connects to - matched before the catch-all location so it never
    # falls through to the frontend instead.
    location /socket.io/ {
        proxy_pass http://127.0.0.1:6410;
        include proxy_params;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location / {
        proxy_pass http://127.0.0.1:6411;
        include proxy_params;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
