# Imagine Nginx foarte usoara (Alpine) pentru servirea aplicatiei statice
FROM nginx:1.27-alpine

# Configuratia Nginx: fisiere statice + proxy catre Sentinel Hub (fara CORS)
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copiem doar fisierele aplicatiei
COPY index.html style.css /usr/share/nginx/html/
COPY js/  /usr/share/nginx/html/js/
COPY lib/ /usr/share/nginx/html/lib/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
