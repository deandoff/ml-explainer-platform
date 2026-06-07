#!/usr/bin/env bash

set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/ml-explainer}"
BACKEND_IMAGE="${BACKEND_IMAGE:?BACKEND_IMAGE is required}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:?FRONTEND_IMAGE is required}"
COMPOSE_FILE="$APP_DIR/compose.prod.yml"
IMAGE_ENV_FILE="$APP_DIR/.env.images"
PRODUCTION_ENV_FILE="$APP_DIR/.env.production"

cd "$APP_DIR"

if [[ ! -f "$PRODUCTION_ENV_FILE" ]]; then
    echo "Missing $PRODUCTION_ENV_FILE" >&2
    exit 1
fi

if [[ -f "$IMAGE_ENV_FILE" ]]; then
    cp "$IMAGE_ENV_FILE" "$IMAGE_ENV_FILE.previous"
fi

umask 077
cat > "$IMAGE_ENV_FILE.tmp" <<EOF
BACKEND_IMAGE=$BACKEND_IMAGE
FRONTEND_IMAGE=$FRONTEND_IMAGE
EOF
mv "$IMAGE_ENV_FILE.tmp" "$IMAGE_ENV_FILE"

compose() {
    docker compose --env-file "$IMAGE_ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

show_diagnostics() {
    compose ps || true
    compose logs --tail=150 backend celery-worker frontend || true
}

wait_for_healthy_service() {
    local service="$1"
    local container_id
    local status

    for _ in {1..60}; do
        container_id="$(compose ps -q "$service")"
        if [[ -n "$container_id" ]]; then
            status="$(docker inspect \
                --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
                "$container_id")"

            case "$status" in
                healthy)
                    return 0
                    ;;
                unhealthy|exited|dead)
                    echo "$service entered state: $status" >&2
                    return 1
                    ;;
            esac
        fi

        sleep 5
    done

    echo "Timed out waiting for $service" >&2
    return 1
}

wait_for_running_service() {
    local service="$1"
    local container_id
    local status

    for _ in {1..30}; do
        container_id="$(compose ps -q "$service")"
        if [[ -n "$container_id" ]]; then
            status="$(docker inspect --format '{{.State.Status}}' "$container_id")"
            if [[ "$status" == "running" ]]; then
                return 0
            fi
            if [[ "$status" =~ ^(exited|dead)$ ]]; then
                echo "$service entered state: $status" >&2
                return 1
            fi
        fi

        sleep 5
    done

    echo "Timed out waiting for $service" >&2
    return 1
}

trap show_diagnostics ERR

compose pull backend celery-worker frontend
compose up -d --remove-orphans

wait_for_healthy_service postgres
wait_for_healthy_service redis
wait_for_healthy_service backend
wait_for_healthy_service frontend
wait_for_running_service celery-worker

curl --fail --silent --show-error --head http://127.0.0.1:8080/ > /dev/null

compose ps
echo "Deployment completed successfully"
