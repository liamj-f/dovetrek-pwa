# DoveTrek PWA

A Progressive Web App for planning optimal routes through Dovetrek competition checkpoints.

## Features

- Calculate best route through selected checkpoints within time constraints
- Find minimum walking speed needed to complete all checkpoints
- Works offline after first load
- Export routes to GPX for GPS devices
- Real-time progress tracking during the competition

## Running with Docker

### Option 1: Docker Compose (Recommended)

```bash
git clone https://github.com/cyclopsgd/dovetrek-pwa.git
cd dovetrek-pwa
docker compose up -d
```

The app will be available at `http://localhost`

To stop:
```bash
docker compose down
```

### Option 2: Docker Build

```bash
git clone https://github.com/cyclopsgd/dovetrek-pwa.git
cd dovetrek-pwa
docker build -t dovetrek-pwa .
docker run -p 80:80 dovetrek-pwa
```

### Option 3: Load from .tar file

If you received a `dovetrek-pwa.tar` file:

```bash
docker load -i dovetrek-pwa.tar
docker run -p 80:80 dovetrek-pwa
```

## Publishing to Docker Hub

To make the image publicly available:

```bash
# Login to Docker Hub
docker login

# Tag the image with your username
docker tag dovetrek-pwa yourusername/dovetrek-pwa

# Push to Docker Hub
docker push yourusername/dovetrek-pwa
```

Others can then run:
```bash
docker run -p 80:80 yourusername/dovetrek-pwa
```

## Running without Docker

This is a static site with no build step. Serve the files with any web server:

```bash
# Using Python
python -m http.server 8080

# Using Node.js
npx serve

# Using PHP
php -S localhost:8080
```

## Configuration

The app fetches competition data from the [Dovetrek data repository](https://github.com/liamj-f/Dovetrek). No configuration is required.

## License

MIT
