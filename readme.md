# RealWorld Load Test

A [k6](https://k6.io) load test suite for any [RealWorld](https://github.com/gothinkster/realworld) spec-compliant backend API.

## What it simulates

Three concurrent user populations run for the full test duration:

| Scenario | Rate | Behaviour |
|---|---|---|
| `anonymous_reader` | 60 req/min | Browses article lists by tag (70%) and reads individual articles with comments (30%) |
| `authenticated_reader` | 20 req/min | Logs in as a seed user, reads feed, favorites a random article |
| `content_creator` | 5 req/min | Registers a fresh user, publishes an article, leaves a comment |

## Seed data

Before the load test starts, a seeder container connects directly to the database and inserts:

| Entity | Count | Notes |
|---|---|---|
| Users | 1,000 | `seed-user-1` through `seed-user-1000`, all with password `Password1!` |
| Tags | 50 | Realistic topic tags (go, kubernetes, machine-learning, etc.) |
| Articles | 10,000 | Spread across users and tags, timestamped over the past year |
| Article tags | ~15,000 | 1–2 tags per article |
| Follows | 10,000 | Each user follows 10 others, evenly distributed |
| Favorites | 20,000 | Each user has 20 favorites, evenly distributed |
| Comments | 10,000 | One per article, distributed across users |

Seeding inserts directly via SQL rather than HTTP, so the full dataset is ready in seconds. All inserts use `ON CONFLICT DO NOTHING`, so the seeder is safe to run against a database that already has seed data — it will complete immediately and k6 will start normally.

## Running

**Prerequisites:** Docker, and a running RealWorld backend.

Copy the example env file and edit as needed:

```bash
cp .env.example .env
```

Run the load test:

```bash
docker compose run --rm k6
```

The seeder runs first, waits for the app's `/api/healthcheck` to respond, then seeds the database. k6 starts automatically once seeding is complete.

### Pointing at a different backend

Edit `BASE_URL` and the `DB_*` variables in your `.env` file:

```bash
# Local backend (default)
BASE_URL=http://host.docker.internal:8090
DB_HOST=host.docker.internal
DB_PORT=8095     # the host-mapped postgres port

# Remote backend
BASE_URL=https://api.example.com
DB_HOST=db.example.com
DB_PORT=5432
```

`host.docker.internal` resolves to the host machine from inside Docker, so the defaults work for any backend running locally without extra configuration.

### Changing the duration

```bash
DURATION=4h docker compose run --rm k6
```

Or set `DURATION` in your `.env` file. k6 duration format: `30m`, `1h`, `4h`.

### Running without Docker

If you have k6 and psql installed locally, seed and run separately:

```bash
PGPASSWORD=password psql -h localhost -p 8095 -U admin -d app -f seed/seed.sql
BASE_URL=http://localhost:8090 DURATION=1h k6 run script.js
```

## Output

k6 prints a live summary to stdout and a final report when the test completes, including:

- `http_req_duration` — latency percentiles (p50, p90, p95, p99)
- `http_req_failed` — error rate
- `http_reqs` — total and per-scenario request counts

If your backend has Prometheus scraping enabled, you can observe the server-side impact (goroutines, GC, Postgres query rate, row throughput, etc.) in real time at `http://localhost:9090` while the test is running.

## Adjusting traffic rates

The default rates are conservative — suitable for a local development setup. To increase load, edit the `rate` values in `script.js`:

```javascript
anonymous_reader: {
  rate: 60,      // requests per minute — increase this
  ...
},
```

To simulate a traffic spike, switch the executor to `ramping-arrival-rate` and define stages.
