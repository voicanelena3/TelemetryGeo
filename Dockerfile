# Folosim o imagine de Nginx extrem de ușoară ca bază
FROM nginx:alpine

# Copiem toate fișierele statice ale aplicației în directorul implicit servit de Nginx
COPY . /usr/share/nginx/html

# Nginx ascultă implicit pe portul 80, deci îl expunem în container
EXPOSE 80

# Comanda pentru a rula Nginx în prim-plan (foreground) în container
CMD ["nginx", "-g", "daemon off;"]
