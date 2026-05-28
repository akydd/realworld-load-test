# RealWorld Load Test

A [k6](https://k6.io) load test suite for any [RealWorld](https://github.com/gothinkster/realworld) spec-compliant backend API.

## What it simulates

Three concurrent user populations run for the full test duration:

| Scenario | Rate | Behaviour |
|---|---|---|
| `anonymous_reader` | 60 req/min | Browses article lists by tag and reads individual articles with their comments |
| `authenticated_reader` | 20 req/min | Logs in, reads the feed, favorites articles |
| `content_creator` | 5 req/min | Registers a new user, publishes an article, leaves a comment on an existing article |

Before the scenarios start, a setup phase seeds 20 articles across 5 tags so readers have real content to browse from the first request.

## Running

**Prerequisites:** Docker

Copy the example env file and edit as needed:

```bash
cp .env.example .env
```

Run the load test:

```bash
docker compose run --rm k6
```

### Pointing at a different backend

Set `BASE_URL` in your `.env` file:

```bash
# Local server running on the host machine (default)
BASE_URL=http://host.docker.internal:8090

# Remote server
BASE_URL=https://api.example.com
```

`host.docker.internal` resolves to the host machine from inside the Docker container, so the default works for any backend running locally.

### Changing the duration

Set `DURATION` in your `.env` file. k6 duration format: `30m`, `1h`, `4h`.

```bash
DURATION=4h
```

### Running without Docker

If you have k6 installed locally:

```bash
BASE_URL=http://localhost:8090 DURATION=1h k6 run script.js
```

## Traffic rates

The default rates are conservative — well within what a modest server should handle. To scale them up, edit the `rate` values in the `options.scenarios` block in `script.js`. The rates are in requests per minute.

## Output

k6 prints a summary to stdout when the test completes, including:

- `http_req_duration` — latency percentiles (p50, p90, p95, p99)
- `http_req_failed` — error rate
- `http_reqs` — total request count per scenario

If your backend has Prometheus scraping enabled, you can observe the server-side impact (goroutine count, GC pressure, database query rate, etc.) in the Prometheus UI while the test is running.
